/**
 * Client-safe formatting for a rate-limit refusal.
 *
 * Lives apart from `@/lib/rate-limit` because that module imports Prisma and so
 * can never cross to the browser — the same split as `entitlements.ts` (server)
 * vs `pro.ts` (client-safe copy).
 *
 * The formatting has to happen here, in the browser, rather than in the Server
 * Action: Vercel's runtime clock is UTC, so a server-rendered time would tell a
 * Waterloo student their sync unlocks at 19:42 when they think in 3:42pm.
 * Actions send an ISO instant; the viewer's own locale turns it into a wall
 * clock they recognise.
 */
export function rateLimitMessage(error: string, retryAt?: string): string {
  if (!retryAt) return error;

  const unlocksAt = new Date(retryAt);
  if (Number.isNaN(unlocksAt.getTime())) return error;

  // Same day (the common case, since every window is an hour or less) → show a
  // bare clock time. Past midnight, include the weekday so "12:20 AM" isn't
  // ambiguous about which one.
  const crossesIntoTomorrow =
    unlocksAt.toDateString() !== new Date().toDateString();

  const time = unlocksAt.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    ...(crossesIntoTomorrow ? { weekday: "short" } : {}),
  });

  return `${error} You can try again at ${time}.`;
}

/** Narrowing helper: does this action result carry a retry time? */
export function retryAtOf(result: unknown): string | undefined {
  if (result && typeof result === "object" && "retryAt" in result) {
    const { retryAt } = result as { retryAt?: unknown };
    if (typeof retryAt === "string") return retryAt;
  }
  return undefined;
}
