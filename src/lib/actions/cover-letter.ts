"use server";

import OpenAI from "openai";
import { auth } from "@/lib/auth";
import {
  coverLetterSchema,
  condenseLetterSchema,
  type CoverLetterFormData,
  type CondenseLetterInput,
} from "@/lib/schemas";
import { enforceRateLimit } from "@/lib/rate-limit";
import { requirePro } from "@/lib/entitlements";
import type { ProRequired } from "@/lib/pro";
import {
  SYSTEM_PROMPT,
  buildUserPrompt,
  CONDENSE_SYSTEM_PROMPT,
  buildCondensePrompt,
} from "@/lib/cover-letter-prompt";

// One-line swap point. Today's task (grounded rewording) doesn't justify a
// bigger model; bump this only if output quality disappoints. RAG-era target
// is a stronger writing model — see project memory.
const MODEL = "gpt-4o-mini";

// Budgets live in `@/lib/rate-limit` (RATE_LIMITS.cover_letter) so every cap in
// the app is retunable from one place as the API credit balance changes.

type GenerateResult =
  | { success: true; letter: string }
  | { error: string; proRequired?: true; retryAt?: string }
  | ProRequired;

export async function generateCoverLetter(
  input: CoverLetterFormData
): Promise<GenerateResult> {
  // 1. Auth — Server Actions are directly invocable, so this gate is the real
  //    protection, not the page layout.
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  const userId = session.user.id;

  // 2. Pro gate — ahead of both validation and the rate limiter, so a free
  //    caller neither reaches OpenAI nor burns a quota slot they can't use.
  const gate = await requirePro(userId);
  if (gate) return gate;

  // 3. Validate server-side (the client button gate doesn't count here).
  const parsed = coverLetterSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }
  const { baseLetter, jobDescription } = parsed.data;

  // 4. Rate limit BEFORE the paid call, so a generation counts against quota
  //    even if the model call then fails. Checks the per-account budget and the
  //    per-network one; either can block.
  const limited = await enforceRateLimit("cover_letter", userId);
  if (limited) return limited;

  // 5. The LLM call — wrapped so a model/network blip becomes a clean error
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

// Shortens an already-generated letter so it fits on one printed page (used by
// the PDF export when the rendered letter overflows). Shares the cover_letter
// rate-limit bucket with generation — both are paid model calls.
export async function condenseCoverLetter(
  input: CondenseLetterInput
): Promise<GenerateResult> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  const userId = session.user.id;

  const gate = await requirePro(userId);
  if (gate) return gate;

  const parsed = condenseLetterSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }
  const { letter, targetWords } = parsed.data;

  const limited = await enforceRateLimit("cover_letter", userId);
  if (limited) return limited;

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model: MODEL,
      // Compression is a convergent task — keep the sampling tight so the
      // shortened letter stays close to the original wording.
      temperature: 0.3,
      messages: [
        { role: "system", content: CONDENSE_SYSTEM_PROMPT },
        { role: "user", content: buildCondensePrompt(letter, targetWords) },
      ],
    });

    const shortened = completion.choices[0]?.message?.content?.trim();
    if (!shortened) {
      return { error: "Couldn't shorten your cover letter. Please try again." };
    }

    return { success: true, letter: shortened };
  } catch {
    return { error: "Couldn't shorten your cover letter. Please try again." };
  }
}
