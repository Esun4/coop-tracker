import { applicationStatuses, statusLabels } from "@/lib/schemas";
import { isInPlay, stageDepth } from "@/lib/stage";
import type { getStats } from "@/lib/actions/applications";

/**
 * One strip, not four equal cards.
 *
 * "Total tracked" was the least actionable number at the largest size. What a
 * job seeker actually wants is how many are live, and what share of everything
 * sent came back — so In play leads, and response rate and interview rate take
 * the right-hand cells. No coloured dots: the only colour here is the ramp in
 * the composition bar and the offer count.
 */

type Stats = Awaited<ReturnType<typeof getStats>>;

/** Ordered Applied → Offer so the bar reads as pipeline depth, left to right. */
const RAMP_FILL = [
  "fill-stage-1",
  "fill-stage-2",
  "fill-stage-3",
  "fill-stage-4",
  "fill-stage-5",
];

function Metric({
  label,
  value,
  suffix,
  denominator,
  accent = false,
}: {
  label: string;
  value: string | number;
  suffix?: string;
  denominator: string;
  accent?: boolean;
}) {
  return (
    <div>
      <p className="text-label text-muted-foreground font-medium tracking-label uppercase">
        {label}
      </p>
      <p
        className={`mt-2 text-[26px] leading-none font-semibold tracking-title ${
          accent ? "text-primary" : ""
        }`}
      >
        {value}
        {suffix && (
          <span className="text-muted-foreground text-base font-medium">
            {suffix}
          </span>
        )}
      </p>
      <p className="text-caption text-muted-foreground mt-[7px]">
        {denominator}
      </p>
    </div>
  );
}

export function MetricStrip({ stats }: { stats: Stats }) {
  const inPlayStages = applicationStatuses
    .filter((s) => isInPlay(s))
    .sort((a, b) => stageDepth(a) - stageDepth(b))
    .map((status) => ({ status, count: stats.byStatus[status] || 0 }));

  const pct = (n: number) => (stats.total > 0 ? (n / stats.total) * 100 : 0);

  return (
    <div className="bg-card border-border flex items-stretch rounded-xl border px-[26px] py-[22px]">
      <div className="shrink-0 pr-[34px]">
        <p className="text-label text-muted-foreground font-medium tracking-label uppercase">
          In play
        </p>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-metric font-semibold tracking-metric">
            {stats.inPlay}
          </span>
          <span className="text-body text-muted-foreground">
            of {stats.total} tracked
          </span>
        </div>

        {/* Composition of what is live, against everything ever sent — the
            unfilled remainder of the track is the closed pile. Drawn as SVG
            because the widths are data, and a percentage width cannot be a
            static utility class. */}
        <svg
          aria-hidden
          viewBox="0 0 100 6"
          preserveAspectRatio="none"
          className="mt-[14px] h-1.5 w-[260px] overflow-hidden rounded-full"
        >
          <rect x="0" y="0" width="100" height="6" className="fill-secondary" />
          {inPlayStages.reduce<{ x: number; bars: React.ReactNode[] }>(
            (acc, { status, count }, i) => {
              const w = pct(count);
              acc.bars.push(
                <rect
                  key={status}
                  x={acc.x}
                  y="0"
                  width={w}
                  height="6"
                  className={RAMP_FILL[i]}
                />,
              );
              acc.x += w;
              return acc;
            },
            { x: 0, bars: [] },
          ).bars}
        </svg>

        <p className="text-caption text-muted-foreground mt-[9px]">
          {inPlayStages
            .map(({ status, count }) =>
              `${count} ${statusLabels[status].toLowerCase()}`,
            )
            .join(" · ")}
        </p>
      </div>

      <div className="bg-border w-px" />

      <div className="flex flex-1 gap-11 pl-[34px]">
        <Metric
          label="Response rate"
          value={Math.round(stats.responseRate * 100)}
          suffix="%"
          denominator={`${stats.replied} of ${stats.total} replied`}
        />
        <Metric
          label="Interview rate"
          value={Math.round(stats.interviewRate * 100)}
          suffix="%"
          denominator={`${stats.interviews} reached interview`}
        />
        <Metric
          label="Offers"
          value={stats.offers}
          denominator={
            stats.offerCompanies.length > 0
              ? stats.offerCompanies.join(", ")
              : "none yet"
          }
          accent={stats.offers > 0}
        />

        {stats.medianReplyDays != null && (
          <div className="ml-auto self-center text-right">
            <p className="text-caption text-muted-foreground">
              Median reply time
            </p>
            <p className="mt-1 text-[15px] font-medium">
              {stats.medianReplyDays} day{stats.medianReplyDays === 1 ? "" : "s"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
