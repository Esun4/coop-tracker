import { prisma } from "@/lib/prisma";

/**
 * The delivery sweep.
 *
 * Deliberately NOT in `src/lib/actions/` and deliberately not marked
 * "use server": this reads across every user, so it must never be reachable as
 * a server action from a browser. Only server-side callers — the cron route
 * that will drive sending — may import it.
 */
export async function getDueReminders(now = new Date(), limit = 200) {
  return prisma.reminder.findMany({
    where: {
      sentAt: null,
      scheduledFor: { lte: now },
      OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }],
    },
    include: {
      application: {
        select: { company: true, roleTitle: true, deadlineAt: true },
      },
      user: {
        select: { email: true, quietHoursStart: true, quietHoursEnd: true },
      },
    },
    orderBy: { scheduledFor: "asc" },
    take: limit,
  });
}
