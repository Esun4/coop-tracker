import { statusLabels, type ApplicationStatusType } from "@/lib/schemas";
import { stageDepth } from "@/lib/stage";

/**
 * The five-step ladder with dates on what has been cleared.
 *
 * Cleared stages get a filled dot and the day it happened; stages ahead are
 * hollow, and the next one carries a hint drawn from how long this user's own
 * applications have taken to get there. Closed applications never reach here —
 * the detail view is only for live records.
 */

const LADDER: ApplicationStatusType[] = [
  "APPLIED",
  "OA",
  "INTERVIEW",
  "FINAL_ROUND",
  "OFFER",
];

function shortDate(date: Date) {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function StageStepper({
  status,
  clearedAt,
  intervals,
}: {
  status: ApplicationStatusType;
  /** Status → when it was first reached. */
  clearedAt: Partial<Record<ApplicationStatusType, Date>>;
  intervals: Record<string, number>;
}) {
  const depth = stageDepth(status);

  return (
    <div className="bg-card border-border rounded-xl border px-6 py-5">
      <div className="grid grid-cols-5">
        {LADDER.map((step, i) => {
          const stepDepth = i + 1;
          const cleared = stepDepth <= depth;
          const isCurrent = stepDepth === depth;
          const isNext = stepDepth === depth + 1;
          const date = clearedAt[step];
          const hint = intervals[step];

          return (
            <div key={step} className={i < LADDER.length - 1 ? "pr-3.5" : ""}>
              <div className="flex items-center gap-2">
                <span
                  className={
                    cleared
                      ? "bg-stage-5 size-2 rounded-full"
                      : "border-border size-2 rounded-full border-[1.5px]"
                  }
                  aria-hidden
                />
                {i < LADDER.length - 1 && (
                  <span
                    className={`h-0.5 flex-1 ${
                      stepDepth < depth ? "bg-stage-3" : "bg-stage-off"
                    }`}
                    aria-hidden
                  />
                )}
              </div>

              <p
                className={`text-meta mt-2.5 ${
                  cleared ? "font-semibold" : "text-muted-foreground"
                }`}
              >
                {statusLabels[step]}
              </p>

              {date && (
                <p className="text-micro text-muted-foreground font-mono mt-[3px]">
                  {shortDate(date)}
                  {isCurrent && " · now"}
                </p>
              )}
              {!date && isNext && hint != null && (
                <p className="text-micro text-muted-foreground mt-[3px] opacity-70">
                  typically {hint}d after
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
