import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isPro } from "@/lib/entitlements";

/**
 * The entitlement rule, tested as the pure function it is — no database, no
 * clock. Everything the paywall does hangs off this predicate, so it is worth
 * pinning every branch.
 */

const NOW = new Date("2026-07-26T12:00:00Z");
const YESTERDAY = new Date("2026-07-25T12:00:00Z");
const TOMORROW = new Date("2026-07-27T12:00:00Z");

const BASE = { email: "student@uwaterloo.ca", plan: "FREE", proUntil: null };

// Saved once, restored after every test: blindly deleting the variable would
// leak this file's setup into whatever the developer actually has configured.
const ORIGINAL_PRO_USER_EMAILS = process.env.PRO_USER_EMAILS;

beforeEach(() => {
  // Start each test with nobody comped, whatever the environment says.
  delete process.env.PRO_USER_EMAILS;
});

afterEach(() => {
  if (ORIGINAL_PRO_USER_EMAILS === undefined) {
    delete process.env.PRO_USER_EMAILS;
  } else {
    process.env.PRO_USER_EMAILS = ORIGINAL_PRO_USER_EMAILS;
  }
});

describe("isPro — plan and expiry", () => {
  it("locks a free account", () => {
    expect(isPro({ ...BASE, plan: "FREE" }, NOW)).toBe(false);
  });

  it("unlocks a Pro account with no expiry (comped or lifetime)", () => {
    expect(isPro({ ...BASE, plan: "PRO", proUntil: null }, NOW)).toBe(true);
  });

  it("unlocks a Pro account whose period has not closed yet", () => {
    expect(isPro({ ...BASE, plan: "PRO", proUntil: TOMORROW }, NOW)).toBe(true);
  });

  it("locks a Pro account whose period has closed", () => {
    expect(isPro({ ...BASE, plan: "PRO", proUntil: YESTERDAY }, NOW)).toBe(false);
  });

  it("treats the exact expiry instant as over", () => {
    expect(isPro({ ...BASE, plan: "PRO", proUntil: NOW }, NOW)).toBe(false);
  });

  it("ignores proUntil entirely when the plan is FREE", () => {
    // A stale future date left behind by a downgrade must not grant access.
    expect(isPro({ ...BASE, plan: "FREE", proUntil: TOMORROW }, NOW)).toBe(false);
  });
});

describe("isPro — PRO_USER_EMAILS allowlist", () => {
  it("grants access to a listed email even on the FREE plan", () => {
    process.env.PRO_USER_EMAILS = "student@uwaterloo.ca";
    expect(isPro({ ...BASE, plan: "FREE" }, NOW)).toBe(true);
  });

  it("matches case-insensitively and ignores surrounding whitespace", () => {
    process.env.PRO_USER_EMAILS = "  Student@UWaterloo.CA , other@test.dev ";
    expect(isPro({ ...BASE, email: "STUDENT@uwaterloo.ca" }, NOW)).toBe(true);
    expect(isPro({ ...BASE, email: "other@test.dev" }, NOW)).toBe(true);
  });

  it("overrides an expired subscription", () => {
    process.env.PRO_USER_EMAILS = "student@uwaterloo.ca";
    expect(isPro({ ...BASE, plan: "PRO", proUntil: YESTERDAY }, NOW)).toBe(true);
  });

  it("grants nothing when the variable is unset", () => {
    expect(isPro({ ...BASE, plan: "FREE" }, NOW)).toBe(false);
  });

  it("grants nothing when the variable is empty or only separators", () => {
    // A blank entry must not become a wildcard that unlocks every account.
    process.env.PRO_USER_EMAILS = " , ,, ";
    expect(isPro({ ...BASE, plan: "FREE" }, NOW)).toBe(false);
    expect(isPro({ ...BASE, plan: "FREE", email: "" }, NOW)).toBe(false);
  });

  it("does not match a non-listed email", () => {
    process.env.PRO_USER_EMAILS = "someone@else.dev";
    expect(isPro({ ...BASE, plan: "FREE" }, NOW)).toBe(false);
  });
});
