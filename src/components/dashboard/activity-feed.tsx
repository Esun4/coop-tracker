import { statusLabels, type ApplicationStatusType } from "@/lib/schemas";
import { Plus, ArrowRight, Archive, ArchiveRestore, Mail } from "lucide-react";

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

export function ActivityFeed({ activities }: ActivityFeedProps) {
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

              return (
                <div
                  key={activity.id}
                  className="flex items-start gap-3 py-2.5 animate-fade-up"
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
                        {activity.source === "email_suggestion" && " · email"}
                      </p>
                    )}
                  </div>

                  {/* Timestamp */}
                  <span className="font-mono text-xs shrink-0 pt-0.5 text-muted-foreground">
                    {timeAgo(activity.createdAt)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
