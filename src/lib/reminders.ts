import { z } from "zod";

/**
 * Reminder vocabulary — shared by the settings screen and the server actions,
 * so it cannot live in the "use server" module.
 *
 * Email is the default channel: browser push needs an open tab and a
 * permission prompt, which is a lot to ask before the first useful nudge.
 */

export const REMINDER_KINDS = [
  "ASSESSMENT_DUE",
  "OFFER_DECISION",
  "INTERVIEW_TOMORROW",
  "NO_REPLY",
  "POSTING_CLOSES",
] as const;

export type ReminderKindName = (typeof REMINDER_KINDS)[number];

export const reminderSettingSchema = z.object({
  enabled: z.boolean(),
  offsetMinutes: z.number().int(),
  viaEmail: z.boolean(),
  viaPush: z.boolean(),
});

/**
 * Every key optional, written out rather than built with `z.record`: a record
 * keyed by an enum is exhaustive in Zod v4, so a partial update — which is all
 * any single toggle ever sends — would fail to parse and be silently dropped.
 */
export const reminderSettingsSchema = z.object({
  ASSESSMENT_DUE: reminderSettingSchema.optional(),
  OFFER_DECISION: reminderSettingSchema.optional(),
  INTERVIEW_TOMORROW: reminderSettingSchema.optional(),
  NO_REPLY: reminderSettingSchema.optional(),
  POSTING_CLOSES: reminderSettingSchema.optional(),
});

export type ReminderSetting = z.infer<typeof reminderSettingSchema>;
export type ReminderSettings = Partial<Record<ReminderKindName, ReminderSetting>>;

const DAY = 60 * 24;

/** The shipped defaults, and the copy the settings grid reads from. */
export const REMINDER_DEFAULTS: Record<
  ReminderKindName,
  ReminderSetting & { title: string; note: string; when: string }
> = {
  ASSESSMENT_DUE: {
    title: "Assessment due",
    note: "OA or take-home with a stated deadline",
    when: "2 days before",
    enabled: true,
    offsetMinutes: 2 * DAY,
    viaEmail: true,
    viaPush: true,
  },
  OFFER_DECISION: {
    title: "Offer decision due",
    note: "The date you have to accept or decline by",
    when: "3 days before",
    enabled: true,
    offsetMinutes: 3 * DAY,
    viaEmail: true,
    viaPush: true,
  },
  INTERVIEW_TOMORROW: {
    title: "Interview tomorrow",
    note: "Anything on the calendar we detected",
    when: "Evening before",
    enabled: true,
    offsetMinutes: DAY,
    viaEmail: true,
    viaPush: true,
  },
  NO_REPLY: {
    title: "No reply in a while",
    note: "Follow-up nudge for a silent application",
    when: "After 14 days",
    enabled: true,
    offsetMinutes: -14 * DAY,
    viaEmail: true,
    viaPush: false,
  },
  POSTING_CLOSES: {
    title: "Posting closes",
    note: "Saved postings you haven't applied to yet",
    when: "1 day before",
    enabled: false,
    offsetMinutes: DAY,
    viaEmail: false,
    viaPush: false,
  },
};

/** Stored settings on top of the defaults. */
export function resolveReminderSettings(stored: unknown): ReminderSettings {
  const parsed = reminderSettingsSchema.safeParse(stored ?? {});
  const overrides: ReminderSettings = parsed.success ? parsed.data : {};

  const out: ReminderSettings = {};
  for (const kind of REMINDER_KINDS) {
    // Copy: the display copy on the defaults is not part of the stored shape.
    const { enabled, offsetMinutes, viaEmail, viaPush } = REMINDER_DEFAULTS[kind];
    out[kind] = {
      enabled,
      offsetMinutes,
      viaEmail,
      viaPush,
      ...overrides[kind],
    };
  }
  return out;
}

/**
 * When a nudge for `kind` should fire, given the date it is about.
 * A negative offset means "after", which is how the silence nudge works.
 */
export function reminderTime(deadline: Date, offsetMinutes: number): Date {
  return new Date(deadline.getTime() - offsetMinutes * 60_000);
}
