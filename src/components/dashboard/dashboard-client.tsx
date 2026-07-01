"use client";

import { useState, useCallback, useEffect, useTransition } from "react";
import { StatsCards } from "./stats-cards";
import { ApplicationTable } from "./application-table";
import { ApplicationForm } from "./application-form";
import { FiltersToolbar } from "./filters-toolbar";
import { ActivityFeed } from "./activity-feed";
import { EmailSuggestionsSection } from "./email-suggestions-section";
import { ImportCsvDialog } from "./import-csv-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  Plus,
  Mail,
  RefreshCw,
  Download,
  Upload,
  MoreHorizontal,
} from "lucide-react";

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
      {/* Page header: title + primary actions */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track your co-op and internship applications in one place.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-9 text-xs"
            onClick={handleSyncGmail}
            disabled={isSyncing}
          >
            {isSyncing ? (
              <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Mail className="mr-1.5 h-3.5 w-3.5" />
            )}
            {isSyncing ? "Syncing…" : "Sync Gmail"}
            {data.suggestions.length > 0 && !isSyncing && (
              <span className="ml-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-mono font-semibold text-primary-foreground">
                {data.suggestions.length}
              </span>
            )}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 w-9 p-0"
                  aria-label="Import or export"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setShowImport(true)}>
                <Upload className="mr-2 h-3.5 w-3.5" />
                Import CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExport}>
                <Download className="mr-2 h-3.5 w-3.5" />
                Export CSV
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            size="sm"
            className="h-9 text-xs"
            onClick={() => setShowAddForm(true)}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add Application
          </Button>
        </div>
      </div>

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
        </div>

        {/* Sidebar */}
        <div className="lg:sticky lg:top-7 lg:self-start">
          <ActivityFeed activities={data.activities} onResolved={refresh} />
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
