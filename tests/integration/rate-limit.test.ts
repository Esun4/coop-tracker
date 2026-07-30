import { describe, it, expect, beforeEach, beforeAll } from "vitest";

// Prisma is NOT mocked here — this exercises the real ledger against the test DB.
import { prisma } from "@/lib/prisma";
import { resetDb, createTestUser } from "../helpers/db";
import { checkRateLimit, checkIpRateLimit } from "@/lib/rate-limit";

const WINDOW_MS = 60 * 60 * 1000;

// Stand-ins for the HMACs `client-ip.ts` produces — the limiter only ever sees
// opaque strings, so the tests don't need real hashes.
const IP_A = "hash-of-ip-a";
const IP_B = "hash-of-ip-b";

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
});

beforeEach(async () => {
  await resetDb();
});

describe("checkRateLimit (per user)", () => {
  it("allows the first N attempts and blocks the (N+1)th within the window", async () => {
    const user = await createTestUser();

    const results = [];
    for (let i = 0; i < 11; i++) {
      results.push(await checkRateLimit(user.id, "cover_letter", 10, WINDOW_MS));
    }

    // First 10 allowed, 11th blocked.
    expect(results.slice(0, 10).every((r) => r.allowed)).toBe(true);
    expect(results[10].allowed).toBe(false);

    // Exactly 10 events were recorded — the blocked attempt records nothing.
    const count = await prisma.rateLimitEvent.count({
      where: { userId: user.id, feature: "cover_letter" },
    });
    expect(count).toBe(10);
  });

  it("scopes the budget per feature — one feature does not consume another's", async () => {
    const user = await createTestUser();

    for (let i = 0; i < 10; i++) {
      await checkRateLimit(user.id, "cover_letter", 10, WINDOW_MS);
    }

    // cover_letter is now exhausted...
    expect((await checkRateLimit(user.id, "cover_letter", 10, WINDOW_MS)).allowed).toBe(false);
    // ...but a different feature has its own fresh budget.
    expect((await checkRateLimit(user.id, "resume_tailor", 10, WINDOW_MS)).allowed).toBe(true);
  });

  it("ignores events older than the window", async () => {
    const user = await createTestUser();

    // Seed an event two hours in the past — outside a one-hour window.
    await prisma.rateLimitEvent.create({
      data: {
        userId: user.id,
        feature: "cover_letter",
        createdAt: new Date(Date.now() - 2 * WINDOW_MS),
      },
    });

    // With a limit of 1, the stale event must not count, so this is allowed.
    expect((await checkRateLimit(user.id, "cover_letter", 1, WINDOW_MS)).allowed).toBe(true);
  });

  it("scopes the budget per user", async () => {
    const a = await createTestUser();
    const b = await createTestUser();

    await checkRateLimit(a.id, "cover_letter", 1, WINDOW_MS); // a uses its only slot
    expect((await checkRateLimit(a.id, "cover_letter", 1, WINDOW_MS)).allowed).toBe(false);
    expect((await checkRateLimit(b.id, "cover_letter", 1, WINDOW_MS)).allowed).toBe(true);
  });
});

describe("checkIpRateLimit (per network)", () => {
  it("blocks past the limit and records nothing for the blocked attempt", async () => {
    for (let i = 0; i < 2; i++) {
      expect((await checkIpRateLimit(IP_A, "signup", 2, WINDOW_MS)).allowed).toBe(true);
    }
    expect((await checkIpRateLimit(IP_A, "signup", 2, WINDOW_MS)).allowed).toBe(false);

    const count = await prisma.rateLimitEvent.count({
      where: { ipHash: IP_A, feature: "signup" },
    });
    expect(count).toBe(2);
  });

  it("scopes the budget per IP", async () => {
    await checkIpRateLimit(IP_A, "signup", 1, WINDOW_MS);
    expect((await checkIpRateLimit(IP_A, "signup", 1, WINDOW_MS)).allowed).toBe(false);
    expect((await checkIpRateLimit(IP_B, "signup", 1, WINDOW_MS)).allowed).toBe(true);
  });

  it("records IP events with no owning user", async () => {
    await checkIpRateLimit(IP_A, "signup", 5, WINDOW_MS);

    const event = await prisma.rateLimitEvent.findFirstOrThrow({
      where: { ipHash: IP_A },
    });
    // Signed-out callers have no account, so the FK must stay null rather than
    // being back-filled with some placeholder user.
    expect(event.userId).toBeNull();
  });

  it("keeps the user and IP budgets independent", async () => {
    const user = await createTestUser();

    // Exhaust the user budget for a feature...
    await checkRateLimit(user.id, "cover_letter", 1, WINDOW_MS);
    expect((await checkRateLimit(user.id, "cover_letter", 1, WINDOW_MS)).allowed).toBe(false);

    // ...the IP budget for the same feature is untouched. This is what stops a
    // user's own exhausted quota from locking out everyone on their network.
    expect((await checkIpRateLimit(IP_A, "cover_letter", 1, WINDOW_MS)).allowed).toBe(true);
  });
});

describe("retryAt", () => {
  it("points at when the oldest event leaves the window, not a full window from now", async () => {
    const user = await createTestUser();

    // A single slot, spent 50 minutes ago. It frees 10 minutes from now.
    const spentAt = new Date(Date.now() - 50 * 60 * 1000);
    await prisma.rateLimitEvent.create({
      data: { userId: user.id, feature: "gmail_sync", createdAt: spentAt },
    });

    const result = await checkRateLimit(user.id, "gmail_sync", 1, WINDOW_MS);
    expect(result.allowed).toBe(false);
    if (result.allowed) return; // narrowing for TS

    const expected = spentAt.getTime() + WINDOW_MS;
    expect(Math.abs(result.retryAt.getTime() - expected)).toBeLessThan(1000);

    // Roughly 10 minutes out — emphatically not the full hour a naive
    // "now + window" would have quoted.
    const minutesAway = (result.retryAt.getTime() - Date.now()) / 60000;
    expect(minutesAway).toBeGreaterThan(8);
    expect(minutesAway).toBeLessThan(12);
  });

  it("quotes the surplus-adjusted event when more than `limit` events are in the window", async () => {
    const user = await createTestUser();

    // Three events, oldest first. With a limit of 2, the budget frees when the
    // *second* one expires — the oldest leaving still leaves 2 in the window.
    const times = [90, 60, 30].map((m) => new Date(Date.now() - m * 60 * 1000));
    for (const createdAt of times) {
      await prisma.rateLimitEvent.create({
        data: { userId: user.id, feature: "gmail_sync", createdAt },
      });
    }

    // A 2-hour window so all three still count.
    const twoHours = 2 * WINDOW_MS;
    const result = await checkRateLimit(user.id, "gmail_sync", 2, twoHours);
    expect(result.allowed).toBe(false);
    if (result.allowed) return;

    const expected = times[1].getTime() + twoHours;
    expect(Math.abs(result.retryAt.getTime() - expected)).toBeLessThan(1000);
  });
});
