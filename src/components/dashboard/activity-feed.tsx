import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { statusLabels, type ApplicationStatusType } from "@/lib/schemas";
import {
  Plus,
  ArrowRight,
  Archive,
  ArchiveRestore,
  Mail,
} from "lucide-react";

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

function getActivityDescription(activity: ActivityItem): string {
  const company = activity.application?.company ?? "Unknown";
  const role = activity.application?.roleTitle ?? "";

  const details = activity.details as Record<
    string,
    { from?: string; to?: string }
  > | null;

  switch (activity.action) {
    case "created":
      return `Added ${company} — ${role}`;
    case "updated": {
      if (details?.status) {
        const from =
          statusLabels[details.status.from as ApplicationStatusType] ??
          details.status.from;
        const to =
          statusLabels[details.status.to as ApplicationStatusType] ??
          details.status.to;
        return `${company}: ${from} → ${to}`;
      }
      return `Updated ${company} — ${role}`;
    }
    case "archived":
      return `Archived ${company} — ${role}`;
    case "unarchived":
      return `Unarchived ${company} — ${role}`;
    default:
      return `${activity.action} — ${company}`;
  }
}

function timeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(date).toLocaleDateString();
}

export function ActivityFeed({ activities }: ActivityFeedProps) {
  if (activities.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No activity yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {activities.map((activity) => {
          const Icon = getActivityIcon(activity.action, activity.source);
          return (
            <div key={activity.id} className="flex items-start gap-3">
              <div className="mt-0.5 rounded-full bg-muted p-1.5">
                <Icon className="h-3 w-3 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">
                  {getActivityDescription(activity)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {timeAgo(activity.createdAt)}
                  {activity.source === "email_suggestion" && " · via email"}
                </p>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
