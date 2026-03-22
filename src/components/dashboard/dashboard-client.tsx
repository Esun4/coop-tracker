"use client";

import { useState, useCallback, useEffect, useTransition } from "react";
import { StatsCards } from "./stats-cards";
import { ApplicationTable } from "./application-table";
import { ApplicationForm } from "./application-form";
import { FiltersToolbar } from "./filters-toolbar";
import { ActivityFeed } from "./activity-feed";
import { EmailSuggestionsSection } from "./email-suggestions-section";
import {
  getApplications,
  getStats,
  getRecentActivity,
  getDistinctSources,
} from "@/lib/actions/applications";
import { getUnresolvedSuggestions } from "@/lib/actions/suggestions";
import { syncGmailEmails } from "@/lib/actions/gmail";
import type { Application, EmailSuggestion } from "@/generated/prisma/client";
import { toast } from "sonner";

interface DashboardData {
  applications: Application[];
  stats: {
    total: number;
    byStatus: Record<string, number>;
    interviewRate: number;
  };
  activities: Awaited<ReturnType<typeof getRecentActivity>>;
  sources: string[];
  suggestions: EmailSuggestion[];
}

export function DashboardClient({ initial }: { initial: DashboardData }) {
  const [data, setData] = useState(initial);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [sortBy, setSortBy] = useState("updatedAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [showAddForm, setShowAddForm] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isSyncing, setIsSyncing] = useState(false);

  const refresh = useCallback(() => {
    startTransition(async () => {
      const [applications, stats, activities, sources, suggestions] =
        await Promise.all([
          getApplications({
            search: search || undefined,
            status:
              statusFilter && statusFilter !== "all" ? statusFilter : undefined,
            source:
              sourceFilter && sourceFilter !== "all" ? sourceFilter : undefined,
            sortBy,
            sortOrder,
            includeArchived: showArchived,
          }),
          getStats(),
          getRecentActivity(),
          getDistinctSources(),
          getUnresolvedSuggestions(),
        ]);
      setData({ applications, stats, activities, sources, suggestions });
    });
  }, [search, statusFilter, sourceFilter, sortBy, sortOrder, showArchived]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function handleSort(column: string) {
    if (sortBy === column) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(column);
      setSortOrder("asc");
    }
  }

  async function handleSyncGmail() {
    setIsSyncing(true);
    const result = await syncGmailEmails();
    setIsSyncing(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    if (result.newSuggestions === 0) {
      toast.info("No new job-related emails found");
    } else {
      toast.success(
        `Found ${result.newSuggestions} new suggestion${result.newSuggestions === 1 ? "" : "s"}`
      );
    }

    refresh();
  }

  return (
    <div className="space-y-6">
      <StatsCards stats={data.stats} />

      {data.suggestions.length > 0 && (
        <EmailSuggestionsSection
          suggestions={data.suggestions}
          applications={data.applications}
          onResolved={refresh}
        />
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          <FiltersToolbar
            search={search}
            onSearchChange={setSearch}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            sourceFilter={sourceFilter}
            onSourceFilterChange={setSourceFilter}
            sources={data.sources}
            showArchived={showArchived}
            onShowArchivedChange={setShowArchived}
            onAddNew={() => setShowAddForm(true)}
            onSyncGmail={handleSyncGmail}
            isSyncing={isSyncing}
            pendingSuggestions={data.suggestions.length}
          />

          <div className={isPending ? "opacity-60 pointer-events-none" : ""}>
            <ApplicationTable
              applications={data.applications}
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSort={handleSort}
            />
          </div>
        </div>

        <div className="space-y-4">
          <ActivityFeed activities={data.activities} />
        </div>
      </div>

      <ApplicationForm
        open={showAddForm}
        onOpenChange={(open) => {
          setShowAddForm(open);
          if (!open) refresh();
        }}
      />
    </div>
  );
}
