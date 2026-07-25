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

/** Rejected and Withdrawn — no fill, no ticks, no colour. */
export function isClosedStage(status: ApplicationStatusType): boolean {
  return stageDepth(status) === 0;
}

export function filledTicks(status: ApplicationStatusType): number {
  return Math.min(stageDepth(status), METER_TICKS);
}
