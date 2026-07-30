/**
 * Client-safe sign-in failure codes and their copy.
 *
 * Kept apart from `auth.ts` for the same reason `pro.ts` is kept apart from
 * `entitlements.ts`: that module pulls in Prisma and the NextAuth server, so it
 * can never be imported from a client component. This file is plain constants.
 *
 * These codes travel to the browser — NextAuth puts a `CredentialsSignin`
 * subclass's `code` into the sign-in response (and into the URL when
 * redirecting). So a code must never hint at anything sensitive.
 */

/**
 * Too many sign-in attempts from this network.
 *
 * Safe to disclose: the sign-in budget is keyed on IP only, never on the
 * account. Seeing this tells an attacker that *they* have been throttled — it
 * reveals nothing about whether the email they tried actually exists, which is
 * the leak that matters on a login form.
 */
export const SIGNIN_RATE_LIMITED = "rate_limited";

/**
 * Deliberately identical for "no such user" and "wrong password". Telling the
 * two apart turns the form into an account-existence oracle.
 */
export const SIGNIN_DEFAULT_MESSAGE = "Invalid email or password";

const MESSAGES: Record<string, string> = {
  [SIGNIN_RATE_LIMITED]:
    "Too many sign-in attempts from your network. Please wait a few minutes and try again.",
};

/** Maps a sign-in failure code to what the user should read. */
export function signInErrorMessage(code?: string | null): string {
  if (!code) return SIGNIN_DEFAULT_MESSAGE;
  return MESSAGES[code] ?? SIGNIN_DEFAULT_MESSAGE;
}
