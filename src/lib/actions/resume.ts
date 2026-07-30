"use server";

import OpenAI from "openai";
import type { z } from "zod";
import { auth } from "@/lib/auth";
import {
  resumeAnalyzeSchema,
  resumeTailorSchema,
  resumeCompareSchema,
  resumeRefineSchema,
  type ResumeAnalyzeInput,
  type ResumeTailorInput,
  type ResumeCompareInput,
  type ResumeRefineInput,
} from "@/lib/schemas";
import { enforceRateLimit } from "@/lib/rate-limit";
import { requirePro } from "@/lib/entitlements";
import {
  ANALYZE_SYSTEM_PROMPT,
  buildAnalyzePrompt,
  analyzeResponseSchema,
  getTailorSystemPrompt,
  buildTailorPrompt,
  tailorResponseSchema,
  COMPARE_SYSTEM_PROMPT,
  buildComparePrompt,
  compareResponseSchema,
  getRefineSystemPrompt,
  buildRefinePrompt,
  refineResponseSchema,
  type JobAnalysis,
  type TailoredResume,
  type ResumeComparison,
  type RefinedResume,
} from "@/lib/resume-prompt";

// Same swap point rationale as cover-letter.ts. When the RAG layer lands,
// these actions keep their signatures — retrieval widens the prompt, not the
// contract.
const MODEL = "gpt-4o-mini";

// Budget lives in `@/lib/rate-limit` (RATE_LIMITS.resume_tailor). Note that one
// tailoring session is up to 3 calls (analyze → tailor → compare) and every one
// of them spends from that bucket.

type ActionResult<T> =
  | { success: true; data: T }
  | { error: string; proRequired?: true; retryAt?: string };

// Shared plumbing for one JSON-mode model call: auth is already checked by the
// caller; this checks entitlement and quota, calls the model, and Zod-validates
// the reply so a malformed model response becomes a clean error, never a broken
// page.
//
// Tailoring is Pro-only, and the gate lives here rather than in each of the
// four actions: every one of them ends in this function, so a step added later
// is gated by construction instead of by remembering.
async function runJsonStep<T>(
  userId: string,
  systemPrompt: string,
  userPrompt: string,
  responseSchema: z.ZodType<T>,
  failureMessage: string
): Promise<ActionResult<T>> {
  const gate = await requirePro(userId);
  if (gate) return gate;

  const limited = await enforceRateLimit("resume_tailor", userId);
  if (limited) return limited;

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model: MODEL,
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) return { error: failureMessage };

    const parsed = responseSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return { error: failureMessage };

    return { success: true, data: parsed.data };
  } catch {
    return { error: failureMessage };
  }
}

/** Step 1 — top responsibilities + keyword table from the job description. */
export async function analyzeJobForResume(
  input: ResumeAnalyzeInput
): Promise<ActionResult<JobAnalysis>> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const parsed = resumeAnalyzeSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  return runJsonStep(
    session.user.id,
    ANALYZE_SYSTEM_PROMPT,
    buildAnalyzePrompt(parsed.data.jobDescription),
    analyzeResponseSchema,
    "Couldn't analyze the job description. Please try again."
  );
}

/** Step 2 — full tailored resume + quantification flags. */
export async function tailorResume(
  input: ResumeTailorInput & { analysis: JobAnalysis }
): Promise<ActionResult<TailoredResume>> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const parsedInput = resumeTailorSchema.safeParse(input);
  if (!parsedInput.success) return { error: parsedInput.error.issues[0].message };

  // The analysis rides along from step 1; re-validate it rather than trusting
  // the client shape.
  const parsedAnalysis = analyzeResponseSchema.safeParse(input.analysis);
  if (!parsedAnalysis.success) {
    return { error: "Run the job analysis step first." };
  }

  return runJsonStep(
    session.user.id,
    getTailorSystemPrompt(parsedInput.data.format),
    buildTailorPrompt(
      parsedInput.data.resume,
      parsedInput.data.jobDescription,
      parsedAnalysis.data
    ),
    tailorResponseSchema,
    "Couldn't tailor your resume. Please try again."
  );
}

/** Refine — apply one user instruction to the current draft (text or LaTeX). */
export async function refineResume(
  input: ResumeRefineInput
): Promise<ActionResult<RefinedResume>> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const parsed = resumeRefineSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  return runJsonStep(
    session.user.id,
    getRefineSystemPrompt(parsed.data.format),
    buildRefinePrompt(
      parsed.data.resume,
      parsed.data.instruction,
      parsed.data.jobDescription
    ),
    refineResponseSchema,
    "Couldn't apply that change. Please try again."
  );
}

/** Step 3 — side-by-side table of what changed and why. */
export async function compareResumes(
  input: ResumeCompareInput
): Promise<ActionResult<ResumeComparison>> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const parsed = resumeCompareSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  return runJsonStep(
    session.user.id,
    COMPARE_SYSTEM_PROMPT,
    buildComparePrompt(
      parsed.data.originalResume,
      parsed.data.tailoredResume,
      parsed.data.format
    ),
    compareResponseSchema,
    "Couldn't compare the resumes. Please try again."
  );
}