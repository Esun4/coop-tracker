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

export async function getUnresolvedSuggestions() {
  const userId = await getAuthUserId();

  return prisma.emailSuggestion.findMany({
    where: { userId, resolved: false },
    orderBy: { confidence: "desc" },
  });
}

export async function dismissSuggestion(id: string) {
  const userId = await getAuthUserId();

  const suggestion = await prisma.emailSuggestion.findFirst({
    where: { id, userId },
  });
  if (!suggestion) return { error: "Suggestion not found" };

  await prisma.emailSuggestion.update({
    where: { id },
    data: { resolved: true, resolvedAction: "dismissed", resolvedAt: new Date() },
  });

  revalidatePath("/dashboard");
  return { success: true };
}

export async function acceptNewApplication(suggestionId: string, data: unknown) {
  const userId = await getAuthUserId();

  const suggestion = await prisma.emailSuggestion.findFirst({
    where: { id: suggestionId, userId },
  });
  if (!suggestion) return { error: "Suggestion not found" };

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
      source: "email_suggestion",
    },
  });

  await prisma.emailSuggestion.update({
    where: { id: suggestionId },
    data: {
      resolved: true,
      resolvedAction: "accepted",
      resolvedAt: new Date(),
      applicationId: application.id,
    },
  });

  revalidatePath("/dashboard");
  return { success: true, application };
}

export async function acceptStatusUpdate(
  suggestionId: string,
  applicationId: string,
  newStatus: string
) {
  const userId = await getAuthUserId();

  const suggestion = await prisma.emailSuggestion.findFirst({
    where: { id: suggestionId, userId },
  });
  if (!suggestion) return { error: "Suggestion not found" };

  const existing = await prisma.application.findFirst({
    where: { id: applicationId, userId },
  });
  if (!existing) return { error: "Application not found" };

  await prisma.application.update({
    where: { id: applicationId },
    data: { status: newStatus as ApplicationStatus },
  });

  await prisma.activityLog.create({
    data: {
      userId,
      applicationId,
      action: "updated",
      details: { status: { from: existing.status, to: newStatus } },
      source: "email_suggestion",
    },
  });

  await prisma.emailSuggestion.update({
    where: { id: suggestionId },
    data: {
      resolved: true,
      resolvedAction: "accepted",
      resolvedAt: new Date(),
      applicationId,
    },
  });

  revalidatePath("/dashboard");
  return { success: true };
}
