import { DocumentsWorkspace } from "@/components/dashboard/documents-workspace";
import { getPreferences } from "@/lib/actions/preferences";

export default async function DocumentsPage() {
  // Tailoring is Pro-only. Resolved here on the server so the free view never
  // ships the tailoring UI at all — and `getPreferences` is the same user read
  // the layout already makes.
  const { isPro } = await getPreferences();

  return <DocumentsWorkspace isPro={isPro} />;
}
