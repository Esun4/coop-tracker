"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { applicationSchema, applicationStatuses } from "@/lib/schemas";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { ApplicationStatus, ActivitySource } from "@/generated/prisma/client";
import OpenAI from "openai";
import { google } from "googleapis";
import { encrypt, tryDecrypt } from "@/lib/crypto";
import { requirePro } from "@/lib/entitlements";
import { enforceRateLimit } from "@/lib/rate-limit";

const statusSchema = z.enum(applicationStatuses);

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
      source: ActivitySource.email_suggestion,
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

export async function acceptAllSuggestions() {
  const userId = await getAuthUserId();

  const suggestions = await prisma.emailSuggestion.findMany({
    where: { userId, resolved: false },
  });

  if (suggestions.length === 0) return { success: true, accepted: 0, skipped: 0 };

  const applications = await prisma.application.findMany({
    where: { userId, archived: false },
    select: { id: true, company: true, status: true },
  });

  let accepted = 0;
  let skipped = 0;
  const now = new Date();

  for (const suggestion of suggestions) {
    if (suggestion.suggestedAction === "NEW_APPLICATION") {
      const application = await prisma.application.create({
        data: {
          userId,
          company: suggestion.suggestedCompany ?? "Unknown",
          roleTitle: suggestion.suggestedRole ?? "Unknown",
          status: (suggestion.suggestedStatus as ApplicationStatus) ?? "APPLIED",
          source: null,
          applicationDate: suggestion.emailDate,
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
          source: ActivitySource.email_suggestion,
        },
      });

      await prisma.emailSuggestion.update({
        where: { id: suggestion.id },
        data: {
          resolved: true,
          resolvedAction: "accepted",
          resolvedAt: now,
          applicationId: application.id,
        },
      });

      accepted++;
    } else if (suggestion.suggestedAction === "STATUS_UPDATE") {
      // Auto-match by company name (case-insensitive)
      const match = applications.find(
        (a) =>
          suggestion.suggestedCompany &&
          a.company.toLowerCase() === suggestion.suggestedCompany.toLowerCase()
      );

      if (match && suggestion.suggestedStatus) {
        await prisma.application.update({
          where: { id: match.id },
          data: { status: suggestion.suggestedStatus as ApplicationStatus },
        });

        await prisma.activityLog.create({
          data: {
            userId,
            applicationId: match.id,
            action: "updated",
            details: {
              status: { from: match.status, to: suggestion.suggestedStatus },
              // Kept so the detail view can quote what the change was read
              // from — a stage nobody can trace is a stage nobody can correct.
              email: {
                sender: suggestion.emailSender,
                snippet: suggestion.emailSnippet,
                date: suggestion.emailDate.toISOString(),
              },
            },
            source: ActivitySource.email_suggestion,
          },
        });

        await prisma.emailSuggestion.update({
          where: { id: suggestion.id },
          data: {
            resolved: true,
            resolvedAction: "accepted",
            resolvedAt: now,
            applicationId: match.id,
          },
        });

        accepted++;
      } else {
        // No match found — mark as skipped so it doesn't linger
        await prisma.emailSuggestion.update({
          where: { id: suggestion.id },
          data: {
            resolved: true,
            resolvedAction: "skipped",
            resolvedAt: now,
          },
        });

        skipped++;
      }
    }
  }

  revalidatePath("/dashboard");
  return { success: true, accepted, skipped };
}

export async function acceptStatusUpdate(
  suggestionId: string,
  applicationId: string,
  newStatus: string
) {
  const userId = await getAuthUserId();

  const parsedStatus = statusSchema.safeParse(newStatus);
  if (!parsedStatus.success) return { error: "Invalid status" };

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
    data: { status: parsedStatus.data as ApplicationStatus },
  });

  await prisma.activityLog.create({
    data: {
      userId,
      applicationId,
      action: "updated",
      details: {
        status: { from: existing.status, to: newStatus },
        email: {
          sender: suggestion.emailSender,
          snippet: suggestion.emailSnippet,
          date: suggestion.emailDate.toISOString(),
        },
      },
      source: ActivitySource.email_suggestion,
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

export async function undoEmailSuggestion(activityLogId: string) {
  const userId = await getAuthUserId();

  const log = await prisma.activityLog.findFirst({
    where: { id: activityLogId, userId, source: ActivitySource.email_suggestion },
  });
  if (!log) return { error: "Activity not found" };

  const details = log.details as Record<string, { from?: string; to?: string }> | null;

  // Find the linked suggestion before modifying anything
  let suggestionId: string | null = null;
  if (log.applicationId) {
    const suggestionWhere: Record<string, unknown> = {
      applicationId: log.applicationId,
      resolvedAction: "accepted",
      userId,
    };
    if (log.action === "updated" && details?.status?.to) {
      suggestionWhere.suggestedStatus = details.status.to;
    }
    const suggestion = await prisma.emailSuggestion.findFirst({ where: suggestionWhere });
    suggestionId = suggestion?.id ?? null;
  }

  // Revert the application change
  if (log.action === "created" && log.applicationId) {
    await prisma.application.delete({ where: { id: log.applicationId } });
    // ApplicationId on the log is set to null by SetNull cascade — record still exists
  } else if (log.action === "updated" && log.applicationId && details?.status?.from) {
    await prisma.application.update({
      where: { id: log.applicationId },
      data: { status: details.status.from as ApplicationStatus },
    });
  }

  // Delete the activity log entry
  await prisma.activityLog.delete({ where: { id: activityLogId } });

  // Restore the suggestion to unresolved so it re-appears in the queue
  if (suggestionId) {
    await prisma.emailSuggestion.update({
      where: { id: suggestionId },
      data: {
        resolved: false,
        resolvedAction: null,
        resolvedAt: null,
        applicationId: null,
      },
    });
  }

  revalidatePath("/dashboard");
  return { success: true };
}

export async function generateEmailDraft(suggestionId: string) {
  const userId = await getAuthUserId();

  // Pro gate first, ahead of the model call — a free caller must never reach
  // OpenAI. The client also hides the button, but this is the real boundary.
  const gate = await requirePro(userId);
  if (gate) return gate;

  const suggestion = await prisma.emailSuggestion.findFirst({
    where: { id: suggestionId, userId },
  });
  if (!suggestion) return { error: "Suggestion not found" };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true },
  });

  // Quota is spent last, immediately before the paid call — never on a request
  // that was going to fail anyway. A bogus or someone else's suggestion id must
  // not be able to drain a user's budget (or their shared network's) without
  // ever reaching OpenAI.
  const limited = await enforceRateLimit("email_draft", userId);
  if (limited) return limited;

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const completion = await openai.chat.completions.create({
    model: "gpt-4.1",
    messages: [
      {
        role: "system",
        content:
          "You draft short, professional email replies for job applicants. Write in first person. Be warm but concise — 3-5 sentences maximum. Never use em dashes. Do not add a subject line. Do not include a greeting line (e.g. \"Hi [name]\") or sign-off — those will be added separately. Just write the body paragraph(s).",
      },
      {
        role: "user",
        content: `Draft a reply to this email I received about my job application.

Email subject: ${suggestion.emailSubject}
Sender: ${suggestion.emailSender}
Email snippet: ${suggestion.emailSnippet ?? ""}
Company: ${suggestion.suggestedCompany ?? ""}
Role: ${suggestion.suggestedRole ?? ""}
What happened: ${suggestion.suggestedAction} — ${suggestion.suggestedStatus ?? ""}

The reply should be appropriate for the situation. For example:
- If this is an interview invite, express enthusiasm and confirm availability
- If this is an OA invite, thank them and confirm you'll complete it
- If this is a rejection, thank them graciously and express interest in future opportunities
- If this is an offer, express excitement and ask about next steps

My name is ${user?.name ?? ""}.`,
      },
    ],
  });

  const draft = completion.choices[0].message.content ?? "";
  return { success: true, draft };
}

export async function sendEmailReply(suggestionId: string, body: string) {
  const userId = await getAuthUserId();

  // Gated separately from generateEmailDraft: the two are independent entry
  // points, and a lapsed subscription between drafting and sending should stop
  // the send.
  const gate = await requirePro(userId);
  if (gate) return gate;

  const suggestion = await prisma.emailSuggestion.findFirst({
    where: { id: suggestionId, userId },
  });
  if (!suggestion) return { error: "Suggestion not found" };

  if (!suggestion.emailThreadId) {
    return { error: "Cannot reply — thread ID not available. Try re-syncing Gmail." };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { googleAccessToken: true, googleRefreshToken: true, name: true, email: true },
  });

  if (!user?.googleAccessToken) {
    return { error: "No Google account connected." };
  }

  const accessToken = tryDecrypt(user.googleAccessToken);
  const refreshToken = tryDecrypt(user.googleRefreshToken);

  if (!accessToken) {
    return {
      error: "Gmail credentials need to be refreshed. Please sign out and sign in with Google again to restore access and unlock email replies.",
    };
  }

  // Last thing before Gmail, after every cheap check that could reject this
  // send — a missing thread id or an undecryptable token must not cost a slot.
  const limited = await enforceRateLimit("email_send", userId);
  if (limited) return limited;

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken ?? undefined,
  });

  oauth2Client.on("tokens", async (tokens) => {
    try {
      await prisma.user.update({
        where: { id: userId },
        data: {
          ...(tokens.access_token && { googleAccessToken: encrypt(tokens.access_token) }),
          ...(tokens.refresh_token && { googleRefreshToken: encrypt(tokens.refresh_token) }),
        },
      });
    } catch (err) {
      console.error("Failed to persist refreshed tokens:", err);
    }
  });

  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  const fromHeader = user.name ? `${user.name} <${user.email}>` : user.email;
  const rawEmail = [
    `To: ${suggestion.emailSender}`,
    `From: ${fromHeader}`,
    `Subject: Re: ${suggestion.emailSubject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "",
    `Hi,\n\n${body}\n\nBest,\n${user.name ?? ""}`,
  ].join("\r\n");

  const encodedMessage = Buffer.from(rawEmail).toString("base64url");

  try {
    await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw: encodedMessage, threadId: suggestion.emailThreadId },
    });
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status;
    if (status === 401 || status === 403) {
      return {
        error: "Gmail access has expired. Please sign out and sign in with Google again to restore access and unlock email replies.",
      };
    }
    throw err;
  }

  await prisma.emailSuggestion.update({
    where: { id: suggestionId },
    data: { replySentAt: new Date() },
  });

  revalidatePath("/dashboard");
  return { success: true };
}
