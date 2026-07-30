import { createHmac } from "node:crypto";
import { headers } from "next/headers";

/**
 * SERVER ONLY. Turns the incoming request into a stable, non-identifying
 * bucket key for IP-based rate limiting.
 *
 * Three deliberate decisions live here:
 *
 * 1. **Which header to trust.** `x-forwarded-for` is caller-supplied and
 *    trivially spoofed by anyone hitting the origin directly. It is only
 *    trustworthy because Vercel's proxy *overwrites* it. `x-vercel-forwarded-for`
 *    is preferred where present since Vercel always sets it itself. If this app
 *    is ever self-hosted behind a different proxy, revisit this function — a
 *    proxy that appends instead of overwrites makes the limiter bypassable.
 *
 * 2. **IPv6 is bucketed by /64, not by address.** An IPv6 client is typically
 *    handed a whole /64 (or larger), so limiting per address is defeated by
 *    picking a new one from the same subnet. IPv4 is limited per address.
 *
 * 3. **Addresses are HMAC'd, never stored raw.** An IP is personal data, and a
 *    plain SHA-256 of the ~4-billion IPv4 space is brute-forceable in seconds.
 *    Keying the HMAC with AUTH_SECRET makes the stored value useless to anyone
 *    without the secret, while staying deterministic so counting still works.
 */

// Callers with no usable address (local dev, or a proxy that forwards none)
// all share this one bucket. That is intentionally fail-closed: treating
// "unknown" as unlimited would silently turn the limiter into a no-op if the
// proxy config ever regressed.
const UNKNOWN_BUCKET = "unknown";

/**
 * Picks the client address out of the proxy headers, most-trustworthy first.
 * Returns null when no header carries one.
 */
export function extractClientIp(source: Headers): string | null {
  const candidate =
    source.get("x-vercel-forwarded-for") ??
    source.get("x-forwarded-for") ??
    source.get("x-real-ip");

  if (!candidate) return null;

  // A forwarded chain is "client, proxy1, proxy2" — the client is leftmost.
  const first = candidate.split(",")[0]?.trim();
  if (!first) return null;

  return stripPort(first);
}

/**
 * Removes a trailing port so "1.2.3.4:5678" and "1.2.3.4" bucket together.
 * Bare IPv6 is full of colons, so only strip when it is unambiguous:
 * bracketed ("[::1]:443") or a single colon (IPv4).
 */
function stripPort(address: string): string {
  if (address.startsWith("[")) {
    const end = address.indexOf("]");
    return end === -1 ? address : address.slice(1, end);
  }
  const colons = address.split(":").length - 1;
  return colons === 1 ? address.split(":")[0] : address;
}

/**
 * Expands an IPv6 address to its 8 hextets, resolving the "::" run of zeroes.
 * Returns null for anything that isn't parseable as IPv6.
 */
function expandIpv6(address: string): string[] | null {
  // Drop any zone id ("fe80::1%eth0") — not part of the routable address.
  const base = address.split("%")[0].toLowerCase();

  const halves = base.split("::");
  if (halves.length > 2) return null; // "::" may appear at most once

  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];

  let groups: string[];
  if (halves.length === 1) {
    groups = head;
  } else {
    const missing = 8 - head.length - tail.length;
    if (missing < 0) return null;
    groups = [...head, ...Array<string>(missing).fill("0"), ...tail];
  }

  if (groups.length !== 8) return null;
  if (!groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return null;

  return groups;
}

/**
 * Normalises an address into the string that identifies its budget:
 * IPv4 → the address itself; IPv6 → its /64 prefix.
 */
export function ipBucket(address: string | null): string {
  if (!address) return UNKNOWN_BUCKET;

  const trimmed = address.trim();
  if (!trimmed) return UNKNOWN_BUCKET;

  if (!trimmed.includes(":")) return trimmed; // IPv4

  // "::ffff:1.2.3.4" is an IPv4 address wearing an IPv6 costume — bucket it as
  // the IPv4 it really is, so the same client can't get two budgets.
  const lower = trimmed.toLowerCase();
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(lower);
  if (mapped) return mapped[1];

  const groups = expandIpv6(lower);
  // Unparseable: fall back to the literal string rather than collapsing every
  // malformed value into one shared bucket.
  if (!groups) return lower;

  // Strip leading zeroes so "0db8" and "db8" are one bucket, not two.
  const prefix = groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, ""));
  return `${prefix.join(":")}::/64`;
}

/**
 * HMACs a bucket key so the ledger never holds a raw address.
 * Throws when AUTH_SECRET is missing: an unkeyed hash would be a false sense
 * of privacy, and failing loudly at boot beats shipping one.
 */
export function hashIpBucket(bucket: string): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is required to hash client IPs");
  }
  return createHmac("sha256", secret).update(bucket).digest("hex");
}

/**
 * The one function call sites use.
 *
 * @param source explicit headers, for contexts that have a Request but no
 *               `next/headers` store (e.g. the NextAuth `authorize` callback).
 *               Omit inside Server Actions.
 */
export async function getClientIpHash(source?: Headers): Promise<string> {
  const requestHeaders = source ?? (await headers());
  return hashIpBucket(ipBucket(extractClientIp(requestHeaders)));
}
