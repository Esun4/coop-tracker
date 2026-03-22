import {
  getApplications,
  getStats,
  getRecentActivity,
  getDistinctSources,
} from "@/lib/actions/applications";
import { getUnresolvedSuggestions } from "@/lib/actions/suggestions";
import { DashboardClient } from "@/components/dashboard/dashboard-client";

export default async function DashboardPage() {
  const [applications, stats, activities, sources, suggestions] =
    await Promise.all([
      getApplications(),
      getStats(),
      getRecentActivity(),
      getDistinctSources(),
      getUnresolvedSuggestions(),
    ]);

  return (
    <DashboardClient
      initial={{ applications, stats, activities, sources, suggestions }}
    />
  );
}
