import { describe, it, expect, beforeEach, vi, beforeAll } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resetDb, createTestUser } from "../helpers/db";
import {
  getApplicationDetail,
  setApplicationDeadline,
} from "@/lib/actions/applications";

const mockedAuth = vi.mocked(auth);

function actAs(userId: string) {
  mockedAuth.mockResolvedValue({ user: { id: userId } } as never);
}

async function makeApp(userId: string, company: string, status = "APPLIED") {
  return prisma.application.create({
    data: { userId, company, roleTitle: "SWE Intern", status: status as never },
  });
}

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
});

beforeEach(async () => {
  await resetDb();
  mockedAuth.mockReset();
});

describe("getApplicationDetail", () => {
  it("reports position and neighbours so the cycle can be walked", async () => {
    const user = await createTestUser();
    actAs(user.id);

    // Created oldest first; the in-play list is ordered by updatedAt desc.
    const first = await makeApp(user.id, "Alpha");
    const second = await makeApp(user.id, "Beta");
    const third = await makeApp(user.id, "Gamma");

    const detail = await getApplicationDetail(second.id);

    expect(detail).not.toBeNull();
    expect(detail!.total).toBe(3);
    expect(detail!.position).toBe(2);
    expect(detail!.prevId).toBe(third.id);
    expect(detail!.nextId).toBe(first.id);
  });

  it("leaves closed applications out of the walk", async () => {
    const user = await createTestUser();
    actAs(user.id);

    await makeApp(user.id, "Alpha");
    await makeApp(user.id, "Beta", "REJECTED");
    await makeApp(user.id, "Gamma", "WITHDRAWN");

    const live = await prisma.application.findFirst({
      where: { userId: user.id, company: "Alpha" },
    });
    const detail = await getApplicationDetail(live!.id);

    expect(detail!.total).toBe(1);
    expect(detail!.prevId).toBeNull();
    expect(detail!.nextId).toBeNull();
  });

  it("will not hand one user another user's application", async () => {
    const owner = await createTestUser();
    const stranger = await createTestUser();
    const app = await makeApp(owner.id, "Stripe");

    actAs(stranger.id);
    expect(await getApplicationDetail(app.id)).toBeNull();
  });
});

describe("setApplicationDeadline", () => {
  it("stores the date and marks it as set by hand", async () => {
    const user = await createTestUser();
    actAs(user.id);
    const app = await makeApp(user.id, "Stripe");

    const result = await setApplicationDeadline(app.id, {
      deadlineAt: "2027-08-07T20:00:00.000Z",
      note: "complete it by Friday, August 7",
    });

    expect(result).toMatchObject({ success: true });

    const stored = await prisma.application.findUnique({ where: { id: app.id } });
    expect(stored!.deadlineAt?.toISOString()).toBe("2027-08-07T20:00:00.000Z");
    expect(stored!.deadlineSource).toBe("manual");
    expect(stored!.deadlineNote).toBe("complete it by Friday, August 7");
  });

  it("clears the date, and the note with it", async () => {
    const user = await createTestUser();
    actAs(user.id);
    const app = await makeApp(user.id, "Stripe");

    await setApplicationDeadline(app.id, {
      deadlineAt: "2027-08-07T20:00:00.000Z",
      note: "by Friday",
    });
    await setApplicationDeadline(app.id, { deadlineAt: null });

    const stored = await prisma.application.findUnique({ where: { id: app.id } });
    expect(stored!.deadlineAt).toBeNull();
    expect(stored!.deadlineSource).toBeNull();
    expect(stored!.deadlineNote).toBeNull();
  });

  it("rejects a date it cannot parse", async () => {
    const user = await createTestUser();
    actAs(user.id);
    const app = await makeApp(user.id, "Stripe");

    const result = await setApplicationDeadline(app.id, {
      deadlineAt: "not a date",
    });

    expect(result.error).toBeTruthy();
    const stored = await prisma.application.findUnique({ where: { id: app.id } });
    expect(stored!.deadlineAt).toBeNull();
  });

  it("refuses to touch another user's application", async () => {
    const owner = await createTestUser();
    const stranger = await createTestUser();
    const app = await makeApp(owner.id, "Stripe");

    actAs(stranger.id);
    const result = await setApplicationDeadline(app.id, {
      deadlineAt: "2027-08-07T20:00:00.000Z",
    });

    expect(result.error).toBeTruthy();
    const stored = await prisma.application.findUnique({ where: { id: app.id } });
    expect(stored!.deadlineAt).toBeNull();
  });

  it("writes the change to the ledger", async () => {
    const user = await createTestUser();
    actAs(user.id);
    const app = await makeApp(user.id, "Stripe");

    await setApplicationDeadline(app.id, {
      deadlineAt: "2027-08-07T20:00:00.000Z",
    });

    const logs = await prisma.activityLog.findMany({
      where: { applicationId: app.id },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].details).toMatchObject({
      deadline: "2027-08-07T20:00:00.000Z",
    });
  });
});
