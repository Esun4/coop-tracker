import { z } from "zod";

export const applicationStatuses = [
  "APPLYING",
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
  APPLYING: "Applying",
  APPLIED: "Applied",
  OA: "OA",
  INTERVIEW: "Interview",
  FINAL_ROUND: "Final Round",
  OFFER: "Offer",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
};

export const statusColors: Record<ApplicationStatusType, string> = {
  APPLYING: "bg-blue-100 text-blue-800",
  APPLIED: "bg-indigo-100 text-indigo-800",
  OA: "bg-yellow-100 text-yellow-800",
  INTERVIEW: "bg-purple-100 text-purple-800",
  FINAL_ROUND: "bg-orange-100 text-orange-800",
  OFFER: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
  WITHDRAWN: "bg-gray-100 text-gray-800",
};

export const applicationSchema = z.object({
  company: z.string().min(1, "Company is required"),
  roleTitle: z.string().min(1, "Role title is required"),
  location: z.string().optional(),
  applicationDate: z.string().optional(),
  status: z.enum(applicationStatuses).default("APPLYING"),
  source: z.string().optional(),
  notes: z.string().optional(),
  contactInfo: z.string().optional(),
});

export type ApplicationFormData = z.infer<typeof applicationSchema>;
