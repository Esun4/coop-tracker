"use client";

import { Inbox } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * A scan that found nothing, for a scan the user started themselves.
 *
 * Today that outcome looks identical to a scan that never ran. This says what
 * was read and what it matched, names the usual reason (Promotions, a personal
 * address), and offers the two real exits. Background scans get a toast
 * instead — a modal that says "nothing happened" trains people to dismiss
 * modals.
 */
export function NothingFoundDialog({
  open,
  onOpenChange,
  scanned,
  lastSyncedAt,
  onAddManually,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scanned: number;
  lastSyncedAt: Date | null;
  onAddManually: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <div className="flex items-center gap-2.5">
          <span className="bg-secondary text-muted-foreground flex size-[30px] items-center justify-center rounded-md">
            <Inbox className="size-[15px]" />
          </span>
          <DialogTitle className="text-base font-semibold">
            Nothing new in your inbox
          </DialogTitle>
        </div>

        <DialogDescription className="text-body text-foreground-2 leading-relaxed">
          We read {scanned.toLocaleString()} message
          {scanned === 1 ? "" : "s"}
          {lastSyncedAt &&
            ` received since your last scan on ${lastSyncedAt.toLocaleDateString(
              "en-US",
              { month: "short", day: "numeric" },
            )}`}
          . None of them looked like an application confirmation, assessment or
          decision, so nothing changed.
        </DialogDescription>

        <div className="border-border-subtle flex flex-col gap-2 rounded-lg border px-3.5 py-3">
          {[
            ["Messages read", scanned.toLocaleString()],
            ["Matched an application", "0"],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between gap-3">
              <span className="text-meta text-muted-foreground">{label}</span>
              <span className="text-meta font-mono">{value}</span>
            </div>
          ))}
        </div>

        <p className="text-meta text-muted-foreground leading-relaxed">
          Expecting something? Recruiter mail sometimes lands in Promotions, or
          under a personal address we aren&apos;t scanning.
        </p>

        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              onOpenChange(false);
              onAddManually();
            }}
          >
            Add manually
          </Button>
          <Button size="sm" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
