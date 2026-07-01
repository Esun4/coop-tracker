import { getApplications } from "@/lib/actions/applications";
import { FunnelChart } from "@/components/dashboard/funnel-chart";
import { StatusPieChart } from "@/components/dashboard/status-pie-chart";

export default async function AnalyticsPage() {
  const applications = await getApplications({ includeArchived: false });

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          Analytics
        </h1>
        <p className="text-sm text-muted-foreground">
          How your active applications are progressing through the pipeline.
        </p>
      </div>

      <div className="rounded-xl border bg-card p-6 shadow-xs">
        <h2 className="text-base font-semibold mb-6">Application Pipeline</h2>
        <FunnelChart applications={applications} />
      </div>

      <div className="rounded-xl border bg-card p-6 shadow-xs">
        <h2 className="text-base font-semibold mb-6">Outcome Breakdown</h2>
        <StatusPieChart applications={applications} />
      </div>
    </div>
  );
}
