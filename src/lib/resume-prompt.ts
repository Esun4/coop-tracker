// The full contract with the model for the resume tailoring pipeline: system
// prompts, user-prompt builders, and Zod schemas for each step's JSON reply.
// Pure module (no "use server") so every piece is unit-testable, mirroring
// cover-letter-prompt.ts. The three steps track Ethan's own manual workflow:
// analyze the posting → tailor the resume → compare the versions.

import { z } from "zod";
import type { ResumeFormat } from "@/lib/schemas";

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

// The LaTeX contract: the model edits the user's Overleaf source in place, so
// the output must still compile in their project untouched. Shared by the
// tailor and refine steps in latex mode.
const LATEX_RULES = `LATEX RULES (the input is a full .tex file from Overleaf):
- Edit ONLY human-readable text content: bullet text, summary lines, skill lists, section text.
- NEVER change the preamble, \\documentclass, \\usepackage lines, custom command definitions, environments, or document structure.
- Keep every command invocation intact (e.g. \\resumeItem{...}, \\textbf{...}) — change only the text inside the braces where appropriate.
- Escape LaTeX special characters in any text you write (\\% \\& \\# \\$ \\_).
- Return the COMPLETE .tex file, byte-for-byte identical outside your text edits, so it can be pasted straight back into Overleaf and compiled.`;

export const TAILOR_LATEX_SYSTEM_PROMPT = `${TAILOR_SYSTEM_PROMPT.replace(
  "- Deliver the tailored resume in a full, traditional chronological format: section headings, a heading line for each job, bullets underneath. Plain text only — no markdown syntax, no comparison table.",
  "- Deliver the tailored resume as the candidate's complete, modified .tex source (see LATEX RULES below)."
)}

${LATEX_RULES}

In the JSON reply, "tailoredResume" is the complete modified .tex source.`;

export function getTailorSystemPrompt(format: ResumeFormat): string {
  return format === "latex" ? TAILOR_LATEX_SYSTEM_PROMPT : TAILOR_SYSTEM_PROMPT;
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
  tailoredResume: string,
  format: ResumeFormat = "text"
): string {
  const latexNote =
    format === "latex"
      ? "\nBoth versions are LaTeX source files. Compare the human-readable CONTENT only — quote the changed text without LaTeX commands, and ignore unchanged markup.\n"
      : "";

  return `ORIGINAL RESUME:
"""
${originalResume}
"""

TAILORED RESUME:
"""
${tailoredResume}
"""
${latexNote}
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

// ── Refine: apply one user instruction to the current draft ────────────────

export const REFINE_SYSTEM_PROMPT = `${PERSONA}

You apply ONE requested change to the candidate's current resume draft.

RULES:
- Apply exactly what the instruction asks — change nothing else.
- NEVER invent, add, or imply any experience, skill, employer, project, metric, or accomplishment that is not already in the draft (or explicitly provided in the instruction by the candidate themselves).
- Do not exaggerate or inflate existing claims.
- Keep the rest of the resume byte-for-byte unchanged.

Respond with a single JSON object, no other text, in exactly this shape:
{ "revised": string }   // the complete resume with the change applied`;

export const REFINE_LATEX_SYSTEM_PROMPT = `${REFINE_SYSTEM_PROMPT.replace(
  '{ "revised": string }   // the complete resume with the change applied',
  '{ "revised": string }   // the complete modified .tex source with the change applied'
)}

${LATEX_RULES}`;

export function getRefineSystemPrompt(format: ResumeFormat): string {
  return format === "latex" ? REFINE_LATEX_SYSTEM_PROMPT : REFINE_SYSTEM_PROMPT;
}

export function buildRefinePrompt(
  resume: string,
  instruction: string,
  jobDescription?: string
): string {
  const jd = jobDescription
    ? `\nJOB DESCRIPTION (context for the change, do not add its claims to the resume):\n"""\n${jobDescription}\n"""\n`
    : "";

  return `CURRENT RESUME DRAFT:
"""
${resume}
"""
${jd}
REQUESTED CHANGE:
"""
${instruction}
"""

Apply the requested change, following all of your rules. Respond with the JSON object only.`;
}

export const refineResponseSchema = z.object({
  revised: z.string().min(100),
});

export type RefinedResume = z.infer<typeof refineResponseSchema>;