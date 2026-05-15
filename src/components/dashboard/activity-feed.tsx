"use client";

import { useState } from "react";
import { statusLabels, type ApplicationStatusType } from "@/lib/schemas";
import { Plus, ArrowRight, Archive, ArchiveRestore, Mail, MoreHorizontal, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { undoEmailSuggestion } from "@/lib/actions/suggestions";

interface ActivityItem {
  id: string;
  action: string;
  details: unknown;
  source: string;
  createdAt: Date;
  application: {
    company: string;
    roleTitle: string;
  } | null;
}

interface ActivityFeedProps {
  activities: ActivityItem[];
  onResolved: () => void;
}

function getActivityIcon(action: string, source: string) {
  if (source === "email_suggestion") return Mail;
  if (action === "created") return Plus;
  if (action === "archived") return Archive;
  if (action === "unarchived") return ArchiveRestore;
  return ArrowRight;
}

function getActivityDescription(activity: ActivityItem): { primary: string; secondary?: string } {
  const company = activity.application?.company ?? "Unknown";
  const role = activity.application?.roleTitle ?? "";
  const details = activity.details as Record<string, { from?: string; to?: string }> | null;

  switch (activity.action) {
    case "created":
      return { primary: company, secondary: `Added · ${role}` };
    case "updated": {
      if (details?.status) {
        const from = statusLabels[details.status.from as ApplicationStatusType] ?? details.status.from;
        const to = statusLabels[details.status.to as ApplicationStatusType] ?? details.status.to;
        return { primary: company, secondary: `${from} → ${to}` };
      }
      return { primary: company, secondary: "Updated" };
    }
    case "archived":
      return { primary: company, secondary: "Archived" };
    case "unarchived":
      return { primary: company, secondary: "Unarchived" };
    default:
      return { primary: company };
  }
}

function timeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "now";
  if (diffMins < 60) return `${diffMins}m`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d`;
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getIconColor(action: string, source: string): string {
  if (source === "email_suggestion") return "#1D4ED8";
  if (action === "created") return "#065F46";
  if (action === "archived") return "#6B7280";
  if (action === "unarchived") return "#B45309";
  return "#374151";
}

function ActivityItemMenu({
  activityId,
  onResolved,
}: {
  activityId: string;
  onResolved: () => void;
}) {
  const [loading, setLoading] = useState(false);

  async function handleUndo() {
    setLoading(true);
    const result = await undoEmailSuggestion(activityId);
    setLoading(false);
    if ("error" in result && result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Action undone — suggestion restored to queue");
    onResolved();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 opacity-0 group-hover/activity-row:opacity-100 transition-opacity shrink-0"
            disabled={loading}
            aria-label="Options"
          />
        }
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="left" align="start">
        <DropdownMenuItem onClick={handleUndo} disabled={loading}>
          <Undo2 className="h-3.5 w-3.5" />
          Undo
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ActivityFeed({ activities, onResolved }: ActivityFeedProps) {
  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b">
        <h3 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Recent Activity
        </h3>
      </div>

      {/* Feed */}
      <div className="px-4 py-3">
        {activities.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No activity yet
          </p>
        ) : (
          <div className="relative space-y-0">
            {/* Connecting line */}
            <div className="absolute left-[13px] top-3 bottom-3 w-px bg-border" />

            {activities.map((activity, i) => {
              const Icon = getActivityIcon(activity.action, activity.source);
              const iconColor = getIconColor(activity.action, activity.source);
              const desc = getActivityDescription(activity);
              const isEmailSuggestion = activity.source === "email_suggestion";

              return (
                <div
                  key={activity.id}
                  className="group/activity-row flex items-start gap-3 py-2.5 animate-fade-up"
                  style={{ animationDelay: `${i * 40}ms` }}
                >
                  {/* Icon dot */}
                  <div
                    className="relative z-10 flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-background border"
                  >
                    <Icon className="h-3 w-3" style={{ color: iconColor }} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 pt-0.5">
                    <p className="text-sm font-medium truncate leading-tight text-foreground">
                      {desc.primary}
                    </p>
                    {desc.secondary && (
                      <p className="text-xs truncate leading-tight mt-0.5 text-muted-foreground">
                        {desc.secondary}
                        {isEmailSuggestion && " · email"}
                      </p>
                    )}
                  </div>

                  {/* Timestamp + 3-dot menu */}
                  <div className="flex items-center gap-1 shrink-0 pt-0.5">
                    <span className="font-mono text-xs text-muted-foreground">
                      {timeAgo(activity.createdAt)}
                    </span>
                    {isEmailSuggestion && (
                      <ActivityItemMenu
                        activityId={activity.id}
                        onResolved={onResolved}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
