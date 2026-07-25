import { z } from "zod";

export const applicationStatuses = [
  "APPLIED",
  "OA",
  "INTERVIEW",
  "FINAL_ROUND",
  "OFFER",
  "REJECTED",
  "WITHDRAWN",
] as const;

export type ApplicationStatusType = (typeof applicationStatuses)[number];

// Display labels. `OA` reads as "Assessment" in the UI — a display-layer
// rename only, the enum and every stored row are untouched.
export const statusLabels: Record<ApplicationStatusType, string> = {
  APPLIED: "Applied",
  OA: "Assessment",
  INTERVIEW: "Interview",
  FINAL_ROUND: "Final round",
  OFFER: "Offer",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
};

// Inputs for cover-letter tailoring. Bounds serve two jobs: reject junk before
// spending an OpenAI call (min), and cap cost/latency of any single request (max).
export const coverLetterSchema = z.object({
  baseLetter: z
    .string()
    .min(100, "Your base cover letter looks too short — paste the full letter.")
    .max(8000, "Your base cover letter is too long (8,000 character max)."),
  jobDescription: z
    .string()
    .min(50, "The job description looks too short — paste more of the posting.")
    .max(12000, "The job description is too long (12,000 character max)."),
});

export type CoverLetterFormData = z.infer<typeof coverLetterSchema>;

// Input for the one-page condense pass of the PDF export. The letter normally
// comes from our own generator, but Server Actions are directly invocable, so
// it gets the same junk/cost bounds as generation. targetWords is clamped to
// the range that plausibly fits a one-page letter.
export const condenseLetterSchema = z.object({
  letter: z
    .string()
    .min(100, "There's no letter to shorten yet.")
    .max(12000, "The letter is too long to shorten (12,000 character max)."),
  targetWords: z.number().int().min(150).max(450),
});

export type CondenseLetterInput = z.infer<typeof condenseLetterSchema>;

// Inputs for the resume tailoring pipeline. Same philosophy as the cover
// letter bounds: reject junk before spending an OpenAI call, cap cost after.
export const resumeAnalyzeSchema = z.object({
  jobDescription: z
    .string()
    .min(50, "The job description looks too short — paste more of the posting.")
    .max(12000, "The job description is too long (12,000 character max)."),
});

// "text" = extracted/pasted resume prose; "latex" = the full .tex source of an
// Overleaf resume, edited in place so the user's own template keeps compiling.
export const resumeFormatSchema = z.enum(["text", "latex"]);

export const resumeTailorSchema = resumeAnalyzeSchema.extend({
  resume: z
    .string()
    .min(200, "Your resume looks too short — paste the full resume.")
    .max(20000, "Your resume is too long (20,000 character max)."),
  format: resumeFormatSchema.default("text"),
});

export const resumeCompareSchema = z.object({
  originalResume: z.string().min(200).max(20000),
  tailoredResume: z.string().min(200).max(20000),
  format: resumeFormatSchema.default("text"),
});

export const resumeRefineSchema = z.object({
  resume: z.string().min(200).max(20000),
  instruction: z
    .string()
    .min(5, "Describe the change you want.")
    .max(1000, "Keep the instruction under 1,000 characters."),
  jobDescription: z.string().max(12000).optional(),
  format: resumeFormatSchema.default("text"),
});

export type ResumeFormat = z.infer<typeof resumeFormatSchema>;
export type ResumeAnalyzeInput = z.infer<typeof resumeAnalyzeSchema>;
// z.input, not z.infer: `format` has a default, so callers may omit it.
export type ResumeTailorInput = z.input<typeof resumeTailorSchema>;
export type ResumeCompareInput = z.input<typeof resumeCompareSchema>;
export type ResumeRefineInput = z.input<typeof resumeRefineSchema>;

export const applicationSchema = z.object({
  company: z.string().min(1, "Company is required"),
  roleTitle: z.string().min(1, "Role title is required"),
  location: z.string().optional(),
  applicationDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
    .refine((val) => !isNaN(new Date(val).getTime()), "Invalid date")
    .optional(),
  status: z.enum(applicationStatuses).default("APPLIED"),
  source: z.string().optional(),
  notes: z.string().optional(),
  contactInfo: z.string().optional(),
});

export type ApplicationFormData = z.infer<typeof applicationSchema>;
