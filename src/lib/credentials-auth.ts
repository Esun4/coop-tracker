// From `@auth/core/errors` rather than the `next-auth` re-export: importing
// `next-auth` here pulls in its Next.js server entry, which can't resolve under
// the test runner. Same class either way — next-auth re-exports this one.
import { CredentialsSignin } from "@auth/core/errors";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { SIGNIN_RATE_LIMITED } from "@/lib/auth-codes";

/**
 * The Credentials provider's `authorize` step, extracted from the `NextAuth()`
 * call in `auth.ts` so it can be tested directly. Wiring it up there would mean
 * booting the adapter and every provider just to check a password comparison.
 */

/**
 * Thrown when the caller's network has spent its sign-in budget.
 *
 * `authorize` can otherwise only answer yes or no, and a bare `null` shows the
 * user "Invalid email or password" — which sends someone who has simply been
 * throttled off to reset a password that was never wrong. NextAuth surfaces a
 * `CredentialsSignin` subclass's `code` to the caller, so the sign-in page can
 * tell the two apart.
 */
export class RateLimitedSigninError extends CredentialsSignin {
  code = SIGNIN_RATE_LIMITED;
}

type Credentials = Partial<Record<string, unknown>>;

/**
 * A real bcrypt hash of a random throwaway string nobody holds, used to keep
 * the work identical when no account matches.
 *
 * Without it, `bcrypt.compare` is skipped for an unknown email and that request
 * returns in microseconds, while a wrong password costs a full bcrypt round.
 * The gap is trivially measurable, which turns the login form into an account
 * enumeration oracle — the exact leak the identical `null` return is meant to
 * prevent.
 *
 * The cost factor must match what `signUp` uses (12): `compare` takes its work
 * factor from the *stored* hash, so a cheaper dummy would leak the difference
 * just as clearly.
 *
 * Safe to keep in source. It is a hash, not a credential, and even a candidate
 * that somehow matched it can't authenticate — the `user` check below is what
 * decides, and no account is attached to this hash.
 */
const NO_SUCH_USER_HASH =
  "$2b$12$EB8wLu8fPfS9IUcWPhyUnuHd9VZLduKW2aq7QnFOsbO06zzkXW9m6";

export async function authorizeCredentials(
  credentials: Credentials,
  request: Request
) {
  if (!credentials?.email || !credentials?.password) return null;

  // Throttle by network before touching the password hash. This is what makes
  // credential stuffing expensive: without it, an attacker can test passwords
  // as fast as bcrypt will answer.
  //
  // Every attempt counts, not just failures — simpler, and 10 per 15 minutes
  // never inconveniences a real person.
  //
  // Headers are passed explicitly rather than read from `next/headers`: this
  // runs inside NextAuth's route handler, where relying on the ambient request
  // store is fragile.
  const limited = await enforceRateLimit("signin", undefined, request.headers);
  if (limited) throw new RateLimitedSigninError();

  const user = await prisma.user.findUnique({
    where: { email: credentials.email as string },
  });

  // Every path below costs one bcrypt comparison, whether or not the account
  // exists, so "no such account" and "wrong password" are indistinguishable by
  // response body *and* by timing. Returning early on a missing user would make
  // unknown emails answer far faster and hand an attacker a list of who has an
  // account here.
  const isValid = await bcrypt.compare(
    credentials.password as string,
    user?.hashedPassword ?? NO_SUCH_USER_HASH
  );

  // Both conditions matter: a candidate that somehow matched the dummy hash
  // still has no account behind it.
  if (!user?.hashedPassword || !isValid) return null;

  return { id: user.id, email: user.email, name: user.name };
}
