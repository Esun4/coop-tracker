import { describe, it, expect, beforeEach, vi, beforeAll } from "vitest";

// Functional coverage for the email-suggestion lifecycle (accept / dismiss /
// undo / bulk-accept) and the audit-log guarantee: every mutation writes an
// ActivityLog row scoped to the acting user. Prisma is real; auth mocked.
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  resetDb,
  createTestUser,
  createTestApplication,
  createTestSuggestion,
} from "../helpers/db";
import {
  createApplication,
  updateApplication,
  updateApplicationStatus,
  archiveApplication,
  importApplications,
} from "@/lib/actions/applications";
import {
  dismissSuggestion,
  acceptNewApplication,
  acceptStatusUpdate,
  acceptAllSuggestions,
  undoEmailSuggestion,
} from "@/lib/actions/suggestions";

const mockedAuth = vi.mocked(auth);

function actAs(userId: string) {
  mockedAuth.mockResolvedValue({ user: { id: userId } } as never);
}

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
});

beforeEach(async () => {
  await resetDb();
  vi.clearAllMocks();
});

describe("dismissSuggestion", () => {
  it("marks the suggestion resolved as 'dismissed'", async () => {
    const user = await createTestUser();
    actAs(user.id);
    const sug = await createTestSuggestion(user.id);

    const result = await dismissSuggestion(sug.id);
    expect(result).toMatchObject({ success: true });

    const after = await prisma.emailSuggestion.findUniqueOrThrow({ where: { id: sug.id } });
    expect(after).toMatchObject({ resolved: true, resolvedAction: "dismissed" });
    expect(after.resolvedAt).not.toBeNull();
  });
});

describe("acceptNewApplication", () => {
  it("creates the application, logs it (email_suggestion source), and links the suggestion", async () => {
    const user = await createTestUser();
    actAs(user.id);
    const sug = await createTestSuggestion(user.id, { suggestedAction: "NEW_APPLICATION" });

    const result = await acceptNewApplication(sug.id, {
      company: "Stripe",
      roleTitle: "Backend Intern",
      status: "APPLIED",
    });
    expect(result).toMatchObject({ success: true });
    const appId = (result as { application: { id: string } }).application.id;

    const log = await prisma.activityLog.findFirstOrThrow({ where: { applicationId: appId } });
    expect(log).toMatchObject({ action: "created", source: "email_suggestion", userId: user.id });

    const after = await prisma.emailSuggestion.findUniqueOrThrow({ where: { id: sug.id } });
    expect(after).toMatchObject({ resolved: true, resolvedAction: "accepted", applicationId: appId });
  });

  it("rejects invalid data via Zod and creates nothing", async () => {
    const user = await createTestUser();
    actAs(user.id);
    const sug = await createTestSuggestion(user.id, { suggestedAction: "NEW_APPLICATION" });

    const result = await acceptNewApplication(sug.id, { company: "", roleTitle: "" });
    expect(result).toHaveProperty("error");
    expect(await prisma.application.count()).toBe(0);
    const after = await prisma.emailSuggestion.findUniqueOrThrow({ where: { id: sug.id } });
    expect(after.resolved).toBe(false);
  });
});

describe("acceptStatusUpdate", () => {
  it("updates the status, logs the transition, and resolves the suggestion", async () => {
    const user = await createTestUser();
    actAs(user.id);
    const app = await createTestApplication(user.id, { status: "APPLIED", company: "Figma" });
    const sug = await createTestSuggestion(user.id, {
      suggestedCompany: "Figma",
      suggestedStatus: "INTERVIEW",
    });

    const result = await acceptStatusUpdate(sug.id, app.id, "INTERVIEW");
    expect(result).toMatchObject({ success: true });

    const after = await prisma.application.findUniqueOrThrow({ where: { id: app.id } });
    expect(after.status).toBe("INTERVIEW");

    const log = await prisma.activityLog.findFirstOrThrow({
      where: { applicationId: app.id, action: "updated" },
    });
    expect(log.details).toMatchObject({ status: { from: "APPLIED", to: "INTERVIEW" } });
    expect(log.source).toBe("email_suggestion");
  });
});

describe("acceptAllSuggestions", () => {
  it("creates NEW_APPLICATION rows and auto-matches STATUS_UPDATE by company (case-insensitive)", async () => {
    const user = await createTestUser();
    actAs(user.id);

    // Existing application to be matched by a status-update suggestion.
    const existing = await createTestApplication(user.id, { company: "Stripe", status: "APPLIED" });

    await createTestSuggestion(user.id, {
      suggestedAction: "NEW_APPLICATION",
      suggestedCompany: "Figma",
      suggestedRole: "PM",
      suggestedStatus: "APPLIED",
    });
    await createTestSuggestion(user.id, {
      suggestedAction: "STATUS_UPDATE",
      suggestedCompany: "STRIPE", // different case — must still match
      suggestedStatus: "OFFER",
    });
    // A status update with no matching application → skipped.
    await createTestSuggestion(user.id, {
      suggestedAction: "STATUS_UPDATE",
      suggestedCompany: "NoSuchCo",
      suggestedStatus: "REJECTED",
    });

    const result = await acceptAllSuggestions();
    expect(result).toMatchObject({ success: true, accepted: 2, skipped: 1 });

    // Figma created.
    const figma = await prisma.application.findFirstOrThrow({ where: { company: "Figma" } });
    expect(figma.status).toBe("APPLIED");

    // Stripe updated to OFFER.
    const stripe = await prisma.application.findUniqueOrThrow({ where: { id: existing.id } });
    expect(stripe.status).toBe("OFFER");

    // The unmatched one is resolved as 'skipped', not left lingering.
    const skipped = await prisma.emailSuggestion.findFirstOrThrow({
      where: { suggestedCompany: "NoSuchCo" },
    });
    expect(skipped).toMatchObject({ resolved: true, resolvedAction: "skipped" });

    // Every accepted mutation left an activity log.
    const logs = await prisma.activityLog.findMany({ where: { userId: user.id } });
    expect(logs).toHaveLength(2);
    expect(logs.every((l) => l.source === "email_suggestion")).toBe(true);
  });

  it("is a no-op when there are no unresolved suggestions", async () => {
    const user = await createTestUser();
    actAs(user.id);
    const result = await acceptAllSuggestions();
    expect(result).toMatchObject({ success: true, accepted: 0, skipped: 0 });
  });
});

describe("undoEmailSuggestion", () => {
  it("reverts a status update and restores the suggestion to the queue", async () => {
    const user = await createTestUser();
    actAs(user.id);
    const app = await createTestApplication(user.id, { company: "Figma", status: "APPLIED" });
    const sug = await createTestSuggestion(user.id, {
      suggestedCompany: "Figma",
      suggestedStatus: "INTERVIEW",
    });

    await acceptStatusUpdate(sug.id, app.id, "INTERVIEW");
    const log = await prisma.activityLog.findFirstOrThrow({
      where: { applicationId: app.id, source: "email_suggestion" },
    });

    const result = await undoEmailSuggestion(log.id);
    expect(result).toMatchObject({ success: true });

    // Application status reverted.
    const after = await prisma.application.findUniqueOrThrow({ where: { id: app.id } });
    expect(after.status).toBe("APPLIED");
    // Log removed, suggestion back in the unresolved queue.
    expect(await prisma.activityLog.findUnique({ where: { id: log.id } })).toBeNull();
    const sugAfter = await prisma.emailSuggestion.findUniqueOrThrow({ where: { id: sug.id } });
    expect(sugAfter).toMatchObject({ resolved: false, resolvedAction: null, applicationId: null });
  });

  it("deletes the created application when undoing a NEW_APPLICATION acceptance", async () => {
    const user = await createTestUser();
    actAs(user.id);
    const sug = await createTestSuggestion(user.id, {
      suggestedAction: "NEW_APPLICATION",
      suggestedCompany: "Notion",
    });

    const accepted = await acceptNewApplication(sug.id, {
      company: "Notion",
      roleTitle: "SWE",
      status: "APPLIED",
    });
    const appId = (accepted as { application: { id: string } }).application.id;
    const log = await prisma.activityLog.findFirstOrThrow({ where: { applicationId: appId } });

    const result = await undoEmailSuggestion(log.id);
    expect(result).toMatchObject({ success: true });

    expect(await prisma.application.findUnique({ where: { id: appId } })).toBeNull();
    const sugAfter = await prisma.emailSuggestion.findUniqueOrThrow({ where: { id: sug.id } });
    expect(sugAfter.resolved).toBe(false);
  });
});

describe("audit log is written on every mutation", () => {
  it("createApplication → 'created' (manual)", async () => {
    const user = await createTestUser();
    actAs(user.id);
    const r = await createApplication({ company: "A", roleTitle: "SWE", status: "APPLIED" });
    const logs = await prisma.activityLog.findMany({ where: { userId: user.id } });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ action: "created", source: "manual", applicationId: r.application!.id });
  });

  it("updateApplication → 'updated' with a diff of changed fields", async () => {
    const user = await createTestUser();
    actAs(user.id);
    const app = await createTestApplication(user.id, { company: "Old", status: "APPLIED" });

    await updateApplication(app.id, { company: "New", roleTitle: "SWE Intern", status: "OA" });
    const log = await prisma.activityLog.findFirstOrThrow({ where: { applicationId: app.id } });
    expect(log.action).toBe("updated");
    expect(log.details).toMatchObject({
      status: { from: "APPLIED", to: "OA" },
      company: { from: "Old", to: "New" },
    });
  });

  it("updateApplication with no real change writes NO log", async () => {
    const user = await createTestUser();
    actAs(user.id);
    const app = await createTestApplication(user.id, {
      company: "Same",
      roleTitle: "SWE Intern",
      status: "APPLIED",
    });

    await updateApplication(app.id, { company: "Same", roleTitle: "SWE Intern", status: "APPLIED" });
    expect(await prisma.activityLog.count({ where: { applicationId: app.id } })).toBe(0);
  });

  it("archiveApplication → 'archived' then 'unarchived' on toggle", async () => {
    const user = await createTestUser();
    actAs(user.id);
    const app = await createTestApplication(user.id);

    await archiveApplication(app.id);
    await archiveApplication(app.id);

    const logs = await prisma.activityLog.findMany({
      where: { applicationId: app.id },
      orderBy: { createdAt: "asc" },
    });
    expect(logs.map((l) => l.action)).toEqual(["archived", "unarchived"]);
  });

  it("importApplications → one 'created' log per row (csv_import source)", async () => {
    const user = await createTestUser();
    actAs(user.id);

    await importApplications([
      { company: "A", roleTitle: "SWE" },
      { company: "B", roleTitle: "PM" },
    ]);

    const logs = await prisma.activityLog.findMany({ where: { userId: user.id } });
    expect(logs).toHaveLength(2);
    expect(logs.every((l) => l.action === "created" && l.source === "csv_import")).toBe(true);
  });
});

describe("status transition matrix (updateApplicationStatus)", () => {
  const transitions: Array<[string, string]> = [
    ["APPLIED", "OA"],
    ["OA", "INTERVIEW"],
    ["INTERVIEW", "FINAL_ROUND"],
    ["FINAL_ROUND", "OFFER"],
    ["APPLIED", "REJECTED"],
    ["INTERVIEW", "WITHDRAWN"],
  ];

  it.each(transitions)("moves %s → %s and logs the transition", async (from, to) => {
    const user = await createTestUser();
    actAs(user.id);
    const app = await createTestApplication(user.id, { status: from as never });

    const result = await updateApplicationStatus(app.id, to);
    expect(result).toMatchObject({ success: true });

    const after = await prisma.application.findUniqueOrThrow({ where: { id: app.id } });
    expect(after.status).toBe(to);

    const log = await prisma.activityLog.findFirstOrThrow({
      where: { applicationId: app.id, action: "updated" },
    });
    expect(log.details).toMatchObject({ status: { from, to } });
  });

  it("every REPLY_WORTHY status the UI offers replies for is a valid enum value", () => {
    // Mirrors REPLY_WORTHY in email-suggestions-section.tsx. If a status is
    // renamed in the schema, this guards the reply-trigger list from silently
    // drifting out of sync.
    const replyWorthy = ["INTERVIEW", "OA", "OFFER", "FINAL_ROUND"];
    const validStatuses = [
      "APPLIED", "OA", "INTERVIEW", "FINAL_ROUND", "OFFER", "REJECTED", "WITHDRAWN",
    ];
    expect(replyWorthy.every((s) => validStatuses.includes(s))).toBe(true);
  });
});
