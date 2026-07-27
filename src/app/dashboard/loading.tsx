import {
  MetricStripSkeleton,
  ApplicationTableSkeleton,
} from "@/components/dashboard/dashboard-skeleton";
import { Button } from "@/components/ui/button";
import { Plus, Upload } from "lucide-react";

/**
 * Everything outside `.skeleton-screen` is real chrome: it paints at once and
 * does not move when the data lands. The spinner and its sentence sit where
 * the subtitle will be, so a slow network is explained rather than merely
 * animated.
 */
export default function DashboardLoading() {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-title tracking-title font-semibold">
            Applications
          </h1>
          <div className="mt-2 flex items-center gap-[9px]">
            <span
              className="border-stage-off border-t-primary size-3 animate-spin rounded-full border-2"
              aria-hidden
            />
            <span className="text-body text-muted-foreground">
              Loading your cycle…
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled>
            <Upload className="mr-1.5 size-3.5" />
            Import
          </Button>
          <Button size="sm" disabled>
            <Plus className="mr-1.5 size-3.5" />
            Add application
          </Button>
        </div>
      </div>

      <div className="skeleton-screen space-y-5" aria-hidden>
        <MetricStripSkeleton />
        <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
          <ApplicationTableSkeleton />
          <span />
        </div>
      </div>
    </div>
  );
}
