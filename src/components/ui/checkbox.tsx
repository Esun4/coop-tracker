"use client";

import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 14px box, 4px radius — small enough that a column of them reads as chrome
 * rather than as a control per row, which is the whole point of the selection
 * column only existing when selection is on.
 *
 * Unchecked is a bare border on the row's own background; checked fills with
 * `primary` and drops its border, so the tick is the only mark that changes
 * weight. Indeterminate is a bar, used by the header checkbox when part of the
 * page is selected.
 */
export function Checkbox({
  className,
  indeterminate,
  ...props
}: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      indeterminate={indeterminate}
      className={cn(
        "border-border focus-visible:ring-ring flex size-[14px] shrink-0 cursor-pointer items-center justify-center rounded-[4px] border bg-transparent transition-colors focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
        "data-[checked]:bg-primary data-[checked]:border-transparent",
        "data-[indeterminate]:bg-primary data-[indeterminate]:border-transparent",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="text-primary-foreground flex items-center justify-center">
        {indeterminate ? (
          <Minus className="size-2.5" strokeWidth={3} />
        ) : (
          <Check className="size-2.5" strokeWidth={3.5} />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
