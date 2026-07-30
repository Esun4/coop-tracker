import { prisma } from "@/lib/prisma";
import { getClientIpHash } from "@/lib/client-ip";

/**
 * Outcome of one rate-limit check.
 *
 * `retryAt` is the moment a slot actually frees up — the oldest event still
 * inside the window, plus the window length — not simply "now + window". It is
 * returned as a Date and formatted at the very edge (in the browser), because
 * the server renders in UTC on Vercel and would tell a Waterloo student their
 * sync unlocks at 19:42 when they mean 3:42pm.
 */
export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAt: Date };

// A ledger row belongs to exactly one subject. Modelling it as a union (rather
// than two optional fields) makes "both" and "neither" unrepresentable, so the
// schema's un-enforceable rule becomes a compile-time one.
type Subject = { userId: string } | { ipHash: string };

/**
 * Generic rolling-window limiter backed by the `RateLimitEvent` ledger. Each
 * (subject, feature) pair gets its own independent budget.
 *
 * This is a check-AND-record operation: under the limit, we insert an event and
 * allow; at or over it, we record nothing and report when to come back. The
 * insert happens up front, before the expensive work, so an attempt counts
 * against quota even if the downstream call later fails — the cost was still
 * incurred.
 *
 * Note: there's a tiny race window where two concurrent requests can both pass
 * the count check before either inserts. At this app's scale that's acceptable;
 * tightening it would need a transaction or a unique-window constraint.
 */
async function consume(
  subject: Subject,
  feature: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  const windowStart = new Date(Date.now() - windowMs);
  const where = { ...subject, feature, createdAt: { gte: windowStart } };

  const recentCount = await prisma.rateLimitEvent.count({ where });

  if (recentCount >= limit) {
    // Which event has to expire before a slot opens? With `limit` events in the
    // window it's the oldest one. If somehow more than `limit` are in there
    // (a race, or a limit that was lowered since), skip past the surplus so we
    // quote the honest time rather than an optimistic one.
    const nextToExpire = await prisma.rateLimitEvent.findFirst({
      where,
      orderBy: { createdAt: "asc" },
      skip: recentCount - limit,
      select: { createdAt: true },
    });

    return {
      allowed: false,
      retryAt: new Date(
        (nextToExpire?.createdAt.getTime() ?? Date.now()) + windowMs
      ),
    };
  }

  await prisma.rateLimitEvent.create({ data: { ...subject, feature } });
  return { allowed: true };
}

/** Per-account budget. Survives IP changes; the primary cost control. */
export function checkRateLimit(
  userId: string,
  feature: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  return consume({ userId }, feature, limit, windowMs);
}

/**
 * Per-network budget, keyed by the HMAC from `client-ip.ts`.
 *
 * This is the abuse backstop, not the cost control: it catches one host farming
 * many accounts, and covers signed-out endpoints where there is no account to
 * key on. It is deliberately looser than the per-user budget so that several
 * students behind one campus NAT don't fight over a single quota.
 */
export function checkIpRateLimit(
  ipHash: string,
  feature: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  return consume({ ipHash }, feature, limit, windowMs);
}

// ─── Policy ─────────────────────────────────────────────────
//
// Every budget in the app, in one table. These are sized around the OpenAI
// credit balance, not around what the servers could handle — retune here when
// that changes, and no call site needs touching.
//
// `user` is the real cost control (it survives IP changes). `ip` is the abuse
// backstop and is deliberately looser, so a few students behind one campus NAT
// don't share a single budget. Signed-out features have no `user` budget
// because there is no account yet to key one on.

const HOUR_MS = 60 * 60 * 1000;

type Budget = {
  /** Per-account cap. Omitted for signed-out features. */
  user?: number;
  /** Per-network cap. */
  ip: number;
  windowMs: number;
  /** Plural noun for the user-facing message, e.g. "cover letter generations". */
  noun: string;
};

export const RATE_LIMITS = {
  cover_letter: { user: 5, ip: 10, windowMs: HOUR_MS, noun: "cover letter generations" },
  // 6, not 5: one session is analyze → tailor → compare, so this is cleanly two
  // full sessions rather than one-and-a-bit.
  resume_tailor: { user: 6, ip: 12, windowMs: HOUR_MS, noun: "resume steps" },
  email_draft: { user: 5, ip: 10, windowMs: HOUR_MS, noun: "email drafts" },
  // Deliberately a separate, looser bucket from `email_draft`: sharing one
  // would mean drafting 5 replies left you unable to send any of them. Sending
  // costs no API credits, so this exists only to cap outbound spam.
  email_send: { user: 10, ip: 20, windowMs: HOUR_MS, noun: "email replies" },
  gmail_sync: { user: 2, ip: 4, windowMs: HOUR_MS, noun: "Gmail syncs" },
  signup: { ip: 5, windowMs: HOUR_MS, noun: "sign-up attempts" },
  signin: { ip: 10, windowMs: 15 * 60 * 1000, noun: "sign-in attempts" },
} as const satisfies Record<string, Budget>;

export type RateLimitedFeature = keyof typeof RATE_LIMITS;

/**
 * The longest window any budget uses. Nothing older than this can affect a
 * limiting decision, so it is the hard floor for how much history must be kept.
 * Derived rather than hardcoded so adding a longer window can't silently make
 * the retention policy wrong.
 */
const MAX_WINDOW_MS = Math.max(
  ...Object.values(RATE_LIMITS).map((b: Budget) => b.windowMs)
);

/**
 * How much history to keep. Well above `MAX_WINDOW_MS` on purpose: limiting
 * only needs the last hour, but a day of history is useful for answering "did
 * this user actually get rate limited last night?" and costs little.
 */
export const RETENTION_MS = 24 * HOUR_MS;

/**
 * Deletes ledger rows too old to matter. Called by the daily cron in
 * `src/app/api/cron/prune-rate-limits/route.ts`.
 *
 * This is a scheduled job rather than opportunistic cleanup inside `consume()`
 * on purpose: pruning inline would make a random unlucky request pay for a bulk
 * delete, and would make tests non-deterministic.
 *
 * @param olderThanMs age above which rows are deleted; floored at
 *                    `MAX_WINDOW_MS` so a mistaken caller can never delete
 *                    events still inside an active window and hand someone a
 *                    fresh budget.
 * @returns how many rows were removed
 */
export async function pruneRateLimitEvents(
  olderThanMs: number = RETENTION_MS
): Promise<{ deleted: number }> {
  const age = Math.max(olderThanMs, MAX_WINDOW_MS);
  const cutoff = new Date(Date.now() - age);

  const { count } = await prisma.rateLimitEvent.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });

  return { deleted: count };
}

/**
 * What a blocked call returns to the client. `retryAt` is an ISO string rather
 * than a Date because Server Action results cross the network — the client
 * parses and formats it in the viewer's own timezone.
 */
export type RateLimitFailure = { error: string; retryAt: string };

function failure(feature: RateLimitedFeature, cap: number, retryAt: Date): RateLimitFailure {
  const { noun, windowMs } = RATE_LIMITS[feature];
  // Derived from the budget rather than hardcoded, so a window that isn't an
  // hour (sign-in is 15 minutes) doesn't quietly tell the user the wrong thing.
  const minutes = Math.round(windowMs / 60_000);
  const window = minutes === 60 ? "hour" : `${minutes} minutes`;

  return {
    error: `You've used all ${cap} ${noun} for this ${window}.`,
    retryAt: retryAt.toISOString(),
  };
}

/**
 * The single entry point every rate-limited Server Action calls.
 *
 * Returns `null` when the call may proceed, or a ready-to-return failure object
 * when it may not.
 *
 * Order matters: the per-user budget is checked *first*. Both checks record an
 * event, so checking IP first would mean a user who is already over their own
 * quota keeps consuming IP slots on every retry — penalising whoever shares
 * their network. Checking the tighter, more specific budget first avoids that.
 *
 * @param userId omit for signed-out callers (sign-up, sign-in)
 * @param source explicit request headers, for callers outside a Server Action
 *               where the ambient `next/headers` store isn't reliable (the
 *               NextAuth `authorize` callback). Omit inside Server Actions.
 */
export async function enforceRateLimit(
  feature: RateLimitedFeature,
  userId?: string,
  source?: Headers
): Promise<RateLimitFailure | null> {
  const budget: Budget = RATE_LIMITS[feature];

  if (budget.user !== undefined && userId) {
    const perUser = await checkRateLimit(userId, feature, budget.user, budget.windowMs);
    if (!perUser.allowed) return failure(feature, budget.user, perUser.retryAt);
  }

  const perIp = await checkIpRateLimit(
    await getClientIpHash(source),
    feature,
    budget.ip,
    budget.windowMs
  );
  if (!perIp.allowed) return failure(feature, budget.ip, perIp.retryAt);

  return null;
}
