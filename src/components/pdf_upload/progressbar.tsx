import { cn } from "@/lib/utils";
import type { ProgressBarProps } from "@/types/pdf";

/**
 * Dumb, presentational progress bar. No state of its own — it just renders the
 * `value` (0–100) it's handed. Driven by the `extracting` state's progress.
 */
export function ProgressBar({ value, label }: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, Math.round(value)));

  return (
    <div className="space-y-1.5">
      {label && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{label}</span>
          <span>{clamped}%</span>
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn("h-full rounded-full bg-primary transition-all duration-200")}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
