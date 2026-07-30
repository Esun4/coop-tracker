import { prisma } from "@/lib/prisma";
import { PRO_REQUIRED_MESSAGE, type ProRequired } from "@/lib/pro";

/**
 * Who is entitled to Pro.
 *
 * Server-only — it touches Prisma, so never import this from a client
 * component; import `@/lib/pro` there instead.
 *
 * Entitlement is read from the database on every check rather than carried in
 * the JWT. A token is a snapshot: someone who upgrades would stay locked out
 * until their next token refresh, and someone whose subscription lapses would
 * keep access until theirs. The extra query is one indexed row read, and on the
 * pages that matter it rides along with a user read we were doing anyway.
 */

/** The fields an entitlement decision needs. Kept structural so the pure
 *  predicate below is testable without a database row. */
export type EntitlementUser = {
  email: string;
  plan: string;
  proUntil: Date | null;
};

/**
 * Comped accounts, by email. Read at call time rather than at module load so a
 * test (or a redeploy) can change it without a cold start, and so an unset var
 * simply means "nobody".
 */
function allowlistedEmails(): Set<string> {
  return new Set(
    (process.env.PRO_USER_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

/**
 * The entitlement rule, as a pure function.
 *
 * `proUntil` null means perpetual access — a comped or lifetime account. A date
 * means access ends then, which is what a cancelled Stripe subscription will
 * set so the user keeps what they paid for until the period closes.
 *
 * @param now injectable so expiry is testable without touching the clock
 */
export function isPro(user: EntitlementUser, now: Date = new Date()): boolean {
  if (allowlistedEmails().has(user.email.trim().toLowerCase())) return true;
  if (user.plan !== "PRO") return false;
  return user.proUntil === null || user.proUntil.getTime() > now.getTime();
}

/** Entitlement for one user id. Throws on an unknown id — a session pointing at
 *  a deleted user is an auth failure, not a free-tier user. */
export async function getEntitlements(
  userId: string
): Promise<{ isPro: boolean }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, plan: true, proUntil: true },
  });
  if (!user) throw new Error("Unauthorized");

  return { isPro: isPro(user) };
}

/**
 * The gate every Pro-only server action calls after its auth check.
 *
 * Returns `null` when the user may proceed, or the failure object to return
 * straight to the caller. It returns rather than throws because these actions
 * already answer with `{ error }` and the client renders that as a toast — a
 * throw would surface as an unhandled Server Action error instead of an
 * upgrade prompt.
 *
 * Call it *before* any paid work (OpenAI, Gmail), so a free caller never costs
 * a token or a quota unit.
 */
export async function requirePro(userId: string): Promise<ProRequired | null> {
  const { isPro: entitled } = await getEntitlements(userId);
  if (entitled) return null;
  return { error: PRO_REQUIRED_MESSAGE, proRequired: true };
}
