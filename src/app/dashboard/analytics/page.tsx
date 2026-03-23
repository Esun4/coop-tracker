import { getApplications } from "@/lib/actions/applications";
import { FunnelChart } from "@/components/dashboard/funnel-chart";

export default async function AnalyticsPage() {
  const applications = await getApplications({ includeArchived: false });

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-card p-6">
        <h2 className="text-base font-semibold mb-6">Application Pipeline</h2>
        <FunnelChart applications={applications} />
      </div>
    </div>
  );
}
