import { prisma } from "@/lib/prisma";

/**
 * Generic per-user, per-feature rate limiter backed by the `RateLimitEvent`
 * ledger. Each feature (e.g. "cover_letter", "resume_tailor") gets its own
 * independent budget because the count is scoped by `feature`.
 *
 * This is a check-AND-record operation: if the user is under the limit we
 * insert an event and return `true`; otherwise we return `false` and record
 * nothing. We record up-front (before the expensive work runs) so an attempt
 * counts against quota even if the downstream call later fails — the cost was
 * still incurred.
 *
 * Note: there's a tiny race window where two concurrent requests can both pass
 * the count check before either inserts. At this app's scale that's acceptable;
 * tightening it would need a transaction or a unique-window constraint.
 *
 * @param userId   the owner the budget belongs to
 * @param feature  discriminator for which budget (e.g. "cover_letter")
 * @param limit    max allowed events within the window
 * @param windowMs size of the rolling window in milliseconds
 * @returns `true` if the action is allowed (and was recorded), `false` if blocked
 */
export async function checkRateLimit(
  userId: string,
  feature: string,
  limit: number,
  windowMs: number
): Promise<boolean> {
  const windowStart = new Date(Date.now() - windowMs);

  const recentCount = await prisma.rateLimitEvent.count({
    where: { userId, feature, createdAt: { gte: windowStart } },
  });

  if (recentCount >= limit) return false;

  await prisma.rateLimitEvent.create({ data: { userId, feature } });
  return true;
}
