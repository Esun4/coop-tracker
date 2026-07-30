import { describe, it, expect, beforeAll } from "vitest";
import { extractClientIp, ipBucket, hashIpBucket } from "@/lib/client-ip";

// No DB, no network — this is pure header parsing and hashing.

beforeAll(() => {
  process.env.AUTH_SECRET ??= "test-secret-for-ip-hashing";
});

function headersOf(entries: Record<string, string>): Headers {
  return new Headers(entries);
}

describe("extractClientIp", () => {
  it("prefers the Vercel-set header over the caller-supplied one", () => {
    // x-forwarded-for is attacker-controllable when a request reaches the
    // origin directly; x-vercel-forwarded-for is written by the proxy itself.
    const h = headersOf({
      "x-vercel-forwarded-for": "203.0.113.7",
      "x-forwarded-for": "1.2.3.4",
    });
    expect(extractClientIp(h)).toBe("203.0.113.7");
  });

  it("takes the leftmost hop from a forwarded chain", () => {
    const h = headersOf({ "x-forwarded-for": "203.0.113.7, 70.41.3.18, 150.172.238.178" });
    expect(extractClientIp(h)).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip", () => {
    expect(extractClientIp(headersOf({ "x-real-ip": "198.51.100.9" }))).toBe("198.51.100.9");
  });

  it("returns null when no proxy header carries an address", () => {
    expect(extractClientIp(headersOf({ "user-agent": "curl" }))).toBeNull();
  });

  it("strips a port so the same client buckets consistently", () => {
    expect(extractClientIp(headersOf({ "x-real-ip": "203.0.113.7:54321" }))).toBe("203.0.113.7");
    expect(extractClientIp(headersOf({ "x-real-ip": "[2001:db8::1]:443" }))).toBe("2001:db8::1");
  });

  it("leaves a bare IPv6 address intact", () => {
    const h = headersOf({ "x-real-ip": "2001:db8::1" });
    expect(extractClientIp(h)).toBe("2001:db8::1");
  });
});

describe("ipBucket", () => {
  it("buckets IPv4 per address", () => {
    expect(ipBucket("203.0.113.7")).toBe("203.0.113.7");
    expect(ipBucket("203.0.113.8")).not.toBe(ipBucket("203.0.113.7"));
  });

  it("buckets IPv6 by /64, so a new address in the same subnet does not reset the budget", () => {
    const a = ipBucket("2001:db8:abcd:1234:1::1");
    const b = ipBucket("2001:db8:abcd:1234:ffff:ffff:ffff:ffff");
    expect(a).toBe(b);
  });

  it("keeps different IPv6 /64s apart", () => {
    expect(ipBucket("2001:db8:abcd:1234::1")).not.toBe(ipBucket("2001:db8:abcd:9999::1"));
  });

  it("normalises IPv6 spelling — compression, leading zeroes, and case", () => {
    const canonical = ipBucket("2001:db8:0:1::1");
    expect(ipBucket("2001:0db8:0000:0001:0000:0000:0000:0001")).toBe(canonical);
    expect(ipBucket("2001:DB8:0:1::1")).toBe(canonical);
  });

  it("ignores an IPv6 zone id", () => {
    expect(ipBucket("fe80::1%eth0")).toBe(ipBucket("fe80::1"));
  });

  it("treats an IPv4-mapped IPv6 address as the IPv4 it really is", () => {
    // Otherwise one client could hold two budgets by switching representation.
    expect(ipBucket("::ffff:203.0.113.7")).toBe("203.0.113.7");
  });

  it("collapses missing addresses into a single shared bucket", () => {
    // Fail-closed: an unknown caller is limited, not exempt.
    expect(ipBucket(null)).toBe(ipBucket(""));
    expect(ipBucket(null)).not.toBe(ipBucket("203.0.113.7"));
  });
});

describe("hashIpBucket", () => {
  it("is deterministic, so counting works across requests", () => {
    expect(hashIpBucket("203.0.113.7")).toBe(hashIpBucket("203.0.113.7"));
  });

  it("separates distinct buckets", () => {
    expect(hashIpBucket("203.0.113.7")).not.toBe(hashIpBucket("203.0.113.8"));
  });

  it("never stores the address itself", () => {
    const hash = hashIpBucket("203.0.113.7");
    expect(hash).not.toContain("203.0.113.7");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is keyed by AUTH_SECRET, not a bare digest", () => {
    // A plain SHA-256 of the IPv4 space is brute-forceable in seconds; the HMAC
    // key is what makes a leaked ledger useless.
    const withOriginalSecret = hashIpBucket("203.0.113.7");

    const previous = process.env.AUTH_SECRET;
    process.env.AUTH_SECRET = "a-different-secret";
    const withOtherSecret = hashIpBucket("203.0.113.7");
    process.env.AUTH_SECRET = previous;

    expect(withOtherSecret).not.toBe(withOriginalSecret);
  });
});
