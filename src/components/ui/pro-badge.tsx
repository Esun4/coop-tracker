import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * The "Pro" marker. One component so the badge reads identically wherever a
 * gated feature appears — nav, settings, a locked button — and so restyling it
 * later is one edit rather than a hunt.
 *
 * Purely decorative: it never decides anything, it only labels. The entitlement
 * check that matters lives on the server.
 */
export function ProBadge({ className }: { className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "border-primary/35 bg-primary/10 text-primary h-[18px] px-1.5 text-[10px] font-semibold tracking-wide uppercase",
        className,
      )}
    >
      Pro
    </Badge>
  );
}
