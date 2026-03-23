"use client";

import type { Application } from "@/generated/prisma/client";

const FLOW_ORDER = [
  {
    key: "REJECTED",
    label: "Rejected",
    fill: "rgba(239,68,68,0.35)",
    cap: "rgba(239,68,68,0.85)",
  },
  {
    key: "WITHDRAWN",
    label: "Withdrawn",
    fill: "rgba(156,163,175,0.35)",
    cap: "rgba(156,163,175,0.85)",
  },
  {
    key: "APPLIED",
    label: "Pending",
    fill: "rgba(99,102,241,0.35)",
    cap: "rgba(99,102,241,0.85)",
  },
  {
    key: "OA",
    label: "Online Assessment",
    fill: "rgba(234,179,8,0.45)",
    cap: "rgba(234,179,8,0.9)",
  },
  {
    key: "INTERVIEW",
    label: "Interview",
    fill: "rgba(168,85,247,0.35)",
    cap: "rgba(168,85,247,0.85)",
  },
  {
    key: "FINAL_ROUND",
    label: "Final Round",
    fill: "rgba(249,115,22,0.35)",
    cap: "rgba(249,115,22,0.85)",
  },
  {
    key: "OFFER",
    label: "Offer",
    fill: "rgba(34,197,94,0.45)",
    cap: "rgba(34,197,94,0.9)",
  },
];

const SRC_X = 140;
const SRC_W = 18;
const TGT_X = 490;
const TGT_W = 14;
const CHART_TOP = 20;
const GAP = 5;
const MIN_H = 5;

export function FunnelChart({ applications }: { applications: Application[] }) {
  const active = applications.filter((a) => !a.archived);
  const total = active.length;

  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-52 text-sm text-muted-foreground">
        No applications to display
      </div>
    );
  }

  const counts = active.reduce<Record<string, number>>((acc, app) => {
    acc[app.status] = (acc[app.status] || 0) + 1;
    return acc;
  }, {});

  const flows = FLOW_ORDER.map((f) => ({
    ...f,
    count: counts[f.key] || 0,
  })).filter((f) => f.count > 0);

  // Total available height minus gaps
  const totalH = flows.length === 1 ? 40 : Math.max(200, flows.length * 44);
  const usableH = totalH - GAP * (flows.length - 1);

  // Compute per-flow heights proportional to count
  const withHeights = flows.map((f) => ({
    ...f,
    height: Math.max(MIN_H, (f.count / total) * usableH),
  }));

  // Stack flows vertically (same order on both sides → no crossing)
  let y = CHART_TOP;
  const stacked = withHeights.map((f) => {
    const srcY = y;
    const tgtY = y; // same stacking = horizontal parallel flows
    y += f.height + GAP;
    return { ...f, srcY, tgtY };
  });

  const sourceH = y - CHART_TOP - GAP;
  const svgH = sourceH + CHART_TOP * 2 + 10;
  const cpDist = (TGT_X - SRC_X - SRC_W) * 0.4;

  function ribbon(f: (typeof stacked)[0]) {
    const x1 = SRC_X + SRC_W;
    const x2 = TGT_X;
    const t = f.srcY;
    const b = f.srcY + f.height;
    const tt = f.tgtY;
    const tb = f.tgtY + f.height;
    return [
      `M ${x1} ${t}`,
      `C ${x1 + cpDist} ${t}, ${x2 - cpDist} ${tt}, ${x2} ${tt}`,
      `L ${x2} ${tb}`,
      `C ${x2 - cpDist} ${tb}, ${x1 + cpDist} ${b}, ${x1} ${b}`,
      `Z`,
    ].join(" ");
  }

  return (
    <svg
      viewBox={`0 0 700 ${svgH}`}
      className="w-full"
      aria-label="Application funnel chart"
    >
      {/* Source bar */}
      <rect
        x={SRC_X}
        y={CHART_TOP}
        width={SRC_W}
        height={sourceH}
        fill="rgba(107,114,128,0.45)"
        rx={3}
      />

      {/* Source label */}
      <text
        x={SRC_X - 10}
        y={CHART_TOP + sourceH / 2 - 8}
        textAnchor="end"
        fontSize={13}
        fontWeight={600}
        fill="currentColor"
      >
        Applications
      </text>
      <text
        x={SRC_X - 10}
        y={CHART_TOP + sourceH / 2 + 10}
        textAnchor="end"
        fontSize={12}
        fill="currentColor"
        opacity={0.6}
      >
        ({total})
      </text>

      {/* Ribbons + caps + labels */}
      {stacked.map((f) => {
        const midY = f.tgtY + f.height / 2;
        return (
          <g key={f.key}>
            <path d={ribbon(f)} fill={f.fill} />
            <rect
              x={TGT_X}
              y={f.tgtY}
              width={TGT_W}
              height={f.height}
              fill={f.cap}
              rx={2}
            />
            <text
              x={TGT_X + TGT_W + 10}
              y={midY}
              dominantBaseline="middle"
              fontSize={12}
              fill="currentColor"
            >
              <tspan fontWeight={500}>{f.label}</tspan>
              <tspan opacity={0.7}> ({f.count})</tspan>
            </text>
          </g>
        );
      })}

      {/* Percentage annotations on ribbons */}
      {stacked.map((f) => {
        const pct = Math.round((f.count / total) * 100);
        if (f.height < 16) return null;
        const midX = SRC_X + SRC_W + (TGT_X - SRC_X - SRC_W) / 2;
        const midY = f.srcY + f.height / 2;
        return (
          <text
            key={`pct-${f.key}`}
            x={midX}
            y={midY}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={11}
            fill="currentColor"
            opacity={0.55}
          >
            {pct}%
          </text>
        );
      })}
    </svg>
  );
}
