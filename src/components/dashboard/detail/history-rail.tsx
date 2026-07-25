import { statusLabels, type ApplicationStatusType } from "@/lib/schemas";
import type { ActivityLog } from "@/generated/prisma/client";

/**
 * What happened, in order, and where each event came from.
 *
 * Because the app reads your mail, an event that moved a stage quotes the
 * sentence it was inferred from and names the sender. That is the difference
 * between a stage you can audit and one you simply have to trust.
 */

type EmailProvenance = { sender?: string; snippet?: string; date?: string };

type Details = {
  status?: { from?: string; to?: string };
  email?: EmailProvenance;
  deadline?: string | null;
  company?: string;
};

function readDetails(log: ActivityLog): Details {
  return (log.details ?? {}) as Details;
}

function describe(log: ActivityLog): { title: string; note?: string } {
  const details = readDetails(log);
  const fromEmail = log.source === "email_suggestion";

  if (log.action === "created") {
    return {
      title: "Applied",
      note: fromEmail ? "detected from a confirmation email" : "added by you",
    };
  }

  if (details.status?.to) {
    const label =
      statusLabels[details.status.to as ApplicationStatusType] ??
      details.status.to;
    return {
      title: `Moved to ${label}`,
      note: fromEmail ? "accepted from email" : "changed by you",
    };
  }

  if ("deadline" in details) {
    return {
      title: details.deadline ? "Deadline set" : "Deadline cleared",
    };
  }

  if (log.action === "archived") return { title: "Archived" };
  if (log.action === "unarchived") return { title: "Unarchived" };

  return { title: "Updated" };
}

function shortDate(date: Date) {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function HistoryRail({ logs }: { logs: ActivityLog[] }) {
  const fromEmail = logs.filter((l) => l.source === "email_suggestion").length;

  return (
    <div className="bg-card border-border overflow-hidden rounded-xl border">
      <div className="border-border-subtle flex items-center justify-between border-b px-5 py-3.5">
        <h3 className="text-label text-muted-foreground tracking-label font-semibold uppercase">
          History
        </h3>
        <span className="text-caption text-muted-foreground">
          {logs.length} event{logs.length === 1 ? "" : "s"}
          {fromEmail > 0 && ` · ${fromEmail} from email`}
        </span>
      </div>

      <div className="px-5 pt-1.5 pb-3.5">
        {logs.length === 0 && (
          <p className="text-meta text-muted-foreground py-3">
            Nothing has happened yet.
          </p>
        )}

        {logs.map((log, i) => {
          const { title, note } = describe(log);
          const email = readDetails(log).email;

          return (
            <div
              key={log.id}
              className={`grid grid-cols-[62px_1fr] gap-3.5 py-3.5 ${
                i < logs.length - 1 ? "border-border-subtle border-b" : ""
              }`}
            >
              <span className="text-micro text-muted-foreground pt-0.5 font-mono">
                {shortDate(log.createdAt)}
              </span>

              <div>
                <p className="text-body">
                  <span className="font-semibold">{title}</span>
                  {note && (
                    <span className="text-muted-foreground"> · {note}</span>
                  )}
                </p>

                {email?.snippet && (
                  <div className="border-stage-2 mt-2 border-l-2 py-0.5 pl-3">
                    <p className="text-caption text-muted-foreground">
                      {email.sender}
                      {email.date &&
                        ` · ${new Date(email.date).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}`}
                    </p>
                    <p className="text-meta text-foreground-2 mt-1.5 leading-relaxed">
                      “{email.snippet}”
                    </p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
