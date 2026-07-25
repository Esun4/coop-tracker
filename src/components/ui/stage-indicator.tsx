import { cn } from "@/lib/utils";
import { statusLabels, type ApplicationStatusType } from "@/lib/schemas";
import {
  METER_TICKS,
  STAGE_COUNT,
  filledTicks,
  isClosedStage,
  stageDepth,
} from "@/lib/stage";

/**
 * Stage, drawn two ways at once.
 *
 * The chip carries the ramp — one hue deepening with pipeline depth — and the
 * four-tick meter carries the same information as position, so stage survives
 * colour-blindness and the colourless palette. They ship together: never render
 * a chip in a row or header without the meter beside it.
 *
 * Class maps are written out in full rather than composed from a template
 * string so Tailwind's scanner can see every class.
 */

type StageSize = "sm" | "md" | "lg";

const CHIP_TONE: Record<ApplicationStatusType, string> = {
  APPLIED: "bg-chip-1 border-chip-1-border text-chip-1-foreground",
  OA: "bg-chip-2 border-chip-2-border text-chip-2-foreground",
  INTERVIEW: "bg-chip-3 border-chip-3-border text-chip-3-foreground",
  FINAL_ROUND: "bg-chip-4 border-chip-4-border text-chip-4-foreground",
  OFFER: "bg-chip-5 border-chip-5-border text-chip-5-foreground",
  REJECTED: "bg-transparent border-chip-closed-border text-chip-closed-foreground",
  WITHDRAWN: "bg-transparent border-chip-closed-border text-chip-closed-foreground",
};

const CHIP_SIZE: Record<StageSize, string> = {
  sm: "px-[7px] py-px text-micro",
  md: "px-[7px] py-0.5 text-micro",
  lg: "px-2 py-0.5 text-caption",
};

/** Filled ticks read left to right, deepening as they go. */
const TICK_FILL = ["bg-stage-1", "bg-stage-2", "bg-stage-3", "bg-stage-4"];

const TICK_SIZE: Record<StageSize, string> = {
  sm: "w-2",
  md: "w-[9px]",
  lg: "w-[11px]",
};

export function StageChip({
  status,
  size = "md",
  className,
}: {
  status: ApplicationStatusType;
  size?: StageSize;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border font-medium whitespace-nowrap",
        CHIP_SIZE[size],
        CHIP_TONE[status],
        className,
      )}
    >
      {statusLabels[status]}
    </span>
  );
}

/**
 * Decorative by default — the chip beside it already names the stage in text,
 * so announcing both would just repeat. Pass `label` when the meter stands
 * alone.
 */
export function StageMeter({
  status,
  size = "md",
  label = false,
  className,
}: {
  status: ApplicationStatusType;
  size?: StageSize;
  label?: boolean;
  className?: string;
}) {
  const filled = filledTicks(status);
  const depth = stageDepth(status);
  const a11y = label
    ? {
        role: "img" as const,
        "aria-label": isClosedStage(status)
          ? statusLabels[status]
          : `Stage ${depth} of ${STAGE_COUNT}`,
      }
    : { "aria-hidden": true };

  return (
    <span className={cn("flex items-center gap-0.5", className)} {...a11y}>
      {Array.from({ length: METER_TICKS }, (_, i) => (
        <span
          key={i}
          className={cn(
            "h-[3px] rounded-[2px]",
            TICK_SIZE[size],
            i < filled ? TICK_FILL[i] : "bg-stage-off",
          )}
        />
      ))}
    </span>
  );
}

export function StageIndicator({
  status,
  size = "md",
  className,
}: {
  status: ApplicationStatusType;
  size?: StageSize;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-[9px]", className)}>
      <StageChip status={status} size={size} />
      <StageMeter status={status} size={size} />
    </span>
  );
}
