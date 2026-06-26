import { describe, it, expect, beforeEach, beforeAll } from "vitest";

// Prisma is NOT mocked here — this exercises the real ledger against the test DB.
import { prisma } from "@/lib/prisma";
import { resetDb, createTestUser } from "../helpers/db";
import { checkRateLimit } from "@/lib/rate-limit";

const WINDOW_MS = 60 * 60 * 1000;

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
});

beforeEach(async () => {
  await resetDb();
});

describe("checkRateLimit", () => {
  it("allows the first N attempts and blocks the (N+1)th within the window", async () => {
    const user = await createTestUser();

    const results: boolean[] = [];
    for (let i = 0; i < 11; i++) {
      results.push(await checkRateLimit(user.id, "cover_letter", 10, WINDOW_MS));
    }

    // First 10 allowed, 11th blocked.
    expect(results.slice(0, 10).every(Boolean)).toBe(true);
    expect(results[10]).toBe(false);

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
    expect(await checkRateLimit(user.id, "cover_letter", 10, WINDOW_MS)).toBe(false);
    // ...but a different feature has its own fresh budget.
    expect(await checkRateLimit(user.id, "resume_tailor", 10, WINDOW_MS)).toBe(true);
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
    expect(await checkRateLimit(user.id, "cover_letter", 1, WINDOW_MS)).toBe(true);
  });

  it("scopes the budget per user", async () => {
    const a = await createTestUser();
    const b = await createTestUser();

    await checkRateLimit(a.id, "cover_letter", 1, WINDOW_MS); // a uses its only slot
    expect(await checkRateLimit(a.id, "cover_letter", 1, WINDOW_MS)).toBe(false);
    expect(await checkRateLimit(b.id, "cover_letter", 1, WINDOW_MS)).toBe(true);
  });
});
