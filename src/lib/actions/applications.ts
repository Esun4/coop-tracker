"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { applicationSchema, applicationStatuses, type ApplicationFormData } from "@/lib/schemas";
import { revalidatePath } from "next/cache";
import { ApplicationStatus, ActivitySource } from "@/generated/prisma/client";
import { z } from "zod";
import { syncDeadlineReminders } from "@/lib/actions/reminders";

const statusSchema = z.enum(applicationStatuses);
const MAX_IMPORT_ROWS = 1000;

/**
 * Ceiling on one bulk action. The table pages at 50, so this is well clear of
 * anything selectable by hand — it exists to bound the work a single call can
 * ask for, since the deadline path schedules reminders one application at a
 * time.
 */
const MAX_BULK_IDS = 200;

/** How many reminder schedules run at once inside one bulk deadline change. */
const SCHEDULE_BATCH_SIZE = 10;

const bulkIdsSchema = z
  .array(z.string().min(1, "Invalid application id"))
  .min(1, "Nothing selected")
  .max(MAX_BULK_IDS, `Select at most ${MAX_BULK_IDS} applications at once`);

const bulkDeadlineSchema = z.object({
  deadlineAt: z.string().min(1).nullable(),
});

async function getAuthUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session.user.id;
}

export async function getApplications(params?: {
  search?: string;
  status?: string;
  source?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  includeArchived?: boolean;
}) {
  const userId = await getAuthUserId();

  const where: Record<string, unknown> = {
    userId,
    archived: params?.includeArchived ? undefined : false,
  };

  if (params?.status) {
    const parsed = statusSchema.safeParse(params.status);
    if (parsed.success) where.status = parsed.data;
  }

  if (params?.source) {
    where.source = params.source;
  }

  if (params?.search) {
    const search = params.search.slice(0, 100); // max 100 chars
    where.OR = [
      { company: { contains: search, mode: "insensitive" } },
      { roleTitle: { contains: search, mode: "insensitive" } },
      { location: { contains: search, mode: "insensitive" } },
    ];
  }

  // Clean undefined values
  if (where.archived === undefined) delete where.archived;

  // Allowlist the sortable columns: sortBy is caller-controlled and flows into
  // Prisma's orderBy, so an unknown field would throw a validation error.
  const SORTABLE_COLUMNS = [
    "updatedAt",
    "createdAt",
    "company",
    "roleTitle",
    "status",
    "applicationDate",
  ] as const;
  const sortBy = (SORTABLE_COLUMNS as readonly string[]).includes(params?.sortBy ?? "")
    ? (params!.sortBy as string)
    : "updatedAt";
  const sortOrder = params?.sortOrder === "asc" ? "asc" : "desc";
  const orderBy: Record<string, "asc" | "desc"> = { [sortBy]: sortOrder };

  return prisma.application.findMany({
    where,
    orderBy,
  });
}

export async function getApplication(id: string) {
  const userId = await getAuthUserId();

  return prisma.application.findFirst({
    where: { id, userId },
    include: {
      activityLogs: {
        orderBy: { createdAt: "desc" },
        take: 20,
      },
    },
  });
}

/**
 * Everything the detail view needs in one round trip: the record, its full
 * history, where it sits in the in-play set, and the neighbours either side so
 * the whole cycle can be walked without returning to the table.
 */
export async function getApplicationDetail(id: string) {
  const userId = await getAuthUserId();

  const application = await prisma.application.findFirst({
    where: { id, userId },
    include: { activityLogs: { orderBy: { createdAt: "desc" } } },
  });
  if (!application) return null;

  // The same ordering the dashboard uses, so prev/next matches what you saw.
  const inPlay = await prisma.application.findMany({
    where: {
      userId,
      archived: false,
      status: { notIn: [ApplicationStatus.REJECTED, ApplicationStatus.WITHDRAWN] },
    },
    select: { id: true },
    orderBy: { updatedAt: "desc" },
  });

  const index = inPlay.findIndex((a) => a.id === id);

  return {
    application,
    position: index >= 0 ? index + 1 : null,
    total: inPlay.length,
    prevId: index > 0 ? inPlay[index - 1].id : null,
    nextId:
      index >= 0 && index < inPlay.length - 1 ? inPlay[index + 1].id : null,
  };
}

/**
 * Median days spent before each transition, across this user's own history.
 * Feeds the "typically 6d after" hint on the stage ahead — a hint drawn from
 * their cycle rather than an invented benchmark.
 */
export async function getStageIntervals(): Promise<Record<string, number>> {
  const userId = await getAuthUserId();

  const rows = await prisma.$queryRaw<{ to_status: string; median: number }[]>`
    SELECT t.to_status,
           percentile_cont(0.5) WITHIN GROUP (
             ORDER BY EXTRACT(EPOCH FROM (t.moved_at - t.applied_on)) / 86400
           )::float AS median
    FROM (
      SELECT l.details -> 'status' ->> 'to' AS to_status,
             MIN(l."createdAt") AS moved_at,
             a."applicationDate" AS applied_on
      FROM "Application" a
      JOIN "ActivityLog" l ON l."applicationId" = a.id
      WHERE a."userId" = ${userId}
        AND a."applicationDate" IS NOT NULL
        AND l.action = 'updated'
        AND l.details -> 'status' ->> 'to' IS NOT NULL
      GROUP BY a.id, l.details -> 'status' ->> 'to', a."applicationDate"
    ) t
    WHERE t.moved_at > t.applied_on
    GROUP BY t.to_status
  `;

  const out: Record<string, number> = {};
  for (const row of rows) {
    if (row.median != null) out[row.to_status] = Math.round(row.median);
  }
  return out;
}

/**
 * Set or clear the date an application is working towards. Clearing is a
 * first-class option — a date read out of an email can simply be wrong.
 */
export async function setApplicationDeadline(
  id: string,
  input: { deadlineAt: string | null; note?: string | null },
) {
  const userId = await getAuthUserId();

  const existing = await prisma.application.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!existing) return { error: "Application not found" };

  let deadlineAt: Date | null = null;
  if (input.deadlineAt) {
    const parsed = new Date(input.deadlineAt);
    if (Number.isNaN(parsed.getTime())) return { error: "That date isn't valid" };
    deadlineAt = parsed;
  }

  await prisma.application.update({
    where: { id },
    data: {
      deadlineAt,
      // Editing by hand takes ownership of the date away from the classifier.
      deadlineSource: deadlineAt ? "manual" : null,
      deadlineNote: deadlineAt ? (input.note ?? null) : null,
    },
  });

  await prisma.activityLog.create({
    data: {
      userId,
      applicationId: id,
      action: "updated",
      details: { deadline: deadlineAt ? deadlineAt.toISOString() : null },
      source: ActivitySource.manual,
    },
  });

  // A date without the nudge it implies is only half the feature — but the
  // deadline is already saved, so a scheduling failure must not read as one.
  try {
    await syncDeadlineReminders(id);
  } catch (error) {
    console.error("Failed to schedule reminders for", id, error);
  }

  revalidatePath(`/dashboard/applications/${id}`);
  revalidatePath("/dashboard");
  return { success: true };
}

export async function createApplication(data: unknown) {
  const userId = await getAuthUserId();

  const parsed = applicationSchema.safeParse(data);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const application = await prisma.application.create({
    data: {
      userId,
      company: parsed.data.company,
      roleTitle: parsed.data.roleTitle,
      location: parsed.data.location || null,
      applicationDate: parsed.data.applicationDate
        ? new Date(parsed.data.applicationDate)
        : null,
      status: parsed.data.status as ApplicationStatus,
      source: parsed.data.source || null,
      notes: parsed.data.notes || null,
      contactInfo: parsed.data.contactInfo || null,
    },
  });

  await prisma.activityLog.create({
    data: {
      userId,
      applicationId: application.id,
      action: "created",
      details: {
        company: application.company,
        roleTitle: application.roleTitle,
        status: application.status,
      },
      source: ActivitySource.manual,
    },
  });

  revalidatePath("/dashboard");
  return { success: true, application };
}

export async function updateApplication(id: string, data: unknown) {
  const userId = await getAuthUserId();

  const parsed = applicationSchema.safeParse(data);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const existing = await prisma.application.findFirst({
    where: { id, userId },
  });
  if (!existing) return { error: "Application not found" };

  const application = await prisma.application.update({
    where: { id },
    data: {
      company: parsed.data.company,
      roleTitle: parsed.data.roleTitle,
      location: parsed.data.location || null,
      applicationDate: parsed.data.applicationDate
        ? new Date(parsed.data.applicationDate)
        : null,
      status: parsed.data.status as ApplicationStatus,
      source: parsed.data.source || null,
      notes: parsed.data.notes || null,
      contactInfo: parsed.data.contactInfo || null,
    },
  });

  // Log changes
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  if (existing.status !== application.status) {
    changes.status = { from: existing.status, to: application.status };
  }
  if (existing.company !== application.company) {
    changes.company = { from: existing.company, to: application.company };
  }
  if (existing.roleTitle !== application.roleTitle) {
    changes.roleTitle = {
      from: existing.roleTitle,
      to: application.roleTitle,
    };
  }

  if (Object.keys(changes).length > 0) {
    await prisma.activityLog.create({
      data: {
        userId,
        applicationId: application.id,
        action: "updated",
        details: JSON.parse(JSON.stringify(changes)),
        source: ActivitySource.manual,
      },
    });
  }

  revalidatePath("/dashboard");
  return { success: true, application };
}

export async function updateApplicationStatus(id: string, status: string) {
  const userId = await getAuthUserId();

  const parsedStatus = statusSchema.safeParse(status);
  if (!parsedStatus.success) return { error: "Invalid status" };

  const existing = await prisma.application.findFirst({
    where: { id, userId },
  });
  if (!existing) return { error: "Application not found" };

  await prisma.application.update({
    where: { id },
    data: { status: parsedStatus.data as ApplicationStatus },
  });

  await prisma.activityLog.create({
    data: {
      userId,
      applicationId: id,
      action: "updated",
      details: { status: { from: existing.status, to: status } },
      source: ActivitySource.manual,
    },
  });

  revalidatePath("/dashboard");
  return { success: true };
}

export async function archiveApplication(id: string) {
  const userId = await getAuthUserId();

  const existing = await prisma.application.findFirst({
    where: { id, userId },
  });
  if (!existing) return { error: "Application not found" };

  await prisma.application.update({
    where: { id },
    data: { archived: !existing.archived },
  });

  await prisma.activityLog.create({
    data: {
      userId,
      applicationId: id,
      action: existing.archived ? "unarchived" : "archived",
      source: ActivitySource.manual,
    },
  });

  revalidatePath("/dashboard");
  return { success: true };
}

export async function deleteApplication(id: string) {
  const userId = await getAuthUserId();

  const existing = await prisma.application.findFirst({
    where: { id, userId },
  });
  if (!existing) return { error: "Application not found" };

  await prisma.application.delete({ where: { id } });

  revalidatePath("/dashboard");
  return { success: true };
}

/**
 * Move a whole selection to one stage. Rows already at that stage are counted
 * as skipped rather than rewritten, so a bulk action does not fill the activity
 * feed with entries where nothing changed.
 *
 * Ids arrive from the client and are treated as claims, not facts: every write
 * is scoped by `userId`, and rows that don't resolve are silently absent from
 * the result instead of failing the batch.
 */
export async function bulkUpdateStatus(ids: unknown, status: unknown) {
  const userId = await getAuthUserId();

  const parsedIds = bulkIdsSchema.safeParse(ids);
  if (!parsedIds.success) return { error: parsedIds.error.issues[0].message };

  const parsedStatus = statusSchema.safeParse(status);
  if (!parsedStatus.success) return { error: "Invalid status" };

  const unique = [...new Set(parsedIds.data)];
  const existing = await prisma.application.findMany({
    where: { id: { in: unique }, userId },
    select: { id: true, status: true },
  });
  if (existing.length === 0) return { error: "No applications found" };

  const next = parsedStatus.data as ApplicationStatus;
  const changing = existing.filter((app) => app.status !== next);

  if (changing.length > 0) {
    // One transaction: a selection that half-moved, with logs for the other
    // half, is worse than a failure the user can retry.
    await prisma.$transaction([
      prisma.application.updateMany({
        where: { id: { in: changing.map((app) => app.id) }, userId },
        data: { status: next },
      }),
      prisma.activityLog.createMany({
        data: changing.map((app) => ({
          userId,
          applicationId: app.id,
          action: "updated",
          details: { status: { from: app.status, to: next } },
          source: ActivitySource.manual,
        })),
      }),
    ]);
  }

  revalidatePath("/dashboard");
  return {
    success: true,
    updated: changing.length,
    skipped: existing.length - changing.length,
  };
}

/**
 * Put the same date on a whole selection, or clear it off all of them.
 *
 * Reminders cannot be scheduled in one query the way the date can: each one
 * depends on that application's stage and the user's per-kind settings, so the
 * sweep runs per row. As in the single-application path, a scheduling failure
 * must not read as a failure to save the date.
 */
export async function bulkSetDeadline(ids: unknown, input: unknown) {
  const userId = await getAuthUserId();

  const parsedIds = bulkIdsSchema.safeParse(ids);
  if (!parsedIds.success) return { error: parsedIds.error.issues[0].message };

  const parsedInput = bulkDeadlineSchema.safeParse(input);
  if (!parsedInput.success) return { error: "That date isn't valid" };

  let deadlineAt: Date | null = null;
  if (parsedInput.data.deadlineAt) {
    const parsed = new Date(parsedInput.data.deadlineAt);
    if (Number.isNaN(parsed.getTime())) return { error: "That date isn't valid" };
    deadlineAt = parsed;
  }

  const unique = [...new Set(parsedIds.data)];
  const existing = await prisma.application.findMany({
    where: { id: { in: unique }, userId },
    select: { id: true },
  });
  if (existing.length === 0) return { error: "No applications found" };

  const targetIds = existing.map((app) => app.id);

  await prisma.$transaction([
    prisma.application.updateMany({
      where: { id: { in: targetIds }, userId },
      data: {
        deadlineAt,
        // Setting a date by hand takes ownership away from the classifier, so
        // the sentence it was read out of no longer describes this date.
        deadlineSource: deadlineAt ? "manual" : null,
        deadlineNote: null,
      },
    }),
    prisma.activityLog.createMany({
      data: targetIds.map((id) => ({
        userId,
        applicationId: id,
        action: "updated",
        details: { deadline: deadlineAt ? deadlineAt.toISOString() : null },
        source: ActivitySource.manual,
      })),
    }),
  ]);

  // Scheduling cannot collapse into one query — each application's reminder
  // depends on its own stage and the user's per-kind settings. Run it in small
  // batches: fully sequential is a round trip per row, and firing all of them
  // at once would put more concurrent connections through the pooler than this
  // is worth. One row failing to schedule never fails the batch, because the
  // date itself is already saved.
  let scheduled = 0;
  for (let i = 0; i < targetIds.length; i += SCHEDULE_BATCH_SIZE) {
    const batch = targetIds.slice(i, i + SCHEDULE_BATCH_SIZE);
    const outcomes = await Promise.allSettled(
      batch.map((id) => syncDeadlineReminders(id)),
    );
    outcomes.forEach((outcome, index) => {
      if (outcome.status === "rejected") {
        console.error(
          "Failed to schedule reminders for",
          batch[index],
          outcome.reason,
        );
        return;
      }
      scheduled +=
        "scheduled" in outcome.value ? (outcome.value.scheduled ?? 0) : 0;
    });
  }

  for (const id of targetIds) {
    revalidatePath(`/dashboard/applications/${id}`);
  }
  revalidatePath("/dashboard");
  return { success: true, updated: targetIds.length, scheduled };
}

export async function importApplications(
  rows: Array<{
    company: string;
    roleTitle: string;
    status?: string;
    location?: string;
    applicationDate?: string;
    source?: string;
    notes?: string;
    contactInfo?: string;
  }>
) {
  const userId = await getAuthUserId();

  if (rows.length > MAX_IMPORT_ROWS) {
    return { success: false, error: `Maximum ${MAX_IMPORT_ROWS} rows allowed per import` };
  }

  const now = new Date();

  // Validate every row through the same schema as manual creates BEFORE writing
  // anything. Import used to skip validation entirely, so blank/invalid rows
  // (empty company, bogus status, unparseable date) either persisted silently
  // or threw an unhandled Prisma error mid-transaction. Fail the whole import
  // with a row-numbered message instead.
  const parsedRows: ApplicationFormData[] = [];
  for (let i = 0; i < rows.length; i++) {
    const parsed = applicationSchema.safeParse(rows[i]);
    if (!parsed.success) {
      return {
        success: false,
        error: `Row ${i + 1}: ${parsed.error.issues[0].message}`,
      };
    }
    parsedRows.push(parsed.data);
  }

  const created = await prisma.$transaction(
    parsedRows.map((row) =>
      prisma.application.create({
        data: {
          userId,
          company: row.company,
          roleTitle: row.roleTitle,
          status: row.status as ApplicationStatus,
          location: row.location || null,
          applicationDate: row.applicationDate ? new Date(row.applicationDate) : now,
          source: row.source || null,
          notes: row.notes || null,
          contactInfo: row.contactInfo || null,
        },
      })
    )
  );

  await prisma.activityLog.createMany({
    data: created.map((app) => ({
      userId,
      applicationId: app.id,
      action: "created",
      details: { company: app.company, roleTitle: app.roleTitle, status: app.status },
      source: ActivitySource.csv_import,
    })),
  });

  revalidatePath("/dashboard");
  return { success: true, count: created.length };
}

export async function getStats() {
  const userId = await getAuthUserId();

  const rows = await prisma.$queryRaw<{ status: string; count: bigint }[]>`
    SELECT status, COUNT(*)::bigint as count
    FROM "Application"
    WHERE "userId" = ${userId} AND archived = false
    GROUP BY status
  `;

  const byStatus: Record<string, number> = {};
  for (const row of rows) {
    byStatus[row.status] = Number(row.count);
  }

  const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
  const closed = (byStatus.REJECTED || 0) + (byStatus.WITHDRAWN || 0);
  const inPlay = total - closed;

  // "Replied" means they came back to you at all — a rejection is a reply.
  // Withdrawn is your move, not theirs, so it does not count either way.
  const replied = total - (byStatus.APPLIED || 0) - (byStatus.WITHDRAWN || 0);

  // Named on the metric strip, so a couple is enough.
  const offerCompanies = await prisma.application.findMany({
    where: { userId, archived: false, status: "OFFER" },
    select: { company: true },
    orderBy: { updatedAt: "desc" },
    take: 3,
  });

  // Days from applying to the first time the status left APPLIED. Reads the
  // activity ledger rather than updatedAt, which any edit would disturb, and
  // ignores moves to WITHDRAWN — that is your move, not a reply from them.
  const medianRows = await prisma.$queryRaw<{ median: number | null }[]>`
    SELECT percentile_cont(0.5) WITHIN GROUP (
             ORDER BY EXTRACT(EPOCH FROM (t.first_reply - t.applied_on)) / 86400
           )::float AS median
    FROM (
      SELECT a.id, a."applicationDate" AS applied_on, MIN(l."createdAt") AS first_reply
      FROM "Application" a
      JOIN "ActivityLog" l ON l."applicationId" = a.id
      WHERE a."userId" = ${userId}
        AND a.archived = false
        AND a."applicationDate" IS NOT NULL
        AND l.action = 'updated'
        AND l.details -> 'status' ->> 'from' = 'APPLIED'
        AND l.details -> 'status' ->> 'to' <> 'WITHDRAWN'
      GROUP BY a.id, a."applicationDate"
    ) t
    WHERE t.first_reply > t.applied_on
  `;
  const median = medianRows[0]?.median;

  // "Reached interview" is furthest-ever, not currently-standing: an
  // application that interviewed and was then rejected still reached it. The
  // standing count would under-report every past interview.
  const reachedRows = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(DISTINCT a.id)::bigint AS count
    FROM "Application" a
    LEFT JOIN "ActivityLog" l
      ON l."applicationId" = a.id
     AND l.action = 'updated'
     AND l.details -> 'status' ->> 'to' IN ('INTERVIEW', 'FINAL_ROUND', 'OFFER')
    WHERE a."userId" = ${userId}
      AND a.archived = false
      AND (a.status IN ('INTERVIEW', 'FINAL_ROUND', 'OFFER') OR l.id IS NOT NULL)
  `;
  const reachedInterview = Number(reachedRows[0]?.count ?? 0);

  return {
    total,
    byStatus,
    interviewRate: total > 0 ? reachedInterview / total : 0,
    inPlay,
    closed,
    interviews: reachedInterview,
    replied,
    responseRate: total > 0 ? replied / total : 0,
    offers: byStatus.OFFER || 0,
    offerCompanies: offerCompanies.map((o) => o.company),
    medianReplyDays: median == null ? null : Math.round(median),
  };
}

export async function getRecentActivity(limit = 10) {
  const userId = await getAuthUserId();

  return prisma.activityLog.findMany({
    where: { userId },
    include: {
      application: {
        select: { company: true, roleTitle: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function getDistinctSources() {
  const userId = await getAuthUserId();

  const results = await prisma.application.findMany({
    where: { userId, source: { not: null } },
    select: { source: true },
    distinct: ["source"],
  });

  return results.map((r: { source: string | null }) => r.source).filter(Boolean) as string[];
}

/**
 * The stage ladder: how far each application ever got, not where it stands.
 *
 * An application that interviewed and was then rejected still cleared the
 * assessment and the interview, so the ladder counts it at both. Standing
 * counts would make every rung shrink as the cycle closes out.
 */
export async function getLadder() {
  const userId = await getAuthUserId();

  const rows = await prisma.$queryRaw<{ stage: string; count: bigint }[]>`
    WITH reached AS (
      SELECT a.id, a.status::text AS current_status,
             COALESCE(
               array_agg(l.details -> 'status' ->> 'to')
                 FILTER (WHERE l.details -> 'status' ->> 'to' IS NOT NULL),
               '{}'
             ) AS ever
      FROM "Application" a
      LEFT JOIN "ActivityLog" l
        ON l."applicationId" = a.id AND l.action = 'updated'
      WHERE a."userId" = ${userId} AND a.archived = false
      GROUP BY a.id, a.status
    )
    SELECT s.stage, COUNT(*)::bigint AS count
    FROM reached r
    CROSS JOIN LATERAL (
      VALUES ('APPLIED'), ('OA'), ('INTERVIEW'), ('FINAL_ROUND'), ('OFFER')
    ) AS s(stage)
    WHERE s.stage = 'APPLIED'
       OR s.stage = ANY(r.ever)
       OR r.current_status = s.stage
    GROUP BY s.stage
  `;

  const counts: Record<string, number> = {
    APPLIED: 0,
    OA: 0,
    INTERVIEW: 0,
    FINAL_ROUND: 0,
    OFFER: 0,
  };
  for (const row of rows) counts[row.stage] = Number(row.count);
  return counts;
}

/** Sent, replied, interviewed and offered, broken down by where it came from. */
export async function getSourceBreakdown() {
  const userId = await getAuthUserId();

  const rows = await prisma.$queryRaw<
    {
      source: string | null;
      sent: bigint;
      replied: bigint;
      interviewed: bigint;
      offered: bigint;
    }[]
  >`
    WITH reached AS (
      SELECT a.id, a.source, a.status::text AS current_status,
             COALESCE(
               array_agg(l.details -> 'status' ->> 'to')
                 FILTER (WHERE l.details -> 'status' ->> 'to' IS NOT NULL),
               '{}'
             ) AS ever
      FROM "Application" a
      LEFT JOIN "ActivityLog" l
        ON l."applicationId" = a.id AND l.action = 'updated'
      WHERE a."userId" = ${userId} AND a.archived = false
      GROUP BY a.id, a.source, a.status
    )
    SELECT source,
           COUNT(*)::bigint AS sent,
           COUNT(*) FILTER (
             WHERE current_status <> 'APPLIED' AND current_status <> 'WITHDRAWN'
           )::bigint AS replied,
           COUNT(*) FILTER (
             WHERE current_status IN ('INTERVIEW', 'FINAL_ROUND', 'OFFER')
                OR ever && ARRAY['INTERVIEW', 'FINAL_ROUND', 'OFFER']
           )::bigint AS interviewed,
           COUNT(*) FILTER (
             WHERE current_status = 'OFFER' OR ever && ARRAY['OFFER']
           )::bigint AS offered
    FROM reached
    GROUP BY source
    ORDER BY sent DESC
  `;

  return rows.map((row) => ({
    source: row.source || "Unspecified",
    sent: Number(row.sent),
    replied: Number(row.replied),
    interviewed: Number(row.interviewed),
    offered: Number(row.offered),
  }));
}
