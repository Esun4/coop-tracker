"use client";

import { AlertCircle } from "lucide-react";
import { signIn } from "next-auth/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { GoogleMark } from "@/components/ui/google-mark";

/**
 * What happens when Gmail logs you out.
 *
 * The banner appears the moment a scan fails, so you learn it from the page
 * rather than from a modal. The dialog only interrupts when you actually ask
 * for a sync or open the review list — an expired token must never stand
 * between you and your own data.
 *
 * Neither surface asks the user to diagnose OAuth. It says access expired,
 * that nothing tracked is lost, and offers one button.
 */

export function GmailExpiredBanner({
  lastSyncedAt,
  onReconnect,
}: {
  lastSyncedAt: Date | null;
  onReconnect: () => void;
}) {
  return (
    <div className="border-warn-border bg-warn flex items-center gap-3 rounded-xl border px-4 py-3">
      <AlertCircle className="text-warn-foreground size-3.5 shrink-0" />
      <span className="text-meta">
        Gmail access expired — new mail isn&apos;t being read.
        {lastSyncedAt && (
          <span className="text-muted-foreground">
            {" "}
            Last successful scan{" "}
            {lastSyncedAt.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
            .
          </span>
        )}
      </span>
      <Button size="sm" className="ml-auto shrink-0" onClick={onReconnect}>
        Reconnect
      </Button>
    </div>
  );
}

export function GmailExpiredPill({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="border-warn-border bg-warn text-warn-foreground text-caption inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 font-medium"
    >
      <AlertCircle className="size-3" />
      Inbox disconnected
    </button>
  );
}

export function GmailExpiredDialog({
  open,
  onOpenChange,
  email,
  lastSyncedAt,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  email?: string | null;
  lastSyncedAt: Date | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <div className="flex items-center gap-2.5">
          <span className="bg-warn text-warn-foreground flex size-[30px] items-center justify-center rounded-md">
            <AlertCircle className="size-[15px]" />
          </span>
          <DialogTitle className="text-base font-semibold">
            Gmail needs you to sign in again
          </DialogTitle>
        </div>

        <DialogDescription className="text-body text-foreground-2 leading-relaxed">
          Google expires inbox access every so often, or when you change your
          password. Scanning is paused until you reconnect —{" "}
          <span className="font-emphasis text-foreground">
            nothing you&apos;ve tracked is lost.
          </span>
        </DialogDescription>

        <Button
          variant="outline"
          className="h-[42px] w-full gap-2.5"
          onClick={() => signIn("google")}
        >
          <GoogleMark />
          Sign in with Google
        </Button>

        <p className="text-micro text-muted-foreground text-center leading-relaxed">
          Same read-only permission as before{email ? ` · ${email}` : ""}
        </p>

        <div className="border-border-subtle flex items-center justify-between gap-3 border-t pt-3.5">
          <span className="text-meta text-muted-foreground">
            {lastSyncedAt
              ? `Last successful scan: ${lastSyncedAt.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}`
              : "No successful scan yet"}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Not now
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
