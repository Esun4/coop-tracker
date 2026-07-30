/**
 * Client-safe Pro vocabulary: what Pro *buys*, not who *has* it.
 *
 * Deliberately free of any Prisma or auth import. Client components need these
 * names and this copy to render locks and the upgrade dialog, and importing
 * `entitlements.ts` for them would drag the database client toward the browser
 * bundle. The entitlement decision lives in `entitlements.ts`, server-side.
 */

export const PRO_FEATURES = ["email_reply", "scan_schedule", "tailoring"] as const;

export type ProFeature = (typeof PRO_FEATURES)[number];

export const PRO_FEATURE_COPY: Record<
  ProFeature,
  { title: string; description: string }
> = {
  email_reply: {
    title: "AI email replies",
    description:
      "Draft a reply to an interview invite, an OA or a rejection, edit it, and send it back on the same thread.",
  },
  scan_schedule: {
    title: "Scheduled inbox scans",
    description:
      "Sweep your inbox every six hours or each morning instead of pressing Sync yourself.",
  },
  tailoring: {
    title: "Resume & cover letter tailoring",
    description:
      "Paste a posting and rewrite your resume and letter against it, then export a clean PDF.",
  },
};

/**
 * The single message a gated server action returns. Kept here so the string the
 * user reads is the same whichever action they tripped.
 */
export const PRO_REQUIRED_MESSAGE =
  "That's a Pro feature. Upgrade to unlock it.";

/**
 * The shape every Pro-gated server action returns when the caller isn't
 * entitled. `proRequired` is what the client keys off to open the upgrade
 * dialog rather than showing a generic error toast — the message alone would
 * be a fragile thing to match on.
 */
export type ProRequired = { error: string; proRequired: true };

/**
 * Narrow an action result to "the user needs to upgrade".
 *
 * Checks `error` too, not just the flag: the type promises both fields, and a
 * caller that trusts the guard would otherwise render `undefined` as its
 * message.
 */
export function isProRequired(result: unknown): result is ProRequired {
  if (typeof result !== "object" || result === null) return false;
  const candidate = result as { error?: unknown; proRequired?: unknown };
  return candidate.proRequired === true && typeof candidate.error === "string";
}
