import { describe, it, expect, beforeEach, vi, beforeAll } from "vitest";

// Cross-user isolation: user B ("attacker") must never read, modify, or delete
// user A's ("owner") applications, suggestions, or activity via any server
// action. Prisma is real (test DB); auth is mocked to switch the caller.
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// OpenAI / Gmail must never be reached in these tests — every call fails the
// ownership check first. Mock both at the module boundary so any slip becomes
// a visible assertion failure instead of a network call.
const { openaiCreateMock, gmailSendMock } = vi.hoisted(() => ({
  openaiCreateMock: vi.fn(),
  gmailSendMock: vi.fn(),
}));
vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create: openaiCreateMock } };
  },
}));
vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: class {
        setCredentials() {}
        on() {}
      },
    },
    gmail: () => ({ users: { messages: { send: gmailSendMock } } }),
  },
}));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  resetDb,
  createTestUser,
  createProTestUser,
  createTestApplication,
  createTestSuggestion,
} from "../helpers/db";
import {
  getApplication,
  getApplications,
  updateApplication,
  archiveApplication,
  deleteApplication,
  getStats,
  getRecentActivity,
  getDistinctSources,
} from "@/lib/actions/applications";
import {
  getUnresolvedSuggestions,
  dismissSuggestion,
  acceptNewApplication,
  acceptAllSuggestions,
  acceptStatusUpdate,
  undoEmailSuggestion,
  generateEmailDraft,
  sendEmailReply,
} from "@/lib/actions/suggestions";

const mockedAuth = vi.mocked(auth);

function actAs(userId: string) {
  mockedAuth.mockResolvedValue({ user: { id: userId } } as never);
}

let owner: { id: string };
let attacker: { id: string };

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
});

beforeEach(async () => {
  await resetDb();
  vi.clearAllMocks();
  owner = await createTestUser({ name: "Owner" });
  // The attacker pays. Ownership, not the paywall, has to be what stops them —
  // a FREE attacker would bounce off the Pro gate on the reply actions and the
  // isolation assertions would pass for the wrong reason.
  attacker = await createProTestUser({ name: "Attacker" });
});

describe("applications: attacker cannot touch the owner's rows", () => {
  it("getApplication returns null for another user's application (no metadata leak)", async () => {
    const app = await createTestApplication(owner.id, { notes: "secret notes" });

    actAs(attacker.id);
    expect(await getApplication(app.id)).toBeNull();
  });

  it("updateApplication refuses and leaves the owner's record untouched", async () => {
    const app = await createTestApplication(owner.id, { company: "Owned" });

    actAs(attacker.id);
    const result = await updateApplication(app.id, {
      company: "Hijacked",
      roleTitle: "SWE",
      status: "OFFER",
    });
    expect(result).toMatchObject({ error: "Application not found" });

    const after = await prisma.application.findUniqueOrThrow({ where: { id: app.id } });
    expect(after.company).toBe("Owned");
    expect(after.status).toBe("APPLIED");
  });

  it("archiveApplication refuses to archive another user's application", async () => {
    const app = await createTestApplication(owner.id);

    actAs(attacker.id);
    const result = await archiveApplication(app.id);
    expect(result).toMatchObject({ error: "Application not found" });

    const after = await prisma.application.findUniqueOrThrow({ where: { id: app.id } });
    expect(after.archived).toBe(false);
  });

  it("deleteApplication refuses to delete another user's application", async () => {
    const app = await createTestApplication(owner.id);

    actAs(attacker.id);
    const result = await deleteApplication(app.id);
    expect(result).toMatchObject({ error: "Application not found" });
    expect(await prisma.application.findUnique({ where: { id: app.id } })).not.toBeNull();
  });

  it("read endpoints only ever return the caller's own data", async () => {
    await createTestApplication(owner.id, {
      company: "OwnerCo",
      source: "OwnerBoard",
      status: "OFFER",
    });
    await prisma.activityLog.create({
      data: { userId: owner.id, action: "created", source: "manual" },
    });

    actAs(attacker.id);
    expect(await getApplications()).toHaveLength(0);
    expect(await getRecentActivity()).toHaveLength(0);
    expect(await getDistinctSources()).toEqual([]);
    const stats = await getStats();
    expect(stats.total).toBe(0);
    expect(stats.byStatus).toEqual({});
  });
});

describe("suggestions: attacker cannot touch the owner's rows", () => {
  it("getUnresolvedSuggestions never returns another user's suggestions", async () => {
    await createTestSuggestion(owner.id);

    actAs(attacker.id);
    expect(await getUnresolvedSuggestions()).toHaveLength(0);
  });

  it("dismissSuggestion refuses and leaves the suggestion unresolved", async () => {
    const sug = await createTestSuggestion(owner.id);

    actAs(attacker.id);
    const result = await dismissSuggestion(sug.id);
    expect(result).toMatchObject({ error: "Suggestion not found" });

    const after = await prisma.emailSuggestion.findUniqueOrThrow({ where: { id: sug.id } });
    expect(after.resolved).toBe(false);
  });

  it("acceptNewApplication refuses another user's suggestion and creates nothing", async () => {
    const sug = await createTestSuggestion(owner.id, { suggestedAction: "NEW_APPLICATION" });

    actAs(attacker.id);
    const result = await acceptNewApplication(sug.id, {
      company: "TestCo",
      roleTitle: "SWE",
      status: "APPLIED",
    });
    expect(result).toMatchObject({ error: "Suggestion not found" });
    expect(await prisma.application.count()).toBe(0);
  });

  it("acceptStatusUpdate refuses when the suggestion belongs to someone else", async () => {
    const ownerSug = await createTestSuggestion(owner.id);
    const attackerApp = await createTestApplication(attacker.id);

    actAs(attacker.id);
    const result = await acceptStatusUpdate(ownerSug.id, attackerApp.id, "INTERVIEW");
    expect(result).toMatchObject({ error: "Suggestion not found" });
  });

  it("acceptStatusUpdate refuses when the target application belongs to someone else", async () => {
    // Attacker owns the suggestion but points it at the owner's application.
    const attackerSug = await createTestSuggestion(attacker.id);
    const ownerApp = await createTestApplication(owner.id);

    actAs(attacker.id);
    const result = await acceptStatusUpdate(attackerSug.id, ownerApp.id, "OFFER");
    expect(result).toMatchObject({ error: "Application not found" });

    const after = await prisma.application.findUniqueOrThrow({ where: { id: ownerApp.id } });
    expect(after.status).toBe("APPLIED");
  });

  it("acceptAllSuggestions auto-match never updates another user's application", async () => {
    // Owner has an application at "AcmeCorp"; attacker crafts a suggestion
    // whose company matches it. Auto-match must only search the attacker's
    // own applications, so the owner's row must stay untouched.
    const ownerApp = await createTestApplication(owner.id, { company: "AcmeCorp" });
    await createTestSuggestion(attacker.id, {
      suggestedAction: "STATUS_UPDATE",
      suggestedCompany: "AcmeCorp",
      suggestedStatus: "OFFER",
    });

    actAs(attacker.id);
    const result = await acceptAllSuggestions();
    expect(result).toMatchObject({ success: true, accepted: 0, skipped: 1 });

    const after = await prisma.application.findUniqueOrThrow({ where: { id: ownerApp.id } });
    expect(after.status).toBe("APPLIED");
  });

  it("generateEmailDraft refuses another user's suggestion and never calls OpenAI", async () => {
    const sug = await createTestSuggestion(owner.id);

    actAs(attacker.id);
    const result = await generateEmailDraft(sug.id);
    expect(result).toMatchObject({ error: "Suggestion not found" });
    expect(openaiCreateMock).not.toHaveBeenCalled();
    // A rejected request must cost nothing: otherwise guessing ids would drain
    // a victim's quota — and the shared per-IP budget with it.
    expect(await prisma.rateLimitEvent.count()).toBe(0);
  });

  it("sendEmailReply refuses another user's suggestion and never calls Gmail", async () => {
    const sug = await createTestSuggestion(owner.id);

    actAs(attacker.id);
    const result = await sendEmailReply(sug.id, "I'd love to interview!");
    expect(result).toMatchObject({ error: "Suggestion not found" });
    expect(gmailSendMock).not.toHaveBeenCalled();
    expect(await prisma.rateLimitEvent.count()).toBe(0);
  });
});

describe("undoEmailSuggestion isolation and integrity", () => {
  it("refuses to undo another user's activity log entry", async () => {
    const app = await createTestApplication(owner.id, { status: "INTERVIEW" });
    const log = await prisma.activityLog.create({
      data: {
        userId: owner.id,
        applicationId: app.id,
        action: "updated",
        details: { status: { from: "APPLIED", to: "INTERVIEW" } },
        source: "email_suggestion",
      },
    });

    actAs(attacker.id);
    const result = await undoEmailSuggestion(log.id);
    expect(result).toMatchObject({ error: "Activity not found" });

    // Nothing reverted, nothing deleted.
    const appAfter = await prisma.application.findUniqueOrThrow({ where: { id: app.id } });
    expect(appAfter.status).toBe("INTERVIEW");
    expect(await prisma.activityLog.findUnique({ where: { id: log.id } })).not.toBeNull();
  });

  it("refuses to undo a manual-source log even for its own owner (email_suggestion only)", async () => {
    const app = await createTestApplication(owner.id);
    const log = await prisma.activityLog.create({
      data: {
        userId: owner.id,
        applicationId: app.id,
        action: "created",
        source: "manual",
      },
    });

    actAs(owner.id);
    const result = await undoEmailSuggestion(log.id);
    expect(result).toMatchObject({ error: "Activity not found" });
    expect(await prisma.application.findUnique({ where: { id: app.id } })).not.toBeNull();
  });
});
