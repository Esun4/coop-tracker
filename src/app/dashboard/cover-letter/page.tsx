import { redirect } from "next/navigation";

/** Resume and cover letter merged into one workspace. */
export default function CoverLetterPage() {
  redirect("/dashboard/documents");
}
