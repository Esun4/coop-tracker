"use client";

import { useState, useTransition } from "react";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setApplicationDeadline } from "@/lib/actions/applications";
import { toast } from "sonner";

/**
 * What this application is working towards.
 *
 * Takes the attention tone because it is the one thing on the page with a
 * clock running. When the date came out of an email it says so and quotes the
 * sentence, because a parsed date the user cannot trace is a date they cannot
 * correct.
 */

function relativeTo(date: Date): string {
  const days = Math.round((date.getTime() - Date.now()) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days > 1) return `In ${days} days`;
  if (days === -1) return "Yesterday";
  return `${Math.abs(days)} days ago`;
}

/** `YYYY-MM-DDTHH:mm` in local time, which is what date inputs want. */
function toInputValue(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function DeadlineCard({
  applicationId,
  deadlineAt,
  deadlineSource,
  deadlineNote,
}: {
  applicationId: string;
  deadlineAt: Date | null;
  deadlineSource: string | null;
  deadlineNote: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(deadlineAt ? toInputValue(deadlineAt) : "");
  const [pending, startTransition] = useTransition();

  function save(next: string | null) {
    startTransition(async () => {
      // Saving here takes the date over by hand, and the server marks it
      // "manual" to match. Carrying the old email sentence across would leave
      // "Set by you." quoting mail the user just overrode.
      const result = await setApplicationDeadline(applicationId, {
        deadlineAt: next,
        note: null,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setEditing(false);
      toast.success(next ? "Deadline updated" : "Deadline cleared");
    });
  }

  if (!deadlineAt && !editing) {
    return (
      <div className="border-border bg-card flex items-center justify-between gap-5 rounded-xl border px-5 py-4">
        <div className="flex items-center gap-2">
          <Clock className="text-muted-foreground size-3.5" />
          <span className="text-meta text-muted-foreground">
            No date on this one yet
          </span>
        </div>
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
          Add a deadline
        </Button>
      </div>
    );
  }

  return (
    <div className="border-attn-border bg-attn rounded-xl border px-5 py-[18px]">
      <div className="flex items-start justify-between gap-5">
        <div>
          <div className="flex items-center gap-2">
            <Clock className="text-primary size-3.5" />
            <span className="text-meta font-semibold">
              {deadlineAt
                ? deadlineAt.toLocaleString("en-US", {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })
                : "Set a deadline"}
            </span>
          </div>

          {deadlineAt && !editing && (
            <p className="text-meta text-muted-foreground mt-2">
              {relativeTo(deadlineAt)}.{" "}
              {deadlineSource === "email"
                ? "Read from an email — edit if that's wrong."
                : "Set by you."}
            </p>
          )}

          {/* The sentence it was inferred from, so a wrong date is traceable. */}
          {deadlineAt && !editing && deadlineNote && (
            <p className="text-meta text-foreground-2 border-attn-border mt-2.5 border-l-2 pl-3">
              “{deadlineNote}”
            </p>
          )}

          {editing && (
            <div className="mt-3 flex items-center gap-2">
              <Input
                type="datetime-local"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="text-meta h-8 w-[230px]"
              />
              <Button
                size="sm"
                disabled={pending || !value}
                onClick={() => save(value)}
              >
                Save
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => {
                  // Drop the unsaved edit, or reopening shows the abandoned
                  // text instead of the date that is actually stored.
                  setValue(deadlineAt ? toInputValue(deadlineAt) : "");
                  setEditing(false);
                }}
              >
                Cancel
              </Button>
            </div>
          )}
        </div>

        {!editing && (
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              Edit deadline
            </Button>
            {deadlineAt && (
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => save(null)}
              >
                Clear
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
