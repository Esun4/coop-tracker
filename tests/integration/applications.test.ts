import { describe, it, expect, beforeEach, vi, beforeAll } from "vitest";

// Mock the auth boundary so we can inject the "current user". The real module
// pulls in NextAuth/Google/bcrypt and would need OAuth env vars we don't want
// in tests. Prisma is NOT mocked — these tests hit the real test database.
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
// revalidatePath throws outside a Next request context; stub it.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resetDb, createTestUser } from "../helpers/db";
import {
  createApplication,
  updateApplicationStatus,
  deleteApplication,
  getApplications,
} from "@/lib/actions/applications";

const mockedAuth = vi.mocked(auth);

/** Make subsequent server-action calls run as the given user. */
function actAs(userId: string) {
  mockedAuth.mockResolvedValue({ user: { id: userId } } as never);
}

beforeAll(async () => {
  // Fail fast with a clear message if the container/schema isn't up.
  await prisma.$queryRaw`SELECT 1`;
});

beforeEach(async () => {
  await resetDb();
  mockedAuth.mockReset();
});

describe("createApplication", () => {
  it("persists the application and writes a 'created' activity log scoped to the user", async () => {
    const user = await createTestUser();
    actAs(user.id);

    const result = await createApplication({
      company: "Stripe",
      roleTitle: "Backend Intern",
      status: "APPLIED",
      applicationDate: "2026-01-15",
    });

    expect(result).toMatchObject({ success: true });
    expect(result.application?.company).toBe("Stripe");

    const stored = await prisma.application.findMany({ where: { userId: user.id } });
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      company: "Stripe",
      roleTitle: "Backend Intern",
      status: "APPLIED",
      userId: user.id,
    });

    const logs = await prisma.activityLog.findMany({ where: { userId: user.id } });
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe("created");
  });

  it("rejects invalid input via Zod and writes nothing", async () => {
    const user = await createTestUser();
    actAs(user.id);

    const result = await createApplication({ company: "", roleTitle: "Dev" });

    expect(result).toHaveProperty("error");
    expect(await prisma.application.count()).toBe(0);
  });
});

describe("updateApplicationStatus", () => {
  it("changes status and records the from→to transition in the activity log", async () => {
    const user = await createTestUser();
    actAs(user.id);
    const created = await createApplication({ company: "Figma", roleTitle: "PM", status: "APPLIED" });
    const id = created.application!.id;

    const result = await updateApplicationStatus(id, "INTERVIEW");
    expect(result).toMatchObject({ success: true });

    const after = await prisma.application.findUniqueOrThrow({ where: { id } });
    expect(after.status).toBe("INTERVIEW");

    const updateLog = await prisma.activityLog.findFirst({
      where: { applicationId: id, action: "updated" },
    });
    expect(updateLog?.details).toMatchObject({ status: { from: "APPLIED", to: "INTERVIEW" } });
  });

  it("rejects an invalid status value and leaves the record unchanged", async () => {
    const user = await createTestUser();
    actAs(user.id);
    const created = await createApplication({ company: "Figma", roleTitle: "PM", status: "APPLIED" });
    const id = created.application!.id;

    const result = await updateApplicationStatus(id, "NOT_A_STATUS");
    expect(result).toMatchObject({ error: "Invalid status" });
    const after = await prisma.application.findUniqueOrThrow({ where: { id } });
    expect(after.status).toBe("APPLIED");
  });
});

describe("deleteApplication", () => {
  it("removes the application from the database", async () => {
    const user = await createTestUser();
    actAs(user.id);
    const created = await createApplication({ company: "Notion", roleTitle: "SWE", status: "APPLIED" });
    const id = created.application!.id;

    const result = await deleteApplication(id);
    expect(result).toMatchObject({ success: true });
    expect(await prisma.application.findUnique({ where: { id } })).toBeNull();
  });
});

describe("getApplications (user scoping & filters)", () => {
  it("returns only the calling user's applications, never another user's", async () => {
    const alice = await createTestUser({ name: "Alice" });
    const bob = await createTestUser({ name: "Bob" });

    actAs(alice.id);
    await createApplication({ company: "AliceCo", roleTitle: "SWE", status: "APPLIED" });

    actAs(bob.id);
    await createApplication({ company: "BobCo", roleTitle: "SWE", status: "APPLIED" });

    actAs(alice.id);
    const aliceApps = await getApplications();
    expect(aliceApps).toHaveLength(1);
    expect(aliceApps[0].company).toBe("AliceCo");
  });

  it("excludes archived applications by default but includes them on request", async () => {
    const user = await createTestUser();
    actAs(user.id);
    const active = await createApplication({ company: "Active", roleTitle: "SWE", status: "APPLIED" });
    const archived = await createApplication({ company: "Archived", roleTitle: "SWE", status: "APPLIED" });
    await prisma.application.update({ where: { id: archived.application!.id }, data: { archived: true } });

    const defaultList = await getApplications();
    expect(defaultList.map((a) => a.company)).toEqual(["Active"]);
    expect(defaultList.map((a) => a.id)).toContain(active.application!.id);

    const withArchived = await getApplications({ includeArchived: true });
    expect(withArchived).toHaveLength(2);
  });
});

describe("cross-user authorization", () => {
  it("refuses to update another user's application and leaves it untouched", async () => {
    const owner = await createTestUser({ name: "Owner" });
    const attacker = await createTestUser({ name: "Attacker" });

    actAs(owner.id);
    const created = await createApplication({ company: "Owned", roleTitle: "SWE", status: "APPLIED" });
    const id = created.application!.id;

    actAs(attacker.id);
    const result = await updateApplicationStatus(id, "OFFER");
    expect(result).toMatchObject({ error: "Application not found" });

    const after = await prisma.application.findUniqueOrThrow({ where: { id } });
    expect(after.status).toBe("APPLIED");
  });
});
