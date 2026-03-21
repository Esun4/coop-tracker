import {
  getApplications,
  getStats,
  getRecentActivity,
  getDistinctSources,
} from "@/lib/actions/applications";
import { DashboardClient } from "@/components/dashboard/dashboard-client";

export default async function DashboardPage() {
  const [applications, stats, activities, sources] = await Promise.all([
    getApplications(),
    getStats(),
    getRecentActivity(),
    getDistinctSources(),
  ]);

  return (
    <DashboardClient
      initial={{ applications, stats, activities, sources }}
    />
  );
}
