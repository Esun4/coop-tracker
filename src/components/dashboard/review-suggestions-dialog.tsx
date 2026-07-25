"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Monogram } from "@/components/ui/monogram";
import { StageChip } from "@/components/ui/stage-indicator";
import { type ApplicationStatusType } from "@/lib/schemas";
import type { Application, EmailSuggestion } from "@/generated/prisma/client";

/**
 * A list, not a card-at-a-time wizard.
 *
 * One card with a progress rail is fine for three suggestions and miserable
 * for thirty. Each row states the change in a sentence, shows what it was read
 * from, and can be accepted or dismissed without leaving the list. Confidence
 * is a word — a percentage implies a precision the classifier does not have.
 *
 * A suggestion we cannot match to an existing application says "Review"
 * instead of "Accept", because accepting it would mean guessing.
 */

/** Deliberately coarse. Anything finer would be false precision. */
function confidenceWord(confidence: number): string {
  if (confidence >= 0.85) return "Very likely";
  if (confidence >= 0.6) return "Probably right";
  return "Worth a look";
}

function matchFor(
  suggestion: EmailSuggestion,
  applications: Application[],
): Application | undefined {
  if (!suggestion.suggestedCompany) return undefined;
  const wanted = suggestion.suggestedCompany.toLowerCase();
  return applications.find((a) => a.company.toLowerCase() === wanted);
}

export function ReviewSuggestionsDialog({
  open,
  onOpenChange,
  suggestions,
  applications,
  scannedCount,
  acceptingAll = false,
  onAccept,
  onDismiss,
  onAcceptAll,
  onNeedsReview,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suggestions: EmailSuggestion[];
  applications: Application[];
  scannedCount?: number;
  acceptingAll?: boolean;
  onAccept: (suggestion: EmailSuggestion, application: Application) => void;
  onDismiss: (suggestion: EmailSuggestion) => void;
  onAcceptAll: () => void;
  /** Opens the fuller flow for anything we cannot apply on its own. */
  onNeedsReview: (suggestion: EmailSuggestion) => void;
}) {
  // Starts on the first item every time the dialog opens: the parent remounts
  // this component on open, which is cheaper than resetting from an effect.
  const [cursor, setCursor] = useState(0);

  // A · X · J/K, as promised in the footer.
  useEffect(() => {
    if (!open) return;

    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

      const current = suggestions[cursor];
      if (!current) return;

      const key = event.key.toLowerCase();
      if (key === "j") {
        event.preventDefault();
        setCursor((c) => Math.min(c + 1, suggestions.length - 1));
      } else if (key === "k") {
        event.preventDefault();
        setCursor((c) => Math.max(c - 1, 0));
      } else if (key === "a") {
        // Same condition as the row's own button: without a match and a target
        // stage there is nothing to apply, so hand off rather than guess.
        const match = matchFor(current, applications);
        event.preventDefault();
        if (match && current.suggestedStatus) onAccept(current, match);
        else onNeedsReview(current);
      } else if (key === "x") {
        event.preventDefault();
        onDismiss(current);
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, cursor, suggestions, applications, onAccept, onDismiss, onNeedsReview]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-[560px]">
        <div className="flex items-start justify-between gap-4 px-6 pt-[22px] pb-4">
          <div>
            <DialogTitle className="text-[16.5px] font-semibold">
              {suggestions.length} email{suggestions.length === 1 ? "" : "s"} to
              review
            </DialogTitle>
            <DialogDescription className="text-meta text-muted-foreground mt-1.5">
              {scannedCount != null
                ? `From ${scannedCount.toLocaleString()} messages scanned`
                : "Read out of your inbox — nothing is applied until you accept it"}
            </DialogDescription>
          </div>
          {suggestions.length > 1 && (
            <Button
              variant="outline"
              size="sm"
              onClick={onAcceptAll}
              disabled={acceptingAll}
            >
              {acceptingAll ? "Accepting…" : `Accept all ${suggestions.length}`}
            </Button>
          )}
        </div>

        <div className="max-h-[440px] overflow-y-auto">
          {suggestions.map((suggestion, i) => {
            const match = matchFor(suggestion, applications);
            const company = suggestion.suggestedCompany ?? "Unknown company";
            const status = suggestion.suggestedStatus as
              | ApplicationStatusType
              | null;

            return (
              <div
                key={suggestion.id}
                onMouseEnter={() => setCursor(i)}
                className={`border-border-subtle border-t px-6 py-4 ${
                  i === cursor ? "bg-attn" : ""
                }`}
              >
                <div className="flex items-start gap-3">
                  <Monogram name={company} />

                  <div className="min-w-0 flex-1">
                    <p className="text-body">
                      <span className="font-semibold">{company}</span>
                      {suggestion.suggestedAction === "NEW_APPLICATION" ? (
                        <> — new application, </>
                      ) : (
                        <> moves to </>
                      )}
                      {status && <StageChip status={status} size="sm" />}
                    </p>

                    <p className="text-meta text-muted-foreground mt-1.5 truncate">
                      {suggestion.emailSender}
                      {suggestion.emailSnippet && ` · “${suggestion.emailSnippet}”`}
                    </p>

                    <p className="text-caption text-muted-foreground mt-2.5">
                      {confidenceWord(suggestion.confidence)}
                      {match
                        ? ` · matched to ${match.company} — ${match.roleTitle}`
                        : " · no matching application yet"}
                    </p>
                  </div>

                  <div className="flex shrink-0 gap-1.5">
                    {match && status ? (
                      <Button size="sm" onClick={() => onAccept(suggestion, match)}>
                        Accept
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onNeedsReview(suggestion)}
                      >
                        Review
                      </Button>
                    )}
                    <Button
                      size="icon-sm"
                      variant="outline"
                      aria-label={`Dismiss suggestion for ${company}`}
                      onClick={() => onDismiss(suggestion)}
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="border-border-subtle bg-sunken flex items-center justify-between gap-3 border-t px-6 py-3.5">
          <span className="text-caption text-muted-foreground">
            <span className="font-mono">A</span> accept ·{" "}
            <span className="font-mono">X</span> dismiss ·{" "}
            <span className="font-mono">J/K</span> move
          </span>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
