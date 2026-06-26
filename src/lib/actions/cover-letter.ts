"use server";

import OpenAI from "openai";
import { auth } from "@/lib/auth";
import { coverLetterSchema, type CoverLetterFormData } from "@/lib/schemas";
import { checkRateLimit } from "@/lib/rate-limit";
import { SYSTEM_PROMPT, buildUserPrompt } from "@/lib/cover-letter-prompt";

// One-line swap point. Today's task (grounded rewording) doesn't justify a
// bigger model; bump this only if output quality disappoints. RAG-era target
// is a stronger writing model — see project memory.
const MODEL = "gpt-4o-mini";

const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

type GenerateResult =
  | { success: true; letter: string }
  | { error: string };

export async function generateCoverLetter(
  input: CoverLetterFormData
): Promise<GenerateResult> {
  // 1. Auth — Server Actions are directly invocable, so this gate is the real
  //    protection, not the page layout.
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  const userId = session.user.id;

  // 2. Validate server-side (the client button gate doesn't count here).
  const parsed = coverLetterSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }
  const { baseLetter, jobDescription } = parsed.data;

  // 3. Rate limit BEFORE the paid call, so a generation counts against quota
  //    even if the model call then fails.
  const allowed = await checkRateLimit(
    userId,
    "cover_letter",
    RATE_LIMIT,
    RATE_WINDOW_MS
  );
  if (!allowed) {
    return {
      error: `You've reached the limit of ${RATE_LIMIT} generations per hour. Try again later.`,
    };
  }

  // 4. The LLM call — wrapped so a model/network blip becomes a clean error
  //    toast rather than an unhandled exception.
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model: MODEL,
      temperature: 0.7,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(baseLetter, jobDescription) },
      ],
    });

    const letter = completion.choices[0]?.message?.content?.trim();
    if (!letter) {
      return { error: "Couldn't generate your cover letter. Please try again." };
    }

    return { success: true, letter };
  } catch {
    return { error: "Couldn't generate your cover letter. Please try again." };
  }
}
