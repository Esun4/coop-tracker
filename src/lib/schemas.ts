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

export const statusLabels: Record<ApplicationStatusType, string> = {
  APPLIED: "Applied",
  OA: "OA",
  INTERVIEW: "Interview",
  FINAL_ROUND: "Final Round",
  OFFER: "Offer",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
};

export const statusColors: Record<ApplicationStatusType, string> = {
  APPLIED: "bg-indigo-100 text-indigo-800 dark:bg-indigo-500/15 dark:text-indigo-300",
  OA: "bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-300",
  INTERVIEW: "bg-purple-100 text-purple-800 dark:bg-purple-500/15 dark:text-purple-300",
  FINAL_ROUND: "bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300",
  OFFER: "bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300",
  REJECTED: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300",
  WITHDRAWN: "bg-gray-100 text-gray-800 dark:bg-gray-500/15 dark:text-gray-300",
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

export const resumeTailorSchema = resumeAnalyzeSchema.extend({
  resume: z
    .string()
    .min(200, "Your resume looks too short — paste the full resume.")
    .max(15000, "Your resume is too long (15,000 character max)."),
});

export const resumeCompareSchema = z.object({
  originalResume: z.string().min(200).max(15000),
  tailoredResume: z.string().min(200).max(15000),
});

export type ResumeAnalyzeInput = z.infer<typeof resumeAnalyzeSchema>;
export type ResumeTailorInput = z.infer<typeof resumeTailorSchema>;
export type ResumeCompareInput = z.infer<typeof resumeCompareSchema>;

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
