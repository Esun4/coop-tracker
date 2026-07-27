import { describe, it, expect, beforeEach, vi, beforeAll } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resetDb, createTestUser } from "../helpers/db";
import { getLadder, getSourceBreakdown } from "@/lib/actions/applications";

const mockedAuth = vi.mocked(auth);

function actAs(userId: string) {
  mockedAuth.mockResolvedValue({ user: { id: userId } } as never);
}

/** An application plus the stages it passed through on the way to `status`. */
async function seed(
  userId: string,
  company: string,
  status: string,
  opts: { source?: string; through?: string[] } = {},
) {
  const app = await prisma.application.create({
    data: {
      userId,
      company,
      roleTitle: "SWE Intern",
      status: status as never,
      source: opts.source ?? null,
      applicationDate: new Date("2026-01-10"),
    },
  });

  let from = "APPLIED";
  for (const to of opts.through ?? []) {
    await prisma.activityLog.create({
      data: {
        userId,
        applicationId: app.id,
        action: "updated",
        details: { status: { from, to } },
      },
    });
    from = to;
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

describe("getLadder", () => {
  it("counts every application at Applied", async () => {
    const user = await createTestUser();
    actAs(user.id);

    await seed(user.id, "Alpha", "APPLIED");
    await seed(user.id, "Beta", "REJECTED");

    const ladder = await getLadder();
    expect(ladder.APPLIED).toBe(2);
  });

  it("counts furthest reached, so a rung never shrinks when an application closes", async () => {
    const user = await createTestUser();
    actAs(user.id);

    // Interviewed, then rejected. Standing counts would lose this entirely.
    await seed(user.id, "Airbnb", "REJECTED", {
      through: ["OA", "INTERVIEW", "REJECTED"],
    });
    // Still standing at assessment.
    await seed(user.id, "Stripe", "OA", { through: ["OA"] });

    const ladder = await getLadder();

    expect(ladder.APPLIED).toBe(2);
    expect(ladder.OA).toBe(2);
    expect(ladder.INTERVIEW).toBe(1);
    expect(ladder.FINAL_ROUND).toBe(0);
    expect(ladder.OFFER).toBe(0);
  });

  it("counts a stage reached without a logged transition", async () => {
    const user = await createTestUser();
    actAs(user.id);
    // Imported straight in at interview, no history behind it.
    await seed(user.id, "Figma", "INTERVIEW");

    const ladder = await getLadder();
    expect(ladder.INTERVIEW).toBe(1);
    expect(ladder.APPLIED).toBe(1);
  });

  it("never counts an application twice on one rung", async () => {
    const user = await createTestUser();
    actAs(user.id);
    // Bounced back and forth; still one application.
    await seed(user.id, "Cohere", "INTERVIEW", {
      through: ["OA", "INTERVIEW", "OA", "INTERVIEW"],
    });

    const ladder = await getLadder();
    expect(ladder.OA).toBe(1);
    expect(ladder.INTERVIEW).toBe(1);
  });

  it("stays inside one account", async () => {
    const owner = await createTestUser();
    const stranger = await createTestUser();
    await seed(owner.id, "Alpha", "OFFER", { through: ["OFFER"] });

    actAs(stranger.id);
    const ladder = await getLadder();
    expect(ladder.APPLIED).toBe(0);
    expect(ladder.OFFER).toBe(0);
  });
});

describe("getSourceBreakdown", () => {
  it("splits sent, replied, interviewed and offered by source", async () => {
    const user = await createTestUser();
    actAs(user.id);

    await seed(user.id, "Vercel", "OFFER", {
      source: "Referral",
      through: ["INTERVIEW", "OFFER"],
    });
    await seed(user.id, "Ramp", "APPLIED", { source: "Referral" });
    await seed(user.id, "Shopify", "REJECTED", {
      source: "WaterlooWorks",
      through: ["REJECTED"],
    });

    const rows = await getSourceBreakdown();
    const referral = rows.find((r) => r.source === "Referral")!;
    const ww = rows.find((r) => r.source === "WaterlooWorks")!;

    expect(referral).toMatchObject({
      sent: 2,
      replied: 1,
      interviewed: 1,
      offered: 1,
    });
    // A rejection is still a reply; it just never reached an interview.
    expect(ww).toMatchObject({
      sent: 1,
      replied: 1,
      interviewed: 0,
      offered: 0,
    });
  });

  it("gives applications with no source somewhere to go", async () => {
    const user = await createTestUser();
    actAs(user.id);
    await seed(user.id, "Alpha", "APPLIED");

    const rows = await getSourceBreakdown();
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe("Unspecified");
  });

  it("reconciles: sent across sources equals everything tracked", async () => {
    const user = await createTestUser();
    actAs(user.id);

    await seed(user.id, "A", "APPLIED", { source: "Referral" });
    await seed(user.id, "B", "OA", { source: "LinkedIn", through: ["OA"] });
    await seed(user.id, "C", "REJECTED", { source: "LinkedIn" });
    await seed(user.id, "D", "OFFER", { through: ["OFFER"] });

    const rows = await getSourceBreakdown();
    const totalSent = rows.reduce((sum, r) => sum + r.sent, 0);

    expect(totalSent).toBe(4);
  });
});
