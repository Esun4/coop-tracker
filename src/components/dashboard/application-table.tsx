"use client";

import { useState } from "react";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MoreHorizontal,
  Pencil,
  Archive,
  Trash2,
  ArchiveRestore,
  ChevronRight,
  ChevronLeft,
  Inbox,
} from "lucide-react";
import { applicationStatuses, type ApplicationStatusType } from "@/lib/schemas";
import {
  GROUP_DOT,
  GROUP_LABEL,
  OPEN_GROUPS,
  stageGroup,
  type StageGroup,
} from "@/lib/stage";
import { StageChip, StageMeter } from "@/components/ui/stage-indicator";
import { Monogram } from "@/components/ui/monogram";
import {
  archiveApplication,
  deleteApplication,
  updateApplicationStatus,
} from "@/lib/actions/applications";
import { Button } from "@/components/ui/button";
import { ApplicationForm } from "./application-form";
import { toast } from "sonner";
import type { Application } from "@/generated/prisma/client";
import { TABLE_COLS, TABLE_HEADINGS } from "./table-layout";

export type Density = "compact" | "comfortable";

interface ApplicationTableProps {
  applications: Application[];
  /** Everything tracked, closed included — drives the collapsed closed row. */
  closedCount: { rejected: number; withdrawn: number };
  showingClosed: boolean;
  density: Density;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onUpdate?: () => void;
  /** Present only when a filter is what emptied the table. */
  filterSummary?: { description: string; totalWithout: number | null } | null;
  onClearFilters?: () => void;
}

const ROW_PAD: Record<Density, string> = {
  compact: "py-[11px]",
  comfortable: "py-[15px]",
};

function relativeDay(date: Date | null): string {
  if (!date) return "—";
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days <= 0) {
    const hours = Math.floor((Date.now() - date.getTime()) / 3_600_000);
    return hours <= 0 ? "just now" : `${hours}h ago`;
  }
  return `${days}d ago`;
}

function InlineStatusSelect({
  application,
  onUpdate,
}: {
  application: Application;
  onUpdate?: () => void;
}) {
  const [loading, setLoading] = useState(false);

  async function handleStatusChange(newStatus: string) {
    if (newStatus === application.status) return;
    setLoading(true);
    const result = await updateApplicationStatus(application.id, newStatus);
    setLoading(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    onUpdate?.();
  }

  const status = application.status as ApplicationStatusType;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            className="inline-flex items-center gap-[9px] transition-opacity hover:opacity-80"
            disabled={loading}
          >
            {loading ? (
              <span className="text-micro text-muted-foreground">…</span>
            ) : (
              <StageChip status={status} />
            )}
            <StageMeter status={status} />
          </button>
        }
      />
      <DropdownMenuContent>
        {applicationStatuses.map((s) => (
          <DropdownMenuItem
            key={s}
            onClick={() => handleStatusChange(s)}
            className={application.status === s ? "font-semibold" : ""}
          >
            <StageChip status={s} />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ApplicationTable({
  applications,
  closedCount,
  showingClosed,
  density,
  page,
  pageSize,
  onPageChange,
  onUpdate,
  filterSummary,
  onClearFilters,
}: ApplicationTableProps) {
  const [editApp, setEditApp] = useState<Application | null>(null);

  async function handleArchive(id: string) {
    const result = await archiveApplication(id);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Application updated");
      onUpdate?.();
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this application?")) return;
    const result = await deleteApplication(id);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Application deleted");
      onUpdate?.();
    }
  }

  if (applications.length === 0) {
    // An empty table caused by a filter is a different problem from an empty
    // account: say which filter produced nothing, and how much is behind it.
    if (filterSummary) {
      return (
        <div className="bg-card border-border rounded-xl border px-5 py-[26px] text-center">
          <p className="text-body font-emphasis">
            No applications match {filterSummary.description}
          </p>
          {filterSummary.totalWithout != null && (
            <p className="text-meta text-muted-foreground mt-1.5">
              You have {filterSummary.totalWithout} tracked without that filter.
            </p>
          )}
          <Button
            variant="outline"
            size="sm"
            className="mt-3.5"
            onClick={onClearFilters}
          >
            Clear filters
          </Button>
        </div>
      );
    }

    return (
      <div className="bg-card border-border flex flex-col items-center rounded-xl border py-16 text-center">
        <div className="bg-secondary text-muted-foreground mb-3 flex size-10 items-center justify-center rounded-full">
          <Inbox className="size-5" />
        </div>
        <p className="font-heading text-muted-foreground mb-1 text-lg">
          No applications yet
        </p>
        <p className="text-meta text-muted-foreground">
          Add your first application to get started
        </p>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(applications.length / pageSize));
  const current = Math.min(Math.max(1, page), totalPages);
  const start = (current - 1) * pageSize;
  const visible = applications.slice(start, start + pageSize);

  // Grouped by whose move it is next, within the current page.
  const groups: { group: StageGroup; rows: Application[] }[] = OPEN_GROUPS.map(
    (group) => ({
      group: group as StageGroup,
      rows: visible.filter(
        (a) => stageGroup(a.status as ApplicationStatusType) === group,
      ),
    }),
  ).filter((g) => g.rows.length > 0);

  const closedRows = visible.filter(
    (a) => stageGroup(a.status as ApplicationStatusType) === "closed",
  );
  if (closedRows.length > 0) {
    groups.push({ group: "closed", rows: closedRows });
  }

  const hiddenClosed = closedCount.rejected + closedCount.withdrawn;

  return (
    <>
      <div className="bg-card border-border overflow-hidden rounded-xl border">
        {/* Column headers are chrome: they paint before any data arrives. */}
        <div className={`${TABLE_COLS} bg-sunken border-border border-b py-[9px]`}>
          {TABLE_HEADINGS.map(
            (label) => (
              <span
                key={label}
                className="text-label text-muted-foreground tracking-column font-medium uppercase"
              >
                {label}
              </span>
            ),
          )}
          <span />
        </div>

        {groups.map(({ group, rows }) => (
          <div key={group}>
            <div className="bg-sunken border-border flex items-center gap-[9px] border-b px-[18px] py-[7px]">
              <span
                className={`size-[5px] rounded-full ${GROUP_DOT[group]}`}
                aria-hidden
              />
              <span className="text-micro font-semibold">
                {GROUP_LABEL[group]}
              </span>
              <span className="text-micro text-muted-foreground">
                {rows.length}
              </span>
            </div>

            {rows.map((app) => (
              <div
                key={app.id}
                className={`ledger-row ${TABLE_COLS} border-border-subtle items-center border-b ${ROW_PAD[density]} ${
                  app.archived ? "opacity-50" : ""
                }`}
              >
                <span className="flex min-w-0 items-center gap-[11px] pr-3">
                  <Monogram name={app.company} />
                  <span className="min-w-0">
                    <Link
                      href={`/dashboard/applications/${app.id}`}
                      className="text-body font-emphasis block truncate hover:underline"
                    >
                      {app.company}
                    </Link>
                    <span className="text-caption text-muted-foreground mt-px block truncate">
                      {app.roleTitle}
                    </span>
                  </span>
                </span>

                <span>
                  <InlineStatusSelect application={app} onUpdate={onUpdate} />
                </span>

                <span className="text-meta text-muted-foreground">
                  {relativeDay(app.updatedAt)}
                </span>

                <span className="text-meta text-muted-foreground truncate pr-2">
                  {app.location || "—"}
                </span>

                <span className="text-meta text-muted-foreground truncate">
                  {app.source || "—"}
                </span>

                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <button
                        className="text-muted-foreground hover:text-foreground flex justify-end transition-colors"
                        aria-label={`Actions for ${app.company}`}
                      >
                        <MoreHorizontal className="size-[15px]" />
                      </button>
                    }
                  />
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setEditApp(app)}>
                      <Pencil className="mr-2 size-3.5" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleArchive(app.id)}>
                      {app.archived ? (
                        <>
                          <ArchiveRestore className="mr-2 size-3.5" />
                          Unarchive
                        </>
                      ) : (
                        <>
                          <Archive className="mr-2 size-3.5" />
                          Archive
                        </>
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => handleDelete(app.id)}
                    >
                      <Trash2 className="mr-2 size-3.5" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        ))}

        {/* Closed is stated rather than silently filtered away. */}
        {!showingClosed && hiddenClosed > 0 && (
          <div className="bg-sunken border-border-subtle flex items-center gap-[9px] border-b px-[18px] py-[9px]">
            <ChevronRight className="text-muted-foreground size-[13px]" />
            <span className="text-micro text-muted-foreground font-semibold">
              Closed
            </span>
            <span className="text-micro text-muted-foreground">
              {hiddenClosed} hidden by the “In play” filter — {closedCount.rejected}{" "}
              rejected, {closedCount.withdrawn} withdrawn
            </span>
          </div>
        )}

        <div className="text-meta text-muted-foreground flex items-center justify-between px-[18px] py-[11px]">
          <span>
            Showing {start + 1}–{start + visible.length} of {applications.length}
            {!showingClosed && " in play"}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              className="border-border flex size-[26px] items-center justify-center rounded-md border disabled:opacity-45"
              disabled={current <= 1}
              onClick={() => onPageChange(current - 1)}
              aria-label="Previous page"
            >
              <ChevronLeft className="size-[13px]" />
            </button>
            <button
              className="border-border flex size-[26px] items-center justify-center rounded-md border disabled:opacity-45"
              disabled={current >= totalPages}
              onClick={() => onPageChange(current + 1)}
              aria-label="Next page"
            >
              <ChevronRight className="size-[13px]" />
            </button>
          </div>
        </div>
      </div>

      <ApplicationForm
        open={!!editApp}
        onOpenChange={(open) => {
          if (!open) setEditApp(null);
        }}
        application={editApp}
        onSuccess={onUpdate}
      />
    </>
  );
}
