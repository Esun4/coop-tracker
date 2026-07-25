import { describe, it, expect, beforeEach, vi, beforeAll } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resetDb, createTestUser } from "../helpers/db";
import {
  getReminderSettings,
  updateReminderSettings,
  syncDeadlineReminders,
  getDueReminders,
} from "@/lib/actions/reminders";
import { setApplicationDeadline } from "@/lib/actions/applications";

const mockedAuth = vi.mocked(auth);

function actAs(userId: string) {
  mockedAuth.mockResolvedValue({ user: { id: userId } } as never);
}

function inDays(days: number) {
  return new Date(Date.now() + days * 86_400_000);
}

async function makeApp(userId: string, status = "OA") {
  return prisma.application.create({
    data: { userId, company: "Stripe", roleTitle: "SWE Intern", status: status as never },
  });
}

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
});

beforeEach(async () => {
  await resetDb();
  mockedAuth.mockReset();
});

describe("reminder settings", () => {
  it("starts on the shipped defaults", async () => {
    const user = await createTestUser();
    actAs(user.id);

    const { settings } = await getReminderSettings();

    expect(settings.ASSESSMENT_DUE).toMatchObject({
      enabled: true,
      viaEmail: true,
    });
    // Browser push is opt-in: it needs a tab open and a permission prompt.
    expect(settings.POSTING_CLOSES?.enabled).toBe(false);
  });

  it("merges a single change without dropping the rest", async () => {
    const user = await createTestUser();
    actAs(user.id);

    await updateReminderSettings({
      NO_REPLY: {
        enabled: false,
        offsetMinutes: -20160,
        viaEmail: false,
        viaPush: false,
      },
    });

    const { settings } = await getReminderSettings();
    expect(settings.NO_REPLY?.enabled).toBe(false);
    expect(settings.ASSESSMENT_DUE?.enabled).toBe(true);
  });

  it("rejects a malformed setting", async () => {
    const user = await createTestUser();
    actAs(user.id);

    const result = await updateReminderSettings({
      ASSESSMENT_DUE: { enabled: "yes" },
    });
    expect(result.error).toBeTruthy();
  });
});

describe("syncDeadlineReminders", () => {
  it("schedules a nudge when a deadline lands", async () => {
    const user = await createTestUser();
    actAs(user.id);
    const app = await makeApp(user.id);

    await setApplicationDeadline(app.id, {
      deadlineAt: inDays(10).toISOString(),
    });

    const reminders = await prisma.reminder.findMany({
      where: { applicationId: app.id },
    });
    expect(reminders).toHaveLength(1);
    expect(reminders[0].kind).toBe("ASSESSMENT_DUE");
    // Two days before a date ten days out.
    const daysAhead =
      (reminders[0].scheduledFor.getTime() - Date.now()) / 86_400_000;
    expect(daysAhead).toBeGreaterThan(7.9);
    expect(daysAhead).toBeLessThan(8.1);
  });

  it("treats a date on an offer as a decision deadline", async () => {
    const user = await createTestUser();
    actAs(user.id);
    const app = await makeApp(user.id, "OFFER");

    await setApplicationDeadline(app.id, {
      deadlineAt: inDays(10).toISOString(),
    });

    const reminder = await prisma.reminder.findFirst({
      where: { applicationId: app.id },
    });
    expect(reminder!.kind).toBe("OFFER_DECISION");
  });

  it("clears the nudge when the date is cleared", async () => {
    const user = await createTestUser();
    actAs(user.id);
    const app = await makeApp(user.id);

    await setApplicationDeadline(app.id, { deadlineAt: inDays(10).toISOString() });
    await setApplicationDeadline(app.id, { deadlineAt: null });

    expect(
      await prisma.reminder.count({ where: { applicationId: app.id } }),
    ).toBe(0);
  });

  it("reschedules rather than piling up when the date moves", async () => {
    const user = await createTestUser();
    actAs(user.id);
    const app = await makeApp(user.id);

    await setApplicationDeadline(app.id, { deadlineAt: inDays(10).toISOString() });
    await setApplicationDeadline(app.id, { deadlineAt: inDays(20).toISOString() });

    const reminders = await prisma.reminder.findMany({
      where: { applicationId: app.id },
    });
    expect(reminders).toHaveLength(1);
  });

  it("does not schedule a nudge for a moment already past", async () => {
    const user = await createTestUser();
    actAs(user.id);
    const app = await makeApp(user.id);

    // Due tomorrow, but the reminder wants to fire two days before.
    await setApplicationDeadline(app.id, { deadlineAt: inDays(1).toISOString() });

    expect(
      await prisma.reminder.count({ where: { applicationId: app.id } }),
    ).toBe(0);
  });

  it("schedules nothing when the user has turned that reminder off", async () => {
    const user = await createTestUser();
    actAs(user.id);
    const app = await makeApp(user.id);

    await updateReminderSettings({
      ASSESSMENT_DUE: {
        enabled: false,
        offsetMinutes: 2880,
        viaEmail: false,
        viaPush: false,
      },
    });
    await setApplicationDeadline(app.id, { deadlineAt: inDays(10).toISOString() });

    expect(
      await prisma.reminder.count({ where: { applicationId: app.id } }),
    ).toBe(0);
  });

  it("leaves an already-sent reminder alone", async () => {
    const user = await createTestUser();
    actAs(user.id);
    const app = await makeApp(user.id);

    await prisma.reminder.create({
      data: {
        userId: user.id,
        applicationId: app.id,
        kind: "ASSESSMENT_DUE",
        offsetMinutes: 2880,
        scheduledFor: inDays(-1),
        sentAt: new Date(),
      },
    });

    await syncDeadlineReminders(app.id);

    const sent = await prisma.reminder.findMany({
      where: { applicationId: app.id, sentAt: { not: null } },
    });
    expect(sent).toHaveLength(1);
  });

  it("refuses another user's application", async () => {
    const owner = await createTestUser();
    const stranger = await createTestUser();
    const app = await makeApp(owner.id);

    actAs(stranger.id);
    expect((await syncDeadlineReminders(app.id)).error).toBeTruthy();
  });
});

describe("getDueReminders", () => {
  it("returns what is due and skips what is sent, snoozed or ahead", async () => {
    const user = await createTestUser();
    actAs(user.id);
    const app = await makeApp(user.id);

    const base = {
      userId: user.id,
      applicationId: app.id,
      kind: "ASSESSMENT_DUE" as const,
      offsetMinutes: 2880,
    };

    await prisma.reminder.create({
      data: { ...base, scheduledFor: inDays(-1) },
    });
    await prisma.reminder.create({
      data: { ...base, scheduledFor: inDays(-1), sentAt: new Date() },
    });
    await prisma.reminder.create({
      data: { ...base, scheduledFor: inDays(-1), snoozedUntil: inDays(2) },
    });
    await prisma.reminder.create({
      data: { ...base, scheduledFor: inDays(3) },
    });

    const due = await getDueReminders();
    expect(due).toHaveLength(1);
    expect(due[0].sentAt).toBeNull();
  });
});
