"use client";

import { useState } from "react";
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
  ArrowUpDown,
  ArchiveRestore,
  ChevronUp,
  ChevronDown,
  Inbox,
} from "lucide-react";
import {
  applicationStatuses,
  type ApplicationStatusType,
} from "@/lib/schemas";
import { StageChip, StageMeter } from "@/components/ui/stage-indicator";
import { Monogram } from "@/components/ui/monogram";
import {
  archiveApplication,
  deleteApplication,
  updateApplicationStatus,
} from "@/lib/actions/applications";
import { ApplicationForm } from "./application-form";
import { toast } from "sonner";
import type { Application } from "@/generated/prisma/client";

interface ApplicationTableProps {
  applications: Application[];
  sortBy: string;
  sortOrder: "asc" | "desc";
  onSort: (column: string) => void;
  onUpdate?: () => void;
}

const GRID_COLS =
  "[grid-template-columns:1.25fr_1.3fr_118px_76px_110px_96px_40px]";

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
  sortBy,
  sortOrder,
  onSort,
  onUpdate,
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

  function SortHeader({ column, children }: { column: string; children: React.ReactNode }) {
    const active = sortBy === column;
    return (
      <button
        className={`flex items-center gap-1 text-xs font-medium uppercase tracking-[0.08em] transition-colors ${
          active
            ? "text-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`}
        onClick={() => onSort(column)}
      >
        {children}
        {active ? (
          sortOrder === "asc" ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-30" />
        )}
      </button>
    );
  }

  if (applications.length === 0) {
    return (
      <div className="flex flex-col items-center rounded-xl border bg-card py-16 text-center shadow-xs">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Inbox className="h-5 w-5" />
        </div>
        <p className="font-heading text-lg mb-1 text-muted-foreground">
          No applications yet
        </p>
        <p className="text-sm text-muted-foreground/70">
          Add your first application to get started
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-xl border bg-card overflow-hidden shadow-xs">
        {/* Header */}
        <div className={`grid px-4 py-2.5 bg-muted/50 border-b ${GRID_COLS}`}>
          <SortHeader column="company">Company</SortHeader>
          <SortHeader column="roleTitle">Role</SortHeader>
          <SortHeader column="status">Status</SortHeader>
          <SortHeader column="applicationDate">Date</SortHeader>
          <span className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Location
          </span>
          <span className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Source
          </span>
          <span />
        </div>

        {/* Rows */}
        <div>
          {applications.map((app) => (
            <div
              key={app.id}
              className={`ledger-row grid items-center px-4 py-3 border-b border-border/60 last:border-0 ${GRID_COLS} ${
                app.archived ? "opacity-50" : ""
              }`}
            >
              <span className="flex items-center gap-2.5 pr-2 min-w-0">
                <Monogram name={app.company} />
                <span className="text-sm font-medium truncate text-foreground">
                  {app.company}
                </span>
                {app.archived && (
                  <span className="shrink-0 rounded border px-1 py-px text-[10px] uppercase tracking-wide text-muted-foreground">
                    Archived
                  </span>
                )}
              </span>
              <span className="text-sm truncate pr-2 text-muted-foreground">
                {app.roleTitle}
              </span>
              <span>
                <InlineStatusSelect application={app} onUpdate={onUpdate} />
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                {app.applicationDate
                  ? new Date(app.applicationDate).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })
                  : "—"}
              </span>
              <span className="text-xs truncate pr-2 text-muted-foreground">
                {app.location || "—"}
              </span>
              <span className="text-xs truncate text-muted-foreground">
                {app.source || "—"}
              </span>

              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <button className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  }
                />
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setEditApp(app)}>
                    <Pencil className="mr-2 h-3.5 w-3.5" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleArchive(app.id)}>
                    {app.archived ? (
                      <>
                        <ArchiveRestore className="mr-2 h-3.5 w-3.5" />
                        Unarchive
                      </>
                    ) : (
                      <>
                        <Archive className="mr-2 h-3.5 w-3.5" />
                        Archive
                      </>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => handleDelete(app.id)}
                  >
                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
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
