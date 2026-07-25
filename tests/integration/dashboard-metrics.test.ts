import { describe, it, expect, beforeEach, vi, beforeAll } from "vitest";

// Same boundary mocks as the other integration tests: auth is injected,
// next/cache is stubbed, Prisma is real.
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resetDb, createTestUser } from "../helpers/db";
import { getStats } from "@/lib/actions/applications";

const mockedAuth = vi.mocked(auth);

function actAs(userId: string) {
  mockedAuth.mockResolvedValue({ user: { id: userId } } as never);
}

/** An application plus, optionally, the status transitions it has been through. */
async function seed(
  userId: string,
  company: string,
  status: string,
  opts: {
    appliedDaysAgo?: number;
    transitions?: { to: string; daysAfterApplying: number }[];
  } = {},
) {
  const appliedAt =
    opts.appliedDaysAgo == null
      ? null
      : new Date(Date.now() - opts.appliedDaysAgo * 86_400_000);

  const app = await prisma.application.create({
    data: {
      userId,
      company,
      roleTitle: "SWE Intern",
      status: status as never,
      applicationDate: appliedAt,
    },
  });

  let from = "APPLIED";
  for (const t of opts.transitions ?? []) {
    await prisma.activityLog.create({
      data: {
        userId,
        applicationId: app.id,
        action: "updated",
        details: { status: { from, to: t.to } },
        createdAt: new Date(
          (appliedAt?.getTime() ?? Date.now()) + t.daysAfterApplying * 86_400_000,
        ),
      },
    });
    from = t.to;
  }

  return app;
}

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
});

beforeEach(async () => {
  await resetDb();
  mockedAuth.mockReset();
});

describe("getStats — in play and closed", () => {
  it("splits tracked applications into in play and closed", async () => {
    const user = await createTestUser();
    actAs(user.id);

    await seed(user.id, "Stripe", "APPLIED");
    await seed(user.id, "Figma", "INTERVIEW");
    await seed(user.id, "Airbnb", "REJECTED");
    await seed(user.id, "Palantir", "WITHDRAWN");

    const stats = await getStats();

    expect(stats.total).toBe(4);
    expect(stats.closed).toBe(2);
    expect(stats.inPlay).toBe(2);
    // The numbers the dashboard prints must add up.
    expect(stats.inPlay + stats.closed).toBe(stats.total);
  });

  it("counts a rejection as a reply but not a withdrawal", async () => {
    const user = await createTestUser();
    actAs(user.id);

    await seed(user.id, "Stripe", "APPLIED");
    await seed(user.id, "Airbnb", "REJECTED");
    await seed(user.id, "Palantir", "WITHDRAWN");

    const stats = await getStats();

    // 3 tracked, 1 still silent, 1 withdrawn by you → 1 genuine reply.
    expect(stats.replied).toBe(1);
    expect(stats.responseRate).toBeCloseTo(1 / 3);
  });
});

describe("getStats — reached interview", () => {
  it("counts applications that reached interview and were then rejected", async () => {
    const user = await createTestUser();
    actAs(user.id);

    // Currently standing at interview.
    await seed(user.id, "Figma", "INTERVIEW");
    // Interviewed, then rejected — the standing count would miss this one.
    await seed(user.id, "Airbnb", "REJECTED", {
      appliedDaysAgo: 30,
      transitions: [
        { to: "INTERVIEW", daysAfterApplying: 5 },
        { to: "REJECTED", daysAfterApplying: 12 },
      ],
    });
    // Never got past the first screen.
    await seed(user.id, "Palantir", "REJECTED", {
      appliedDaysAgo: 30,
      transitions: [{ to: "REJECTED", daysAfterApplying: 4 }],
    });

    const stats = await getStats();

    expect(stats.interviews).toBe(2);
    expect(stats.interviewRate).toBeCloseTo(2 / 3);
  });

  it("counts each application once however many times it advanced", async () => {
    const user = await createTestUser();
    actAs(user.id);

    await seed(user.id, "Vercel", "OFFER", {
      appliedDaysAgo: 40,
      transitions: [
        { to: "INTERVIEW", daysAfterApplying: 6 },
        { to: "FINAL_ROUND", daysAfterApplying: 14 },
        { to: "OFFER", daysAfterApplying: 21 },
      ],
    });

    const stats = await getStats();
    expect(stats.interviews).toBe(1);
  });
});

describe("getStats — median reply time", () => {
  it("is null before anything has been heard back", async () => {
    const user = await createTestUser();
    actAs(user.id);
    await seed(user.id, "Stripe", "APPLIED", { appliedDaysAgo: 10 });

    const stats = await getStats();
    expect(stats.medianReplyDays).toBeNull();
  });

  it("measures days from applying to the first reply", async () => {
    const user = await createTestUser();
    actAs(user.id);

    await seed(user.id, "Stripe", "OA", {
      appliedDaysAgo: 60,
      transitions: [{ to: "OA", daysAfterApplying: 4 }],
    });
    await seed(user.id, "Figma", "INTERVIEW", {
      appliedDaysAgo: 60,
      transitions: [{ to: "INTERVIEW", daysAfterApplying: 10 }],
    });

    const stats = await getStats();
    // Median of 4 and 10.
    expect(stats.medianReplyDays).toBe(7);
  });

  it("ignores withdrawals, which are your move rather than their reply", async () => {
    const user = await createTestUser();
    actAs(user.id);

    await seed(user.id, "Stripe", "OA", {
      appliedDaysAgo: 60,
      transitions: [{ to: "OA", daysAfterApplying: 8 }],
    });
    // Withdrawn the day after applying — would drag the median to ~4.5 if counted.
    await seed(user.id, "Ramp", "WITHDRAWN", {
      appliedDaysAgo: 60,
      transitions: [{ to: "WITHDRAWN", daysAfterApplying: 1 }],
    });

    const stats = await getStats();
    expect(stats.medianReplyDays).toBe(8);
  });
});

describe("getStats — offers", () => {
  it("names the companies behind the offer count", async () => {
    const user = await createTestUser();
    actAs(user.id);

    await seed(user.id, "Vercel", "OFFER");
    await seed(user.id, "Ramp", "OFFER");
    await seed(user.id, "Stripe", "APPLIED");

    const stats = await getStats();

    expect(stats.offers).toBe(2);
    expect(stats.offerCompanies.sort()).toEqual(["Ramp", "Vercel"]);
  });
});
