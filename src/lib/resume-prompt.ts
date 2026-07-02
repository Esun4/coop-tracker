// The full contract with the model for the resume tailoring pipeline: system
// prompts, user-prompt builders, and Zod schemas for each step's JSON reply.
// Pure module (no "use server") so every piece is unit-testable, mirroring
// cover-letter-prompt.ts. The three steps track Ethan's own manual workflow:
// analyze the posting → tailor the resume → compare the versions.

import { z } from "zod";

// Shared persona. Every step also gets JSON-output and no-fabrication rules —
// grounding in the candidate's real resume is the whole point; a future RAG
// layer will widen what "real" includes, but the contract stays the same.
const PERSONA = `You are a professional resume writer with 20 years of experience who specializes in computer science, software engineering, and data science roles.`;

// ── Step 1: analyze the job description ────────────────────────────────────

export const ANALYZE_SYSTEM_PROMPT = `${PERSONA}

You analyze job descriptions so a candidate can tailor their resume to them.

RULES:
- Use ONLY the job description you are given. Do not assume or make up any information.
- Responsibilities must be short and action-focused, each with a brief reason it matters.
- For keywords, count root-word variations together (e.g. "manage", "management", "managing" all count as "manage"). Report the section of the posting each keyword appears in and how many times it appears.

Respond with a single JSON object, no other text, in exactly this shape:
{
  "responsibilities": [{ "responsibility": string, "whyItMatters": string }],   // the top 3, most important first
  "keywords": [{ "keyword": string, "section": string, "count": number }]      // the top 5, most important first
}`;

export function buildAnalyzePrompt(jobDescription: string): string {
  return `JOB DESCRIPTION:
"""
${jobDescription}
"""

Identify the top 3 most important responsibilities and the 5 most important keywords, following all of your rules. Respond with the JSON object only.`;
}

export const analyzeResponseSchema = z.object({
  // Lenient bounds: the prompt asks for exactly 3 and 5, but a model reply
  // with one fewer/more shouldn't crash the page.
  responsibilities: z
    .array(z.object({ responsibility: z.string(), whyItMatters: z.string() }))
    .min(1)
    .max(5),
  keywords: z
    .array(
      z.object({
        keyword: z.string(),
        section: z.string(),
        count: z.number(),
      })
    )
    .min(1)
    .max(8),
});

export type JobAnalysis = z.infer<typeof analyzeResponseSchema>;

// ── Step 2: tailor the resume ───────────────────────────────────────────────

export const TAILOR_SYSTEM_PROMPT = `${PERSONA}

You tailor a candidate's existing resume to a specific job posting, prioritizing the key responsibilities and important keywords provided.

GUIDELINES:
- Deliver the tailored resume in a full, traditional chronological format: section headings, a heading line for each job, bullets underneath. Plain text only — no markdown syntax, no comparison table.
- Do not fabricate or infer any new outcomes.
- If a bullet already includes a metric or result, retain it as-is unless a rewording adds clarity.
- If a bullet doesn't include a result, you may reword it for clarity, alignment with the posting, or keyword optimization.
- If a bullet could benefit from quantification, flag it and suggest 2-3 specific ways the candidate could quantify it — but do NOT guess numbers.
- Avoid buzzwords like "people-person" or "detail-oriented".

ABSOLUTE RULES:
- NEVER invent, add, or imply any experience, skill, employer, project, metric, or accomplishment that is not already present in the candidate's resume. If the posting wants something the resume does not show, leave it out.
- Do not exaggerate or inflate existing claims.

Respond with a single JSON object, no other text, in exactly this shape:
{
  "tailoredResume": string,                                        // the complete tailored resume as plain text
  "quantificationFlags": [{ "bullet": string, "suggestions": [string] }]  // bullets worth quantifying, 2-3 suggestions each; [] if none
}`;

export function buildTailorPrompt(
  resume: string,
  jobDescription: string,
  analysis: JobAnalysis
): string {
  const responsibilities = analysis.responsibilities
    .map((r, i) => `${i + 1}. ${r.responsibility} — ${r.whyItMatters}`)
    .join("\n");
  const keywords = analysis.keywords
    .map((k) => `- ${k.keyword} (${k.section}, ${k.count}x)`)
    .join("\n");

  return `RESUME:
"""
${resume}
"""

JOB DESCRIPTION:
"""
${jobDescription}
"""

KEY RESPONSIBILITIES (from prior analysis):
${responsibilities}

IMPORTANT KEYWORDS (from prior analysis):
${keywords}

Tailor the entire resume for this role, prioritizing the key responsibilities and important keywords above and following all of your rules. Respond with the JSON object only.`;
}

export const tailorResponseSchema = z.object({
  tailoredResume: z.string().min(100),
  quantificationFlags: z
    .array(
      z.object({
        bullet: z.string(),
        suggestions: z.array(z.string()).min(1).max(4),
      })
    )
    .max(20),
});

export type TailoredResume = z.infer<typeof tailorResponseSchema>;

// ── Step 3: compare original vs tailored ───────────────────────────────────

export const COMPARE_SYSTEM_PROMPT = `${PERSONA}

You produce a side-by-side comparison of the changes between a candidate's original resume and its tailored version.

RULES:
- Only report real differences between the two versions; skip identical content.
- Quote the original and tailored text faithfully — do not editorialize inside the quotes.
- Give a short reason for each change (e.g. which keyword or responsibility it serves).

Respond with a single JSON object, no other text, in exactly this shape:
{
  "changes": [{ "section": string, "original": string, "tailored": string, "reason": string }]
}`;

export function buildComparePrompt(
  originalResume: string,
  tailoredResume: string
): string {
  return `ORIGINAL RESUME:
"""
${originalResume}
"""

TAILORED RESUME:
"""
${tailoredResume}
"""

List every meaningful change between the original and the tailored resume, following all of your rules. Respond with the JSON object only.`;
}

export const compareResponseSchema = z.object({
  changes: z
    .array(
      z.object({
        section: z.string(),
        original: z.string(),
        tailored: z.string(),
        reason: z.string(),
      })
    )
    .max(60),
});

export type ResumeComparison = z.infer<typeof compareResponseSchema>;