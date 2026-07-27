"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { StageChip } from "@/components/ui/stage-indicator";
import {
  applicationStatuses,
  statusLabels,
  type ApplicationStatusType,
} from "@/lib/schemas";
import { isClosedStage } from "@/lib/stage";

/**
 * What you do to a selection.
 *
 * Attached to the top of the table rather than floating over it: a bar that
 * hovers above content covers the rows it is about, and the count has to be
 * read against those rows. It takes the same faint attention tone as the
 * selected rows so the two read as one object, and it states the two shortcuts
 * instead of hiding them.
 *
 * Stage changes apply straight away — they are one click to undo. Closing a
 * batch does not: it goes through a confirm, because it takes rows out of the
 * default view.
 */

/** Closing out is the destructive one, and it has two meanings worth keeping apart. */
const CLOSED_STAGES = applicationStatuses.filter((status) =>
  isClosedStage(status),
);

const OPEN_STAGES = applicationStatuses.filter(
  (status) => !isClosedStage(status),
);

const BAR_BUTTON =
  "bg-card border-border text-caption inline-flex h-[26px] items-center gap-[5px] rounded-[7px] border px-[10px] font-medium transition-colors hover:bg-secondary disabled:opacity-50";

/** `YYYY-MM-DDTHH:mm` in local time, which is what date inputs want. */
function toInputValue(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function BulkActionBar({
  count,
  pending = false,
  onSetStage,
  onSetDeadline,
  onExport,
  onMarkClosed,
  onClear,
}: {
  count: number;
  pending?: boolean;
  onSetStage: (status: ApplicationStatusType) => void;
  /** `null` clears the date, which also drops the reminders behind it. */
  onSetDeadline: (deadlineAt: string | null) => void;
  onExport: () => void;
  onMarkClosed: (status: ApplicationStatusType) => void;
  onClear: () => void;
}) {
  const [showDeadline, setShowDeadline] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const [deadlineValue, setDeadlineValue] = useState("");
  const [closeStatus, setCloseStatus] =
    useState<ApplicationStatusType>("REJECTED");

  return (
    <>
      <div className="bg-attn border-attn-border flex items-center gap-3 border-b px-[18px] py-[9px]">
        {/* The mixed-state box is also how you get out: it reads as the thing
            that put you here, so clicking it undoes that. */}
        <Checkbox
          indeterminate
          checked={false}
          onCheckedChange={onClear}
          aria-label="Clear selection"
        />
        <span className="text-meta font-semibold">{count} selected</span>
        <span className="bg-attn-border h-[14px] w-px" aria-hidden />

        <div className="flex items-center gap-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button className={BAR_BUTTON} disabled={pending}>
                  Set stage
                  <ChevronDown className="size-[11px] opacity-60" />
                </button>
              }
            />
            <DropdownMenuContent>
              {OPEN_STAGES.map((status) => (
                <DropdownMenuItem
                  key={status}
                  onClick={() => onSetStage(status)}
                >
                  <StageChip status={status} />
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <button
            className={BAR_BUTTON}
            disabled={pending}
            onClick={() => {
              setDeadlineValue(toInputValue(new Date()));
              setShowDeadline(true);
            }}
          >
            Set reminder
          </button>

          <button className={BAR_BUTTON} disabled={pending} onClick={onExport}>
            Export
          </button>

          <button
            className={`${BAR_BUTTON} text-muted-foreground`}
            disabled={pending}
            onClick={() => setShowClose(true)}
          >
            Mark closed
          </button>
        </div>

        <span className="text-caption text-muted-foreground ml-auto">
          Shift-click to pick a range · Esc to clear
        </span>
      </div>

      {/* A date is what the app can act on: reminders are materialised from it
          using the schedule already set in settings, so this dialog asks for the
          deadline and not for a notification. */}
      <Dialog open={showDeadline} onOpenChange={setShowDeadline}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogTitle className="text-base font-semibold">
            Set a deadline for {count} application{count === 1 ? "" : "s"}
          </DialogTitle>
          <DialogDescription className="text-body text-foreground-2">
            Reminders are scheduled from this date using your reminder settings.
            Any date already on these applications is replaced.
          </DialogDescription>

          <Input
            type="datetime-local"
            value={deadlineValue}
            onChange={(e) => setDeadlineValue(e.target.value)}
            className="text-meta"
            aria-label="Deadline"
          />

          <div className="flex items-center justify-between gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => {
                onSetDeadline(null);
                setShowDeadline(false);
              }}
            >
              Clear date
            </Button>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDeadline(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={pending || !deadlineValue}
                onClick={() => {
                  onSetDeadline(deadlineValue);
                  setShowDeadline(false);
                }}
              >
                Set deadline
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Rejected and withdrawn are both "closed", and the difference is the
          user's — the insights funnel counts them apart, so it is asked here
          rather than assumed. */}
      <Dialog open={showClose} onOpenChange={setShowClose}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogTitle className="text-base font-semibold">
            Close out {count} application{count === 1 ? "" : "s"}?
          </DialogTitle>
          <DialogDescription className="text-body text-foreground-2">
            They leave the default “In play” view. Nothing is deleted, and you
            can set a stage on them again at any time.
          </DialogDescription>

          <div
            role="radiogroup"
            aria-label="Closed as"
            className="flex flex-col gap-1"
          >
            {CLOSED_STAGES.map((status) => (
              <button
                key={status}
                role="radio"
                aria-checked={closeStatus === status}
                onClick={() => setCloseStatus(status)}
                className={`text-meta flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                  closeStatus === status
                    ? "border-primary bg-attn"
                    : "border-border-subtle hover:bg-secondary"
                }`}
              >
                <span
                  className={`flex size-[13px] items-center justify-center rounded-full border ${
                    closeStatus === status ? "border-primary" : "border-border"
                  }`}
                  aria-hidden
                >
                  {closeStatus === status && (
                    <span className="bg-primary size-[7px] rounded-full" />
                  )}
                </span>
                {statusLabels[status]}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowClose(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={pending}
              onClick={() => {
                onMarkClosed(closeStatus);
                setShowClose(false);
              }}
            >
              Mark {statusLabels[closeStatus].toLowerCase()}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
