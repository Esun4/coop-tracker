import { describe, it, expect, beforeEach, beforeAll, afterEach } from "vitest";

import { prisma } from "@/lib/prisma";
import { resetDb, createTestUser } from "../helpers/db";
import { pruneRateLimitEvents, RETENTION_MS } from "@/lib/rate-limit";
import { GET as pruneRoute } from "@/app/api/cron/prune-rate-limits/route";

const HOUR_MS = 60 * 60 * 1000;

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
});

beforeEach(async () => {
  await resetDb();
});

/** Writes one ledger row aged `ageMs` into the past. */
async function seedEvent(userId: string, ageMs: number) {
  return prisma.rateLimitEvent.create({
    data: {
      userId,
      feature: "cover_letter",
      createdAt: new Date(Date.now() - ageMs),
    },
  });
}

describe("pruneRateLimitEvents", () => {
  it("deletes rows past the retention window and keeps the rest", async () => {
    const user = await createTestUser();

    const stale = await seedEvent(user.id, RETENTION_MS + HOUR_MS);
    const fresh = await seedEvent(user.id, 30 * 60 * 1000);

    const { deleted } = await pruneRateLimitEvents();
    expect(deleted).toBe(1);

    const remaining = await prisma.rateLimitEvent.findMany({ select: { id: true } });
    expect(remaining.map((r) => r.id)).toEqual([fresh.id]);
    expect(remaining.map((r) => r.id)).not.toContain(stale.id);
  });

  it("never deletes events still inside an active limiting window", async () => {
    const user = await createTestUser();

    // 30 minutes old: still counts against the 1-hour budgets.
    await seedEvent(user.id, 30 * 60 * 1000);

    // Even asked to delete everything, the floor protects live events —
    // otherwise a mistaken call would hand every rate-limited user a fresh
    // budget on the spot.
    const { deleted } = await pruneRateLimitEvents(0);

    expect(deleted).toBe(0);
    expect(await prisma.rateLimitEvent.count()).toBe(1);
  });

  it("prunes IP-keyed rows too, not just user-keyed ones", async () => {
    await prisma.rateLimitEvent.create({
      data: {
        ipHash: "hash-of-some-ip",
        feature: "signup",
        createdAt: new Date(Date.now() - (RETENTION_MS + HOUR_MS)),
      },
    });

    const { deleted } = await pruneRateLimitEvents();

    expect(deleted).toBe(1);
    expect(await prisma.rateLimitEvent.count()).toBe(0);
  });

  it("is a no-op on an empty ledger", async () => {
    const { deleted } = await pruneRateLimitEvents();
    expect(deleted).toBe(0);
  });
});

describe("the prune cron route", () => {
  const REAL_SECRET = "cron-secret-for-tests";
  let previous: string | undefined;

  beforeEach(() => {
    previous = process.env.CRON_SECRET;
    process.env.CRON_SECRET = REAL_SECRET;
  });

  afterEach(() => {
    if (previous === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previous;
  });

  function call(authorization?: string) {
    return pruneRoute(
      new Request("https://example.test/api/cron/prune-rate-limits", {
        headers: authorization ? { authorization } : {},
      })
    );
  }

  it("runs the prune and reports the count for Vercel Cron", async () => {
    const user = await createTestUser();
    await seedEvent(user.id, RETENTION_MS + HOUR_MS);

    const response = await call(`Bearer ${REAL_SECRET}`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deleted: 1 });
    expect(await prisma.rateLimitEvent.count()).toBe(0);
  });

  it("rejects a request with no Authorization header", async () => {
    const user = await createTestUser();
    await seedEvent(user.id, RETENTION_MS + HOUR_MS);

    const response = await call();

    expect(response.status).toBe(401);
    // The unauthorized request must not have done the work anyway.
    expect(await prisma.rateLimitEvent.count()).toBe(1);
  });

  it("rejects a wrong secret", async () => {
    const response = await call("Bearer not-the-secret");
    expect(response.status).toBe(401);
  });

  it("fails closed when CRON_SECRET is unset", async () => {
    delete process.env.CRON_SECRET;

    // An unset secret must mean "nobody can call this" — never "anybody can",
    // which is what a naive `header === process.env.CRON_SECRET` comparison
    // would produce for a caller sending "Bearer undefined".
    expect((await call()).status).toBe(401);
    expect((await call("Bearer undefined")).status).toBe(401);
  });
});
