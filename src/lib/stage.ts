import type { ApplicationStatusType } from "@/lib/schemas";

/**
 * The pipeline vocabulary. Everything that draws stage — the chip, the tick
 * meter, the stepper, the metric strip, the ladder on Insights — keys off this
 * one map, so colour always means "how far along", never "which category".
 *
 * Terminal states have depth 0: they are out of the ramp entirely, not at the
 * end of it.
 */
export const STAGE_DEPTH: Record<ApplicationStatusType, number> = {
  APPLIED: 1,
  OA: 2,
  INTERVIEW: 3,
  FINAL_ROUND: 4,
  OFFER: 5,
  REJECTED: 0,
  WITHDRAWN: 0,
};

/** Applied → Assessment → Interview → Final round → Offer. */
export const STAGE_COUNT = 5;

/**
 * The meter has four ticks for five stages: Offer fills the same four as Final
 * round and is told apart by its solid chip. Four ticks keep the meter narrow
 * enough to sit inside a table row.
 */
export const METER_TICKS = 4;

export function stageDepth(status: ApplicationStatusType): number {
  return STAGE_DEPTH[status] ?? 0;
}

/**
 * Rejected and Withdrawn — no fill, no ticks, no colour. Derived from the
 * group so a status the maps have never heard of gets one answer here and in
 * `isInPlay`, rather than counting as closed in one place and open in another.
 */
export function isClosedStage(status: ApplicationStatusType): boolean {
  return stageGroup(status) === "closed";
}

export function filledTicks(status: ApplicationStatusType): number {
  return Math.min(stageDepth(status), METER_TICKS);
}

/**
 * Rows group by whose move it is next, not by stage order — that is the whole
 * point of the grouping, and it is why Assessment sits below Interview here.
 *
 *   action    an interview to prepare for, a final round, an offer to decide
 *   progress  an assessment you are partway through
 *   waiting   sent, nothing back yet
 *   closed    out of the pipeline
 */
export type StageGroup = "action" | "progress" | "waiting" | "closed";

export const STAGE_GROUP: Record<ApplicationStatusType, StageGroup> = {
  INTERVIEW: "action",
  FINAL_ROUND: "action",
  OFFER: "action",
  OA: "progress",
  APPLIED: "waiting",
  REJECTED: "closed",
  WITHDRAWN: "closed",
};

/** The order rows appear in. `closed` is deliberately absent — it collapses. */
export const OPEN_GROUPS = ["action", "progress", "waiting"] as const;

export const GROUP_LABEL: Record<StageGroup, string> = {
  action: "Action needed",
  progress: "In progress",
  waiting: "Waiting on them",
  closed: "Closed",
};

/** Group dots take the ramp too: attention deepest, waiting neutral. */
export const GROUP_DOT: Record<StageGroup, string> = {
  action: "bg-stage-5",
  progress: "bg-stage-3",
  waiting: "bg-border",
  closed: "bg-border",
};

/**
 * An unrecognised status falls to `waiting`: it stays visible. Hiding a row
 * because a status is unknown is the worse failure of the two.
 */
export function stageGroup(status: ApplicationStatusType): StageGroup {
  return STAGE_GROUP[status] ?? "waiting";
}

export function isInPlay(status: ApplicationStatusType): boolean {
  return stageGroup(status) !== "closed";
}
