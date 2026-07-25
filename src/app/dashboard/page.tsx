import {
  getApplications,
  getStats,
  getRecentActivity,
  getDistinctSources,
} from "@/lib/actions/applications";
import { getUnresolvedSuggestions } from "@/lib/actions/suggestions";
import { getPreferences } from "@/lib/actions/preferences";
import { DashboardClient } from "@/components/dashboard/dashboard-client";

export default async function DashboardPage() {
  const [applications, stats, activities, sources, suggestions, preferences] =
    await Promise.all([
      getApplications(),
      getStats(),
      getRecentActivity(),
      getDistinctSources(),
      getUnresolvedSuggestions(),
      getPreferences(),
    ]);

  return (
    <DashboardClient
      initial={{ applications, stats, activities, sources, suggestions }}
      initialDensity={preferences.density === "comfortable" ? "comfortable" : "compact"}
    />
  );
}
