"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { google } from "googleapis";
import type { gmail_v1 } from "googleapis";
import OpenAI from "openai";
import { revalidatePath } from "next/cache";
import { ApplicationStatus, SuggestedAction } from "@/generated/prisma/client";

async function getAuthUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session.user.id;
}

function extractEmailBody(payload: gmail_v1.Schema$MessagePart): string {
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return Buffer.from(payload.body.data, "base64url").toString("utf-8");
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const text = extractEmailBody(part);
      if (text) return text;
    }
  }
  return "";
}

export async function syncGmailEmails() {
  const userId = await getAuthUserId();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { googleAccessToken: true, googleRefreshToken: true },
  });

  if (!user?.googleAccessToken) {
    return {
      error:
        "No Google account connected. Please sign out and sign in with Google to enable Gmail sync.",
    };
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  oauth2Client.setCredentials({
    access_token: user.googleAccessToken,
    refresh_token: user.googleRefreshToken ?? undefined,
  });

  // Persist refreshed tokens back to DB automatically
  oauth2Client.on("tokens", async (tokens) => {
    await prisma.user.update({
      where: { id: userId },
      data: {
        ...(tokens.access_token && { googleAccessToken: tokens.access_token }),
        ...(tokens.refresh_token && {
          googleRefreshToken: tokens.refresh_token,
        }),
      },
    });
  });

  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  const listResponse = await gmail.users.messages.list({
    userId: "me",
    maxResults: 20,
  });

  const messages = listResponse.data.messages ?? [];
  if (messages.length === 0) {
    await prisma.user.update({
      where: { id: userId },
      data: { lastEmailSync: new Date() },
    });
    return { success: true, newSuggestions: 0 };
  }

  const messageIds = messages.map((m) => m.id!).filter(Boolean);

  const existingIds = await prisma.emailSuggestion.findMany({
    where: { userId, emailMessageId: { in: messageIds } },
    select: { emailMessageId: true },
  });
  const existingIdSet = new Set(existingIds.map((e) => e.emailMessageId));

  const newMessages = messages.filter(
    (m) => m.id && !existingIdSet.has(m.id)
  );

  if (newMessages.length === 0) {
    await prisma.user.update({
      where: { id: userId },
      data: { lastEmailSync: new Date() },
    });
    return { success: true, newSuggestions: 0 };
  }

  const fullMessages = await Promise.all(
    newMessages.map((m) =>
      gmail.users.messages.get({ userId: "me", id: m.id!, format: "full" })
    )
  );

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  let newSuggestions = 0;

  for (const response of fullMessages) {
    const message = response.data;
    if (!message.id) continue;

    const headers = message.payload?.headers ?? [];
    const subject =
      headers.find((h) => h.name?.toLowerCase() === "subject")?.value ??
      "(no subject)";
    const from =
      headers.find((h) => h.name?.toLowerCase() === "from")?.value ?? "";
    const dateStr =
      headers.find((h) => h.name?.toLowerCase() === "date")?.value ?? "";
    const snippet = message.snippet ?? "";

    const emailDate = dateStr ? new Date(dateStr) : new Date();
    const body = message.payload ? extractEmailBody(message.payload) : "";
    const emailText = `Subject: ${subject}\nFrom: ${from}\nSnippet: ${snippet}\n\nBody:\n${body.slice(0, 2000)}`;

    let classification: {
      action: string;
      status: string | null;
      company: string | null;
      role: string | null;
      confidence: number;
      reasoning: string;
    };

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You classify emails related to job/internship applications. Return JSON with:
- action: "NEW_APPLICATION" | "STATUS_UPDATE" | "IRRELEVANT"
- status: "APPLIED" | "OA" | "INTERVIEW" | "FINAL_ROUND" | "OFFER" | "REJECTED" | "WITHDRAWN" | null
- company: string | null
- role: string | null
- confidence: number (0-1)
- reasoning: string (one sentence)

NEW_APPLICATION: email confirms an application was submitted.
STATUS_UPDATE: email signals a change (interview invite, rejection, offer, OA, etc.).
IRRELEVANT: unrelated to job applications, OR is an account/profile setup email (e.g. "set up your candidate account", "complete your profile", "verify your email", "activate your account", "create your account", "welcome to", onboarding emails from job platforms, login/password emails). Classify as IRRELEVANT even if the email mentions a company or job title.

For the company field: extract the employer/hiring company, NOT the job board or platform the email was sent through. Indeed, LinkedIn, Glassdoor, Handshake, WaterlooWorks, ZipRecruiter, Monster, and similar are job boards — never use them as the company value. Look inside the email body for the actual employer name (e.g. "You applied to Software Engineer at Stripe" → company: "Stripe"). If you cannot identify the actual employer, set company to null.`,
          },
          { role: "user", content: emailText },
        ],
      });
      classification = JSON.parse(
        completion.choices[0].message.content ?? "{}"
      );
    } catch {
      continue;
    }

    if (
      classification.action === "IRRELEVANT" ||
      !["NEW_APPLICATION", "STATUS_UPDATE"].includes(classification.action)
    ) {
      continue;
    }

    await prisma.emailSuggestion.create({
      data: {
        userId,
        emailMessageId: message.id,
        emailSubject: subject,
        emailSender: from,
        emailDate,
        emailSnippet: snippet || null,
        suggestedAction: classification.action as SuggestedAction,
        suggestedStatus: (classification.status as ApplicationStatus) ?? null,
        suggestedCompany: classification.company ?? null,
        suggestedRole: classification.role ?? null,
        confidence: Math.min(1, Math.max(0, classification.confidence ?? 0)),
        reasoning: classification.reasoning ?? null,
      },
    });

    newSuggestions++;
  }

  await prisma.user.update({
    where: { id: userId },
    data: { lastEmailSync: new Date() },
  });

  revalidatePath("/dashboard");
  return { success: true, newSuggestions };
}
