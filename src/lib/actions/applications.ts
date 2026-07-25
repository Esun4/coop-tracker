"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { applicationSchema, applicationStatuses, type ApplicationFormData } from "@/lib/schemas";
import { revalidatePath } from "next/cache";
import { ApplicationStatus, ActivitySource } from "@/generated/prisma/client";
import { z } from "zod";

const statusSchema = z.enum(applicationStatuses);
const MAX_IMPORT_ROWS = 1000;

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
