"use server";

import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import {
  REMINDER_DEFAULTS,
  reminderSettingsSchema,
  reminderTime,
  resolveReminderSettings,
  type ReminderKindName,
} from "@/lib/reminders";
import { ReminderKind } from "@/generated/prisma/client";

async function getAuthUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session.user.id;
}

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

const digestSchema = z.object({
  digestEnabled: z.boolean().optional(),
  quietHoursStart: z.string().regex(HH_MM, "Use HH:MM").optional(),
  quietHoursEnd: z.string().regex(HH_MM, "Use HH:MM").optional(),
});

export async function getReminderSettings() {
  const userId = await getAuthUserId();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      reminderSettings: true,
      digestEnabled: true,
      quietHoursStart: true,
      quietHoursEnd: true,
      email: true,
    },
  });
  if (!user) throw new Error("Unauthorized");

  return {
    settings: resolveReminderSettings(user.reminderSettings),
    digestEnabled: user.digestEnabled,
    quietHoursStart: user.quietHoursStart,
    quietHoursEnd: user.quietHoursEnd,
    email: user.email,
  };
}

export async function updateReminderSettings(input: unknown) {
  const userId = await getAuthUserId();

  const parsed = reminderSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid reminder" };
  }

  // Merge, so one toggle never drops the rest.
  const current = await prisma.user.findUnique({
    where: { id: userId },
    select: { reminderSettings: true },
  });
  const merged = {
    ...resolveReminderSettings(current?.reminderSettings),
    ...parsed.data,
  };

  await prisma.user.update({
    where: { id: userId },
    data: { reminderSettings: merged },
  });

  revalidatePath("/dashboard/settings/reminders");
  return { success: true };
}

export async function updateDigestSettings(input: unknown) {
  const userId = await getAuthUserId();

  const parsed = digestSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid setting" };
  }
  if (Object.keys(parsed.data).length === 0) return { error: "Nothing to update" };

  await prisma.user.update({ where: { id: userId }, data: parsed.data });

  revalidatePath("/dashboard/settings/reminders");
  return { success: true };
}

/**
 * Bring an application's reminders in line with its deadline.
 *
 * Called whenever a date is set, edited or cleared — including when the
 * classifier reads one out of an email — so a reminder exists the moment a
 * recruiter names a date, and disappears the moment the date does. Already-sent
 * reminders are left alone; rescheduling the past helps nobody.
 */
export async function syncDeadlineReminders(applicationId: string) {
  const userId = await getAuthUserId();

  const application = await prisma.application.findFirst({
    where: { id: applicationId, userId },
    select: { id: true, deadlineAt: true, status: true },
  });
  if (!application) return { error: "Application not found" };

  // Only the two kinds this function owns. A silence nudge or a posting-closes
  // reminder is scheduled elsewhere and must survive a deadline edit.
  const DEADLINE_KINDS: ReminderKind[] = ["ASSESSMENT_DUE", "OFFER_DECISION"];
  // Built now, run below — the clear and the replacement go in as one unit, so
  // a failed create cannot leave the application with no reminder at all.
  // Callers log and continue on failure, which would make that silent.
  const clear = prisma.reminder.deleteMany({
    where: { applicationId, userId, sentAt: null, kind: { in: DEADLINE_KINDS } },
  });

  if (!application.deadlineAt) {
    await clear;
    return { success: true, scheduled: 0 };
  }

  const settings = resolveReminderSettings(
    (
      await prisma.user.findUnique({
        where: { id: userId },
        select: { reminderSettings: true },
      })
    )?.reminderSettings,
  );

  // An offer's date is a decision deadline; anything else is work to do.
  const kind: ReminderKindName =
    application.status === "OFFER" ? "OFFER_DECISION" : "ASSESSMENT_DUE";
  const setting = settings[kind] ?? REMINDER_DEFAULTS[kind];

  if (!setting.enabled || (!setting.viaEmail && !setting.viaPush)) {
    await clear;
    return { success: true, scheduled: 0 };
  }

  const scheduledFor = reminderTime(
    application.deadlineAt,
    setting.offsetMinutes,
  );

  // A reminder for a moment that has already passed is noise.
  if (scheduledFor.getTime() <= Date.now()) {
    await clear;
    return { success: true, scheduled: 0 };
  }

  await prisma.$transaction([
    clear,
    prisma.reminder.create({
      data: {
        userId,
        applicationId,
        kind: kind as ReminderKind,
        offsetMinutes: setting.offsetMinutes,
        viaEmail: setting.viaEmail,
        viaPush: setting.viaPush,
        scheduledFor,
      },
    }),
  ]);

  return { success: true, scheduled: 1 };
}

export async function snoozeReminder(id: string, until: Date) {
  const userId = await getAuthUserId();

  const reminder = await prisma.reminder.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!reminder) return { error: "Reminder not found" };

  await prisma.reminder.update({ where: { id }, data: { snoozedUntil: until } });
  return { success: true };
}
