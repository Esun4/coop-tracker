"use client";

import { useState, useCallback, useEffect, useMemo, useTransition } from "react";
import { MetricStrip } from "./metric-strip";
import { ApplicationTable, type Density } from "./application-table";
import { ApplicationForm } from "./application-form";
import { FiltersToolbar } from "./filters-toolbar";
import { ActivityFeed } from "./activity-feed";
import { EmailSuggestionsSection } from "./email-suggestions-section";
import { SuggestionsCard } from "./suggestions-card";
import { ReviewSuggestionsDialog } from "./review-suggestions-dialog";
import { NothingFoundDialog } from "./nothing-found-dialog";
import {
  GmailExpiredBanner,
  GmailExpiredDialog,
  GmailExpiredPill,
} from "./gmail-status";
import { ImportCsvDialog } from "./import-csv-dialog";
import { BulkActionBar } from "./bulk-action-bar";
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
  bulkUpdateStatus,
  bulkSetDeadline,
} from "@/lib/actions/applications";
import {
  getUnresolvedSuggestions,
  acceptAllSuggestions,
  acceptStatusUpdate,
  dismissSuggestion,
} from "@/lib/actions/suggestions";
import { syncGmailEmails } from "@/lib/actions/gmail";
import type { Application, EmailSuggestion } from "@/generated/prisma/client";
import { statusLabels, type ApplicationStatusType } from "@/lib/schemas";
import { isInPlay } from "@/lib/stage";
import {
  EMPTY_SELECTION,
  pruneSelection,
  toggleAll,
  toggleRow,
  type Selection,
} from "@/lib/selection";
import { buildApplicationsCsv, applicationsCsvFilename } from "@/lib/csv";
import { updatePreferences } from "@/lib/actions/preferences";
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
  stats: Awaited<ReturnType<typeof getStats>>;
  activities: Awaited<ReturnType<typeof getRecentActivity>>;
  sources: string[];
  suggestions: EmailSuggestion[];
}

const PAGE_SIZE = 50;

export function DashboardClient({
  initial,
  initialDensity = "compact",
}: {
  initial: DashboardData;
  initialDensity?: Density;
}) {
  const [data, setData] = useState(initial);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  // The redesigned toolbar has no archived view and no sort headers — rows are
  // grouped by whose move it is, most recently touched first inside each group.
  const showArchived = false;
  const sortBy = "updatedAt";
  const sortOrder = "desc" as const;
  const [inPlayOnly, setInPlayOnly] = useState(true);
  const [density, setDensity] = useState<Density>(initialDensity);
  const [page, setPage] = useState(1);
  const [showAddForm, setShowAddForm] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isSyncing, setIsSyncing] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [gmailExpired, setGmailExpired] = useState(false);
  const [showGmailDialog, setShowGmailDialog] = useState(false);
  const [showNothingFound, setShowNothingFound] = useState(false);
  const [lastScanned, setLastScanned] = useState(0);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selection, setSelection] = useState<Selection>(EMPTY_SELECTION);
  const [bulkPending, setBulkPending] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [acceptingAll, setAcceptingAll] = useState(false);
  const [showSuggestionDetail, setShowSuggestionDetail] = useState(false);

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

  // The in-play filter is applied here rather than in the query so the closed
  // count stays available for the collapsed row that explains the filter.
  const rows = useMemo(
    () =>
      inPlayOnly
        ? data.applications.filter((a) =>
            isInPlay(a.status as ApplicationStatusType),
          )
        : data.applications,
    [data.applications, inPlayOnly],
  );

  // Counted from the filtered set, not the global totals: the collapsed row
  // claims these are hidden *by the in-play filter*, so it must not include
  // closed rows that the search or source filter excluded anyway.
  const closedCount = useMemo(
    () => ({
      rejected: data.applications.filter((a) => a.status === "REJECTED").length,
      withdrawn: data.applications.filter((a) => a.status === "WITHDRAWN")
        .length,
    }),
    [data.applications],
  );

  // Says which filter emptied the table, and how much sits behind it.
  const filterSummary = useMemo(() => {
    if (rows.length > 0) return null;
    // An account with nothing in it gets the empty state, not a filter story.
    if (data.stats.total === 0) return null;
    const clauses: string[] = [];
    if (search) clauses.push(`“${search}”`);
    if (statusFilter && statusFilter !== "all") {
      clauses.push(statusLabels[statusFilter as ApplicationStatusType] ?? statusFilter);
    }
    if (sourceFilter && sourceFilter !== "all") clauses.push(sourceFilter);
    if (inPlayOnly) clauses.push("in play");
    if (clauses.length === 0) return null;
    return { description: clauses.join(" · "), totalWithout: data.stats.total };
  }, [rows.length, search, statusFilter, sourceFilter, inPlayOnly, data.stats.total]);

  // Selection is held against the filtered set, not the page, so paging does
  // not silently drop rows the bar is counting.
  //
  // Pruning is derived at render rather than written back into state: rows that
  // a filter or a delete took away must not be counted or acted on, and every
  // consumer below reads `visible` — so a stale id can never reach a mutation,
  // and no effect has to chase the filtered set to keep state honest.
  const rowIds = useMemo(() => rows.map((row) => row.id), [rows]);
  const visible = useMemo(
    () => pruneSelection(selection, rowIds),
    [selection, rowIds],
  );

  const selectedIds = useMemo(() => [...visible.ids], [visible.ids]);

  useEffect(() => {
    if (visible.ids.size === 0) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      // An open dialog or menu owns Escape first — dismissing it should not
      // also throw away the selection it was opened to act on.
      if (document.querySelector('[role="dialog"], [role="menu"]')) return;
      setSelection(EMPTY_SELECTION);
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [visible.ids.size]);

  function handleSelectionModeChange(next: boolean) {
    setSelectionMode(next);
    // Leaving selection mode drops the selection: a hidden count that survives
    // the column disappearing is a trap.
    if (!next) setSelection(EMPTY_SELECTION);
  }

  async function handleBulkStage(status: ApplicationStatusType) {
    setBulkPending(true);
    try {
      const result = await bulkUpdateStatus(selectedIds, status);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(
        result.skipped > 0
          ? `${result.updated} moved to ${statusLabels[status]} · ${result.skipped} already there`
          : `${result.updated} moved to ${statusLabels[status]}`,
      );
      setSelection(EMPTY_SELECTION);
      refresh();
    } catch {
      // An action that rejects rather than returning an error — an expired
      // session, a dropped connection — must still release the bar.
      toast.error("Couldn't update those applications. Try again.");
    } finally {
      setBulkPending(false);
    }
  }

  async function handleBulkDeadline(deadlineAt: string | null) {
    setBulkPending(true);
    try {
      const result = await bulkSetDeadline(selectedIds, { deadlineAt });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(
        deadlineAt
          ? `Deadline set on ${result.updated} · ${result.scheduled} reminder${
              result.scheduled === 1 ? "" : "s"
            } scheduled`
          : `Deadline cleared on ${result.updated}`,
      );
      setSelection(EMPTY_SELECTION);
      refresh();
    } catch {
      toast.error("Couldn't set that deadline. Try again.");
    } finally {
      setBulkPending(false);
    }
  }

  function clearFilters() {
    setSearch("");
    setStatusFilter("");
    setSourceFilter("");
    setInPlayOnly(true);
    setPage(1);
  }

  async function handleAcceptSuggestion(
    suggestion: EmailSuggestion,
    application: Application,
  ) {
    if (!suggestion.suggestedStatus) return;
    const result = await acceptStatusUpdate(
      suggestion.id,
      application.id,
      suggestion.suggestedStatus,
    );
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(`${application.company} updated`);
    refresh();
  }

  async function handleDismissSuggestion(suggestion: EmailSuggestion) {
    const result = await dismissSuggestion(suggestion.id);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    refresh();
  }

  async function handleAcceptAll() {
    setAcceptingAll(true);
    const result = await acceptAllSuggestions();
    setAcceptingAll(false);
    const { accepted, skipped } = result;
    toast.success(
      skipped > 0
        ? `Accepted ${accepted} · ${skipped} needed a closer look`
        : `Accepted ${accepted} suggestion${accepted === 1 ? "" : "s"}`,
    );
    refresh();
  }

  // Changing what is shown sends you back to page one. Done on the event
  // rather than in an effect, which would cost a second render every time.
  function withPageReset<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      setPage(1);
    };
  }

  /** Same columns whether it is everything or a selection — see `lib/csv`. */
  function downloadCsv(apps: Application[]) {
    if (apps.length === 0) {
      toast.info("No applications to export");
      return;
    }

    const blob = new Blob([buildApplicationsCsv(apps)], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = applicationsCsvFilename();
    link.click();
    URL.revokeObjectURL(url);
  }

  function handleExport() {
    downloadCsv(data.applications);
  }

  function handleBulkExport() {
    // Filtered order, not selection order: the file should read like the table.
    downloadCsv(rows.filter((row) => visible.ids.has(row.id)));
  }

  async function handleSyncGmail() {
    setIsSyncing(true);
    const result = await syncGmailEmails();
    setIsSyncing(false);

    if (result.error) {
      // An expired token is a state, not a one-off error: it earns a banner
      // that persists, and a dialog because this scan was asked for.
      if (result.code === "gmail_expired" || result.code === "gmail_disconnected") {
        setGmailExpired(true);
        setShowGmailDialog(true);
        return;
      }
      toast.error(result.error);
      return;
    }

    setGmailExpired(false);

    if (result.newSuggestions === 0) {
      // The user asked for this scan, so it gets a full answer.
      setLastScanned(result.scanned ?? 0);
      setShowNothingFound(true);
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
          <h1 className="font-heading text-title tracking-title font-semibold">
            Applications
          </h1>
          <p className="text-body text-muted-foreground mt-1.5">
            {data.stats.total} tracked · {data.stats.inPlay} in play
          </p>
        </div>

        <div className="flex items-center gap-2">
          {gmailExpired && (
            <GmailExpiredPill onClick={() => setShowGmailDialog(true)} />
          )}
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

      <MetricStrip stats={data.stats} />

      {gmailExpired && (
        <GmailExpiredBanner
          lastSyncedAt={null}
          onReconnect={() => setShowGmailDialog(true)}
        />
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
        {/* Main column */}
        <div className="space-y-3">
          <FiltersToolbar
            search={search}
            onSearchChange={withPageReset(setSearch)}
            statusFilter={statusFilter}
            onStatusFilterChange={withPageReset(setStatusFilter)}
            sourceFilter={sourceFilter}
            onSourceFilterChange={withPageReset(setSourceFilter)}
            sources={data.sources}
            inPlayOnly={inPlayOnly}
            onInPlayOnlyChange={withPageReset(setInPlayOnly)}
            density={density}
            onDensityChange={(next) => {
              setDensity(next);
              void updatePreferences({ density: next });
            }}
            selectionMode={selectionMode}
            onSelectionModeChange={handleSelectionModeChange}
            shown={rows.length}
            total={data.stats.total}
          />

          <div className={isPending ? "opacity-50 pointer-events-none transition-opacity" : "transition-opacity"}>
            <ApplicationTable
              applications={rows}
              closedCount={closedCount}
              showingClosed={!inPlayOnly}
              density={density}
              page={page}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
              onUpdate={refresh}
              filterSummary={filterSummary}
              onClearFilters={clearFilters}
              selectionMode={selectionMode}
              selection={visible}
              onToggleRow={(id, extend, orderedIds) =>
                setSelection((prev) => toggleRow(prev, orderedIds, id, extend))
              }
              onToggleAll={(select, orderedIds) =>
                setSelection((prev) => toggleAll(prev, orderedIds, select))
              }
              bulkBar={
                visible.ids.size > 0 ? (
                  <BulkActionBar
                    count={visible.ids.size}
                    pending={bulkPending}
                    onSetStage={handleBulkStage}
                    onSetDeadline={handleBulkDeadline}
                    onExport={handleBulkExport}
                    onMarkClosed={handleBulkStage}
                    onClear={() => setSelection(EMPTY_SELECTION)}
                  />
                ) : null
              }
            />
          </div>
        </div>

        {/* Sidebar: what needs a decision, then what just happened. */}
        <div className="space-y-4 lg:sticky lg:top-7 lg:self-start">
          <SuggestionsCard
            suggestions={data.suggestions}
            onReview={() => {
              if (gmailExpired) {
                setShowGmailDialog(true);
                return;
              }
              setShowReview(true);
            }}
            onAcceptAll={handleAcceptAll}
            acceptingAll={acceptingAll}
          />
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

      <ReviewSuggestionsDialog
        key={showReview ? "review-open" : "review-closed"}
        open={showReview}
        onOpenChange={setShowReview}
        suggestions={data.suggestions}
        applications={data.applications}
        onAccept={handleAcceptSuggestion}
        onDismiss={handleDismissSuggestion}
        onAcceptAll={handleAcceptAll}
        acceptingAll={acceptingAll}
        onNeedsReview={() => {
          // Anything we cannot apply on its own hands off to the fuller flow.
          setShowReview(false);
          setShowSuggestionDetail(true);
        }}
      />

      {showSuggestionDetail && data.suggestions.length > 0 && (
        <EmailSuggestionsSection
          suggestions={data.suggestions}
          applications={data.applications}
          onResolved={() => {
            setShowSuggestionDetail(false);
            refresh();
          }}
        />
      )}

      <GmailExpiredDialog
        open={showGmailDialog}
        onOpenChange={setShowGmailDialog}
        lastSyncedAt={null}
      />

      <NothingFoundDialog
        open={showNothingFound}
        onOpenChange={setShowNothingFound}
        scanned={lastScanned}
        lastSyncedAt={null}
        onAddManually={() => setShowAddForm(true)}
      />
    </div>
  );
}
