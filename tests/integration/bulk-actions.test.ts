import { describe, it, expect, beforeEach, beforeAll, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resetDb, createTestUser, createTestApplication } from "../helpers/db";
import { bulkUpdateStatus, bulkSetDeadline } from "@/lib/actions/applications";

const mockedAuth = vi.mocked(auth);

function actAs(userId: string) {
  mockedAuth.mockResolvedValue({ user: { id: userId } } as never);
}

function inDays(days: number) {
  return new Date(Date.now() + days * 86_400_000);
}

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
});

beforeEach(async () => {
  await resetDb();
  mockedAuth.mockReset();
});

describe("bulkUpdateStatus", () => {
  it("moves every selected application to the new stage", async () => {
    const user = await createTestUser();
    actAs(user.id);
    const a = await createTestApplication(user.id, { company: "Stripe" });
    const b = await createTestApplication(user.id, { company: "Figma" });
    const untouched = await createTestApplication(user.id, { company: "Linear" });

    const result = await bulkUpdateStatus([a.id, b.id], "INTERVIEW");

    expect(result).toMatchObject({ success: true, updated: 2, skipped: 0 });
    const rows = await prisma.application.findMany({
      where: { userId: user.id },
      select: { id: true, status: true },
    });
    const byId = new Map(rows.map((row) => [row.id, row.status]));
    expect(byId.get(a.id)).toBe("INTERVIEW");
    expect(byId.get(b.id)).toBe("INTERVIEW");
    expect(byId.get(untouched.id)).toBe("APPLIED");
  });

  it("logs one activity entry per application that actually changed", async () => {
    const user = await createTestUser();
    actAs(user.id);
    const moving = await createTestApplication(user.id, { status: "APPLIED" });
    const alreadyThere = await createTestApplication(user.id, {
      status: "INTERVIEW",
    });

    const result = await bulkUpdateStatus(
      [moving.id, alreadyThere.id],
      "INTERVIEW",
    );

    expect(result).toMatchObject({ updated: 1, skipped: 1 });
    const logs = await prisma.activityLog.findMany({
      where: { userId: user.id },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].applicationId).toBe(moving.id);
    expect(logs[0].details).toMatchObject({
      status: { from: "APPLIED", to: "INTERVIEW" },
    });
  });

  it("writes nothing when every selected application is already at that stage", async () => {
    const user = await createTestUser();
    actAs(user.id);
    const app = await createTestApplication(user.id, { status: "OFFER" });

    const result = await bulkUpdateStatus([app.id], "OFFER");

    expect(result).toMatchObject({ updated: 0, skipped: 1 });
    expect(await prisma.activityLog.count()).toBe(0);
  });

  it("ignores ids belonging to another user", async () => {
    const owner = await createTestUser();
    const other = await createTestUser();
    const mine = await createTestApplication(owner.id, { status: "APPLIED" });
    const theirs = await createTestApplication(other.id, { status: "APPLIED" });
    actAs(owner.id);

    const result = await bulkUpdateStatus([mine.id, theirs.id], "REJECTED");

    expect(result).toMatchObject({ updated: 1 });
    const untouched = await prisma.application.findUniqueOrThrow({
      where: { id: theirs.id },
    });
    expect(untouched.status).toBe("APPLIED");
  });

  it("counts a repeated id once", async () => {
    const user = await createTestUser();
    actAs(user.id);
    const app = await createTestApplication(user.id, { status: "APPLIED" });

    const result = await bulkUpdateStatus([app.id, app.id], "OA");

    expect(result).toMatchObject({ updated: 1 });
    expect(await prisma.activityLog.count()).toBe(1);
  });

  it("rejects an empty selection, an over-long one, and an unknown stage", async () => {
    const user = await createTestUser();
    actAs(user.id);
    const app = await createTestApplication(user.id);

    expect(await bulkUpdateStatus([], "OA")).toMatchObject({
      error: "Nothing selected",
    });
    const tooMany = Array.from({ length: 201 }, (_, i) => `id-${i}`);
    expect(await bulkUpdateStatus(tooMany, "OA")).toMatchObject({
      error: expect.stringContaining("at most"),
    });
    expect(await bulkUpdateStatus([app.id], "NOT_A_STAGE")).toMatchObject({
      error: "Invalid status",
    });
    // None of the rejections may have written anything.
    expect(await prisma.activityLog.count()).toBe(0);
  });

  it("reports no applications found when none of the ids resolve", async () => {
    const user = await createTestUser();
    actAs(user.id);
    expect(await bulkUpdateStatus(["missing-1"], "OA")).toMatchObject({
      error: "No applications found",
    });
  });
});

describe("bulkSetDeadline", () => {
  it("puts the same date on every selected application and takes ownership of it", async () => {
    const user = await createTestUser();
    actAs(user.id);
    const a = await createTestApplication(user.id, {
      status: "OA",
      deadlineSource: "email",
      deadlineNote: "complete it by Friday",
    });
    const b = await createTestApplication(user.id, { status: "OA" });
    const due = inDays(5);

    const result = await bulkSetDeadline([a.id, b.id], {
      deadlineAt: due.toISOString(),
    });

    expect(result).toMatchObject({ success: true, updated: 2 });
    const rows = await prisma.application.findMany({
      where: { id: { in: [a.id, b.id] } },
    });
    for (const row of rows) {
      expect(row.deadlineAt?.toISOString()).toBe(due.toISOString());
      expect(row.deadlineSource).toBe("manual");
      // The quoted sentence described the old date, so it cannot survive.
      expect(row.deadlineNote).toBeNull();
    }
  });

  it("schedules a reminder per application from the new date", async () => {
    const user = await createTestUser();
    actAs(user.id);
    const a = await createTestApplication(user.id, { status: "OA" });
    const b = await createTestApplication(user.id, { status: "OA" });

    const result = await bulkSetDeadline([a.id, b.id], {
      deadlineAt: inDays(10).toISOString(),
    });

    expect(result).toMatchObject({ scheduled: 2 });
    const reminders = await prisma.reminder.findMany({
      where: { userId: user.id },
    });
    expect(reminders).toHaveLength(2);
    expect(reminders.every((r) => r.kind === "ASSESSMENT_DUE")).toBe(true);
  });

  it("clearing the date removes the reminders that came from it", async () => {
    const user = await createTestUser();
    actAs(user.id);
    const app = await createTestApplication(user.id, { status: "OA" });
    await bulkSetDeadline([app.id], { deadlineAt: inDays(10).toISOString() });
    expect(await prisma.reminder.count()).toBe(1);

    const result = await bulkSetDeadline([app.id], { deadlineAt: null });

    expect(result).toMatchObject({ success: true, updated: 1, scheduled: 0 });
    const cleared = await prisma.application.findUniqueOrThrow({
      where: { id: app.id },
    });
    expect(cleared.deadlineAt).toBeNull();
    expect(cleared.deadlineSource).toBeNull();
    expect(await prisma.reminder.count()).toBe(0);
  });

  it("logs the new deadline against each application", async () => {
    const user = await createTestUser();
    actAs(user.id);
    const app = await createTestApplication(user.id, { status: "OA" });
    const due = inDays(3);

    await bulkSetDeadline([app.id], { deadlineAt: due.toISOString() });

    const logs = await prisma.activityLog.findMany({
      where: { applicationId: app.id },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].details).toMatchObject({ deadline: due.toISOString() });
  });

  it("ignores ids belonging to another user", async () => {
    const owner = await createTestUser();
    const other = await createTestUser();
    const mine = await createTestApplication(owner.id, { status: "OA" });
    const theirs = await createTestApplication(other.id, { status: "OA" });
    actAs(owner.id);

    const result = await bulkSetDeadline([mine.id, theirs.id], {
      deadlineAt: inDays(4).toISOString(),
    });

    expect(result).toMatchObject({ updated: 1 });
    const untouched = await prisma.application.findUniqueOrThrow({
      where: { id: theirs.id },
    });
    expect(untouched.deadlineAt).toBeNull();
  });

  it("rejects a date it cannot parse without writing anything", async () => {
    const user = await createTestUser();
    actAs(user.id);
    const app = await createTestApplication(user.id, { status: "OA" });

    expect(
      await bulkSetDeadline([app.id], { deadlineAt: "next tuesday-ish" }),
    ).toMatchObject({ error: "That date isn't valid" });
    expect(
      await bulkSetDeadline([app.id], { deadlineAt: 20260801 }),
    ).toMatchObject({ error: "That date isn't valid" });

    const unchanged = await prisma.application.findUniqueOrThrow({
      where: { id: app.id },
    });
    expect(unchanged.deadlineAt).toBeNull();
    expect(await prisma.activityLog.count()).toBe(0);
  });
});
