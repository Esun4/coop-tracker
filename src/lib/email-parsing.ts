// Pure email-sender parsing helpers. Kept out of "use server" files so they can
// be unit-tested directly and exported as ordinary (non-async) functions.

const IGNORED_SENDER_DOMAINS = new Set([
  "gmail", "yahoo", "outlook", "hotmail", "icloud", "protonmail",
  "indeed", "linkedin", "glassdoor", "handshake", "ziprecruiter",
  "monster", "waterlooworks", "myworkdayjobs", "greenhouse", "lever",
  "workable", "ashbyhq", "jobvite", "icims", "taleo", "successfactors",
]);

/**
 * Best-effort extraction of the employer name from a raw `From:` header.
 * Prefers a human display name, falls back to the email domain, and returns
 * null for generic role addresses (no-reply, recruiting, …) and known job
 * boards / personal email providers.
 */
export function extractCompanyFromSender(from: string): string | null {
  const displayMatch = from.match(/^"?([^"<]+?)"?\s*</);
  if (displayMatch) {
    const name = displayMatch[1].trim();
    if (!/^(no.?reply|do.?not.?reply|recruiting|careers|hr|jobs|talent|hiring|notifications?|alerts?|support|info|hello|team|noreply)$/i.test(name)) {
      return name;
    }
  }

  const emailMatch = from.match(/@([^>>\s]+)/);
  if (emailMatch) {
    const parts = emailMatch[1].split(".");
    const domain = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
    if (!IGNORED_SENDER_DOMAINS.has(domain.toLowerCase())) {
      return domain.charAt(0).toUpperCase() + domain.slice(1);
    }
  }

  return null;
}
