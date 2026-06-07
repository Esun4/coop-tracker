"use client";

import { useMemo } from "react";
import type { Application } from "@/generated/prisma/client";

// Grouped outcome buckets. OA / Interview / Final Round are merged into a
// single "Interview / OA" slice per the analytics design. When applications
// are kept fully up to date, realistically only Offers and Rejected remain —
// but the other buckets are kept for in-progress searches.
const SEGMENTS: {
  key: string;
  label: string;
  statuses: string[];
  color: string;
}[] = [
  { key: "OFFER", label: "Offers", statuses: ["OFFER"], color: "rgb(34,197,94)" },
  {
    key: "INTERVIEWING",
    label: "Interview / OA",
    statuses: ["OA", "INTERVIEW", "FINAL_ROUND"],
    color: "rgb(168,85,247)",
  },
  { key: "REJECTED", label: "Rejected", statuses: ["REJECTED"], color: "rgb(239,68,68)" },
  { key: "PENDING", label: "Pending", statuses: ["APPLIED"], color: "rgb(99,102,241)" },
  {
    key: "WITHDRAWN",
    label: "Withdrawn",
    statuses: ["WITHDRAWN"],
    color: "rgb(156,163,175)",
  },
];

const SIZE = 220;
const R = 100;
const INNER_R = 62;
const CX = SIZE / 2;
const CY = SIZE / 2;

function polar(r: number, angleDeg: number) {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) };
}

function donutSegment(startAngle: number, endAngle: number) {
  // Avoid a degenerate full circle (start point === end point won't render).
  const end = endAngle - startAngle >= 360 ? startAngle + 359.999 : endAngle;
  const p1 = polar(R, startAngle);
  const p2 = polar(R, end);
  const p3 = polar(INNER_R, end);
  const p4 = polar(INNER_R, startAngle);
  const largeArc = end - startAngle > 180 ? 1 : 0;
  return [
    `M ${p1.x} ${p1.y}`,
    `A ${R} ${R} 0 ${largeArc} 1 ${p2.x} ${p2.y}`,
    `L ${p3.x} ${p3.y}`,
    `A ${INNER_R} ${INNER_R} 0 ${largeArc} 0 ${p4.x} ${p4.y}`,
    `Z`,
  ].join(" ");
}

export function StatusPieChart({
  applications,
}: {
  applications: Application[];
}) {
  const { segments, total } = useMemo(() => {
    const active = applications.filter((a) => !a.archived);
    const counts = active.reduce<Record<string, number>>((acc, app) => {
      acc[app.status] = (acc[app.status] || 0) + 1;
      return acc;
    }, {});

    const segments = SEGMENTS.map((s) => ({
      ...s,
      count: s.statuses.reduce((sum, st) => sum + (counts[st] || 0), 0),
    })).filter((s) => s.count > 0);

    return { segments, total: active.length };
  }, [applications]);

  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-52 text-sm text-muted-foreground">
        No applications to display
      </div>
    );
  }

  // Build the arcs.
  let angle = 0;
  const arcs = segments.map((s) => {
    const sweep = (s.count / total) * 360;
    const start = angle;
    const end = angle + sweep;
    angle = end;
    return { ...s, start, end, pct: Math.round((s.count / total) * 100) };
  });

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:justify-center sm:gap-10">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="w-44 shrink-0"
        aria-label="Applications by outcome"
      >
        {arcs.map((a) => (
          <path key={a.key} d={donutSegment(a.start, a.end)} fill={a.color}>
            <title>{`${a.label}: ${a.count} (${a.pct}%)`}</title>
          </path>
        ))}

        {/* Center total */}
        <text
          x={CX}
          y={CY - 6}
          textAnchor="middle"
          fontSize={28}
          fontWeight={700}
          fill="currentColor"
        >
          {total}
        </text>
        <text
          x={CX}
          y={CY + 16}
          textAnchor="middle"
          fontSize={12}
          fill="currentColor"
          opacity={0.6}
        >
          Applications
        </text>
      </svg>

      {/* Legend */}
      <ul className="space-y-2.5">
        {arcs.map((a) => (
          <li key={a.key} className="flex items-center gap-2.5 text-sm">
            <span
              className="h-3 w-3 shrink-0 rounded-sm"
              style={{ background: a.color }}
            />
            <span className="font-medium">{a.label}</span>
            <span className="text-muted-foreground">
              {a.count} · {a.pct}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
