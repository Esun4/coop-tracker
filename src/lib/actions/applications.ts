"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { applicationSchema } from "@/lib/schemas";
import { revalidatePath } from "next/cache";
import { ApplicationStatus } from "@/generated/prisma/client";

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
    where.status = params.status as ApplicationStatus;
  }

  if (params?.source) {
    where.source = params.source;
  }

  if (params?.search) {
    where.OR = [
      { company: { contains: params.search, mode: "insensitive" } },
      { roleTitle: { contains: params.search, mode: "insensitive" } },
      { location: { contains: params.search, mode: "insensitive" } },
    ];
  }

  // Clean undefined values
  if (where.archived === undefined) delete where.archived;

  const orderBy: Record<string, string> = {};
  const sortBy = params?.sortBy || "updatedAt";
  const sortOrder = params?.sortOrder || "desc";
  orderBy[sortBy] = sortOrder;

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
      source: "manual",
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
        source: "manual",
      },
    });
  }

  revalidatePath("/dashboard");
  return { success: true, application };
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
      source: "manual",
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

export async function getStats() {
  const userId = await getAuthUserId();

  const applications = await prisma.application.findMany({
    where: { userId, archived: false },
    select: { status: true },
  });

  const total = applications.length;
  const byStatus: Record<string, number> = {};
  for (const app of applications) {
    byStatus[app.status] = (byStatus[app.status] || 0) + 1;
  }

  const interviews =
    (byStatus.INTERVIEW || 0) +
    (byStatus.FINAL_ROUND || 0) +
    (byStatus.OFFER || 0);
  const offers = byStatus.OFFER || 0;
  const applied = total - (byStatus.APPLYING || 0);

  return {
    total,
    byStatus,
    interviewRate: applied > 0 ? interviews / applied : 0,
    offerRate: applied > 0 ? offers / applied : 0,
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
