import {
  getLadder,
  getSourceBreakdown,
  getStats,
} from "@/lib/actions/applications";
import { statusLabels, applicationStatuses } from "@/lib/schemas";
import { isInPlay, stageDepth } from "@/lib/stage";

/**
 * Insights.
 *
 * The old funnel SVG and donut described the same applications twice and told
 * you nothing to do differently. A ladder with step conversion beside it shows
 * where you actually lose people; the source table is the only view here that
 * changes behaviour, so it earns its place.
 *
 * Bars are SVG rather than percentage-width divs — the widths are data, and a
 * data-driven width cannot be a static utility class.
 */

const LADDER_ORDER = ["APPLIED", "OA", "INTERVIEW", "FINAL_ROUND", "OFFER"] as const;

const LADDER_FILL = [
  "fill-stage-1",
  "fill-stage-2",
  "fill-stage-3",
  "fill-stage-4",
  "fill-stage-5",
];

const RAMP_BG = [
  "bg-stage-1",
  "bg-stage-2",
  "bg-stage-3",
  "bg-stage-4",
  "bg-stage-5",
];

function Bar({ pct, fill }: { pct: number; fill: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 100 22"
      preserveAspectRatio="none"
      className="h-[22px] w-full"
    >
      {/* A hair of width, so a non-zero count is never invisible. */}
      <rect
        x="0"
        y="0"
        width={pct > 0 ? Math.max(pct, 1.2) : 0}
        height="22"
        rx="1"
        className={fill}
      />
    </svg>
  );
}

export default async function InsightsPage() {
  const [ladder, sources, stats] = await Promise.all([
    getLadder(),
    getSourceBreakdown(),
    getStats(),
  ]);

  const applied = ladder.APPLIED || 0;

  const rungs = LADDER_ORDER.map((stage, i) => {
    const count = ladder[stage] || 0;
    const previous = i === 0 ? null : ladder[LADDER_ORDER[i - 1]] || 0;
    return {
      stage,
      count,
      fill: LADDER_FILL[i],
      pct: applied > 0 ? (count / applied) * 100 : 0,
      conversion:
        i === 0
          ? `${stats.replied} replied · ${Math.round(stats.responseRate * 100)}%`
          : previous && previous > 0
            ? `${Math.round((count / previous) * 100)}% of ${statusLabels[
                LADDER_ORDER[i - 1]
              ].toLowerCase()}`
            : "—",
    };
  });

  const standing = applicationStatuses
    .filter(isInPlay)
    .sort((a, b) => stageDepth(a) - stageDepth(b))
    .map((status, i) => ({
      status,
      count: stats.byStatus[status] || 0,
      swatch: RAMP_BG[i],
    }));

  const closedRows = [
    {
      status: "REJECTED" as const,
      count: stats.byStatus.REJECTED || 0,
      swatch: "bg-stage-off",
    },
    {
      status: "WITHDRAWN" as const,
      count: stats.byStatus.WITHDRAWN || 0,
      swatch: "bg-border-subtle",
    },
  ];

  return (
    <div className="flex flex-col gap-[22px]">
      <div>
        <h1 className="font-heading text-title tracking-title font-semibold">
          Insights
        </h1>
        <p className="text-body text-muted-foreground mt-1.5">
          {stats.total} application{stats.total === 1 ? "" : "s"} ·{" "}
          {stats.inPlay} still in play
        </p>
      </div>

      <section className="bg-card border-border rounded-xl border px-[26px] py-6">
        <div className="flex items-baseline justify-between">
          <h2 className="text-label text-muted-foreground tracking-label font-semibold uppercase">
            Stage ladder
          </h2>
          <span className="text-caption text-muted-foreground">
            Furthest stage each application reached
          </span>
        </div>

        <div className="mt-5 flex flex-col gap-[11px]">
          {rungs.map(({ stage, count, pct, fill, conversion }) => (
            <div
              key={stage}
              className="grid grid-cols-[120px_1fr_54px_150px] items-center gap-4"
            >
              <span className="text-meta font-emphasis">
                {statusLabels[stage]}
              </span>
              <Bar pct={pct} fill={fill} />
              <span className="text-right text-sm font-semibold">{count}</span>
              <span className="text-caption text-muted-foreground">
                {conversion}
              </span>
            </div>
          ))}
        </div>
      </section>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <section className="bg-card border-border rounded-xl border px-[26px] py-6">
          <h2 className="text-label text-muted-foreground tracking-label font-semibold uppercase">
            Where all {stats.total} stand
          </h2>

          <div className="mt-[18px] grid grid-cols-2 gap-x-6 gap-y-2">
            {[...standing, ...closedRows].map(({ status, count, swatch }) => (
              <span
                key={status}
                className="text-meta text-foreground-2 flex items-center gap-2.5"
              >
                <span className={`size-[9px] rounded-[3px] ${swatch}`} />
                {statusLabels[status]}
                <span className="text-muted-foreground ml-auto">{count}</span>
              </span>
            ))}
          </div>

          <p className="text-meta text-muted-foreground border-border-subtle mt-[18px] border-t pt-3.5">
            {stats.inPlay} in play · {stats.closed} closed
          </p>
        </section>

        <section className="bg-card border-border overflow-hidden rounded-xl border">
          <div className="px-[26px] pt-5 pb-3.5">
            <h2 className="text-label text-muted-foreground tracking-label font-semibold uppercase">
              By source
            </h2>
          </div>

          <div className="text-label text-muted-foreground grid grid-cols-[1.4fr_52px_62px_72px_52px] gap-2 px-[26px] pb-2">
            <span>Source</span>
            <span className="text-right">Sent</span>
            <span className="text-right">Replied</span>
            <span className="text-right">Interview</span>
            <span className="text-right">Offer</span>
          </div>

          {sources.length === 0 && (
            <p className="text-meta text-muted-foreground px-[26px] pb-5">
              No applications yet.
            </p>
          )}

          {sources.map((row) => {
            const repliedPct =
              row.sent > 0 ? Math.round((row.replied / row.sent) * 100) : 0;
            return (
              <div
                key={row.source}
                className="border-border-subtle grid grid-cols-[1.4fr_52px_62px_72px_52px] items-center gap-2 border-t px-[26px] py-2.5"
              >
                <span className="text-meta font-emphasis truncate">
                  {row.source}
                </span>
                <span className="text-meta text-foreground-2 text-right">
                  {row.sent}
                </span>
                <span
                  className={`text-meta text-right ${
                    repliedPct >= 60
                      ? "text-primary font-semibold"
                      : "text-foreground-2"
                  }`}
                >
                  {repliedPct}%
                </span>
                <span className="text-meta text-foreground-2 text-right">
                  {row.interviewed}
                </span>
                <span
                  className={`text-meta text-right ${
                    row.offered > 0
                      ? "text-primary font-semibold"
                      : "text-muted-foreground"
                  }`}
                >
                  {row.offered}
                </span>
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
}
