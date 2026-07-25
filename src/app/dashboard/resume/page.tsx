import { redirect } from "next/navigation";

/** Resume and cover letter merged into one workspace. */
export default function ResumePage() {
  redirect("/dashboard/documents");
}
