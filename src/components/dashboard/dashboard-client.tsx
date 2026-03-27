"use client";

import { useState, useCallback, useEffect, useTransition } from "react";
import { StatsCards } from "./stats-cards";
import { ApplicationTable } from "./application-table";
import { ApplicationForm } from "./application-form";
import { FiltersToolbar } from "./filters-toolbar";
import { ActivityFeed } from "./activity-feed";
import { FunnelChart } from "./funnel-chart";
import { EmailSuggestionsSection } from "./email-suggestions-section";
import { ImportCsvDialog } from "./import-csv-dialog";
import {
  getApplications,
  getStats,
  getRecentActivity,
  getDistinctSources,
} from "@/lib/actions/applications";
import { getUnresolvedSuggestions } from "@/lib/actions/suggestions";
import { syncGmailEmails } from "@/lib/actions/gmail";
import type { Application, EmailSuggestion } from "@/generated/prisma/client";
import { statusLabels } from "@/lib/schemas";
import { toast } from "sonner";
import { BarChart2, List } from "lucide-react";

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
  const [showImport, setShowImport] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);

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

  function handleExport() {
    const apps = data.applications;
    if (apps.length === 0) {
      toast.info("No applications to export");
      return;
    }

    const headers = [
      "Company", "Role", "Status", "Location",
      "Application Date", "Source", "Contact / Recruiter", "Notes", "Archived",
    ];

    function escape(val: string | null | undefined): string {
      const str = val ?? "";
      return str.includes(",") || str.includes('"') || str.includes("\n")
        ? `"${str.replace(/"/g, '""')}"`
        : str;
    }

    const rows = apps.map((a) => [
      escape(a.company),
      escape(a.roleTitle),
      escape(statusLabels[a.status as keyof typeof statusLabels] ?? a.status),
      escape(a.location),
      escape(a.applicationDate ? new Date(a.applicationDate).toLocaleDateString() : ""),
      escape(a.source),
      escape(a.contactInfo),
      escape(a.notes),
      a.archived ? "Yes" : "No",
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `applications-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
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
    <div className="space-y-5">
      <StatsCards stats={data.stats} />

      {data.suggestions.length > 0 && (
        <EmailSuggestionsSection
          suggestions={data.suggestions}
          applications={data.applications}
          onResolved={refresh}
        />
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
        {/* Main column */}
        <div className="space-y-3">
          {showAnalytics ? (
            <div className="rounded-lg border bg-card p-6">
              <FunnelChart applications={data.applications} />
            </div>
          ) : (
            <>
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
                onExport={handleExport}
                onImport={() => setShowImport(true)}
              />

              <div className={isPending ? "opacity-50 pointer-events-none transition-opacity" : "transition-opacity"}>
                <ApplicationTable
                  applications={[
                    ...data.applications.filter((a) => a.status !== "REJECTED"),
                    ...data.applications.filter((a) => a.status === "REJECTED"),
                  ]}
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={handleSort}
                  onUpdate={refresh}
                />
              </div>
            </>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-3">
          {/* View toggle */}
          <div className="flex rounded-lg border bg-card overflow-hidden">
            <button
              className="flex flex-1 items-center justify-center gap-2 py-2.5 text-xs font-medium transition-colors"
              style={{
                background: !showAnalytics ? "oklch(0.97 0 0)" : "transparent",
                color: !showAnalytics ? "oklch(0.145 0 0)" : "oklch(0.556 0 0)",
                borderRight: "1px solid oklch(0.922 0 0)",
              }}
              onClick={() => setShowAnalytics(false)}
            >
              <List className="h-3.5 w-3.5" />
              List
            </button>
            <button
              className="flex flex-1 items-center justify-center gap-2 py-2.5 text-xs font-medium transition-colors"
              style={{
                background: showAnalytics ? "oklch(0.97 0 0)" : "transparent",
                color: showAnalytics ? "oklch(0.145 0 0)" : "oklch(0.556 0 0)",
              }}
              onClick={() => setShowAnalytics(true)}
            >
              <BarChart2 className="h-3.5 w-3.5" />
              Analytics
            </button>
          </div>

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

      <ImportCsvDialog
        open={showImport}
        onOpenChange={setShowImport}
        onSuccess={refresh}
      />
    </div>
  );
}
