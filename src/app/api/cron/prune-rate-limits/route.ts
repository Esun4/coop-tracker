import { pruneRateLimitEvents } from "@/lib/rate-limit";

/**
 * Daily maintenance: drop `RateLimitEvent` rows too old to affect any budget.
 *
 * This is one of the few HTTP routes in the app — the "everything is a Server
 * Action" rule can't apply here, because Vercel Cron invokes an URL and there
 * is no user session to authenticate. That makes the authorization below the
 * only thing standing between the internet and this endpoint.
 *
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET` when that environment
 * variable is set on the project. We fail closed when it isn't: an unset secret
 * must mean "nobody can call this", never "anybody can".
 *
 * Schedule lives in `vercel.json`.
 */
export async function GET(request: Request): Promise<Response> {
  const expected = process.env.CRON_SECRET;

  if (!expected) {
    // Misconfiguration, not an attack — say so in the logs, but tell the caller
    // nothing beyond "no".
    console.error("CRON_SECRET is not set; refusing to run the prune job.");
    return new Response("Unauthorized", { status: 401 });
  }

  if (request.headers.get("authorization") !== `Bearer ${expected}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { deleted } = await pruneRateLimitEvents();

  // Logged so the daily run is visible in Vercel's function logs — a job that
  // silently stops working looks exactly like a job with nothing to do.
  console.log(`Pruned ${deleted} rate-limit events.`);

  return Response.json({ deleted });
}
