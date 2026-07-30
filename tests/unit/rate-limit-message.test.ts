import { describe, it, expect, afterEach, vi } from "vitest";
import { rateLimitMessage, retryAtOf } from "@/lib/rate-limit-message";

// Pure formatting — no DB, no network. The date branch is faked so the tests
// don't behave differently depending on what time of day they run.

const ERROR = "You've used all 2 Gmail syncs for this hour.";

afterEach(() => {
  vi.useRealTimers();
});

/** Pins "now" so same-day vs next-day formatting is deterministic. */
function freezeAt(iso: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
}

describe("rateLimitMessage", () => {
  it("appends the unlock time when one is given", () => {
    freezeAt("2026-07-30T14:00:00");

    const message = rateLimitMessage(ERROR, new Date("2026-07-30T15:42:00").toISOString());

    expect(message).toContain(ERROR);
    expect(message).toMatch(/you can try again at/i);
    // Rendered in the runtime's locale, so assert on the parts rather than an
    // exact string — the point is that a wall-clock time appears at all.
    expect(message).toMatch(/42/);
  });

  it("returns the error untouched when there is no retry time", () => {
    // Not every error is a rate-limit refusal; those must pass through clean.
    expect(rateLimitMessage(ERROR)).toBe(ERROR);
    expect(rateLimitMessage(ERROR, undefined)).toBe(ERROR);
  });

  it("returns the error untouched when retryAt is unparseable", () => {
    // A malformed value must degrade to the plain message, never to
    // "try again at Invalid Date".
    expect(rateLimitMessage(ERROR, "not-a-date")).toBe(ERROR);
    expect(rateLimitMessage(ERROR, "")).toBe(ERROR);
    expect(rateLimitMessage(ERROR, "2026-13-45T99:99:99Z")).toBe(ERROR);
  });

  it("omits the weekday when the unlock time is later the same day", () => {
    freezeAt("2026-07-30T09:00:00");

    const message = rateLimitMessage(ERROR, new Date("2026-07-30T10:30:00").toISOString());

    expect(message).not.toMatch(/mon|tue|wed|thu|fri|sat|sun/i);
  });

  it("includes the weekday when the unlock time falls on the next day", () => {
    // 23:30 + an hour crosses midnight: a bare "12:30 AM" would be ambiguous
    // about which day it means.
    freezeAt("2026-07-30T23:30:00");

    const message = rateLimitMessage(ERROR, new Date("2026-07-31T00:30:00").toISOString());

    expect(message).toMatch(/mon|tue|wed|thu|fri|sat|sun/i);
  });
});

describe("retryAtOf", () => {
  it("extracts a string retryAt from an action result", () => {
    expect(retryAtOf({ error: ERROR, retryAt: "2026-07-30T15:42:00Z" })).toBe(
      "2026-07-30T15:42:00Z"
    );
  });

  it("returns undefined when the payload has no retryAt", () => {
    expect(retryAtOf({ error: "Suggestion not found" })).toBeUndefined();
    expect(retryAtOf({ success: true })).toBeUndefined();
  });

  it("ignores a retryAt that isn't a string", () => {
    // Server Action results cross the network as JSON; anything that arrives
    // as a non-string here is a bug, and must not reach `new Date()`.
    expect(retryAtOf({ retryAt: 1234 })).toBeUndefined();
    expect(retryAtOf({ retryAt: new Date() })).toBeUndefined();
    expect(retryAtOf({ retryAt: null })).toBeUndefined();
  });

  it("tolerates values that aren't objects at all", () => {
    expect(retryAtOf(null)).toBeUndefined();
    expect(retryAtOf(undefined)).toBeUndefined();
    expect(retryAtOf("a string")).toBeUndefined();
  });
});
