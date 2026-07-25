"use client";

import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { statusLabels, type ApplicationStatusType } from "@/lib/schemas";
import type { EmailSuggestion } from "@/generated/prisma/client";

/**
 * Email suggestions, demoted from a full-width table to a card in the rail.
 *
 * Three unread emails should not push a hundred applications below the fold.
 * The card says what is waiting in one sentence and offers the two things
 * worth doing from here; the detail lives in the review dialog.
 */

function summarise(suggestions: EmailSuggestion[]): string {
  const parts = suggestions.slice(0, 3).map((s) => {
    const company = s.suggestedCompany ?? "An application";
    if (s.suggestedAction === "NEW_APPLICATION") {
      return `${company} looks like a new application`;
    }
    if (s.suggestedStatus) {
      const label =
        statusLabels[s.suggestedStatus as ApplicationStatusType] ??
        s.suggestedStatus;
      return `${company} moved to ${label.toLowerCase()}`;
    }
    return `${company} sent an update`;
  });

  const rest = suggestions.length - parts.length;
  return parts.join(", ") + (rest > 0 ? `, and ${rest} more` : "") + ".";
}

export function SuggestionsCard({
  suggestions,
  onReview,
  onAcceptAll,
  acceptingAll,
}: {
  suggestions: EmailSuggestion[];
  onReview: () => void;
  onAcceptAll: () => void;
  acceptingAll: boolean;
}) {
  if (suggestions.length === 0) return null;

  return (
    <div className="border-attn-border bg-attn rounded-xl border p-4">
      <div className="flex items-center gap-2">
        <Mail className="text-primary size-3.5" />
        <span className="text-meta font-semibold">
          {suggestions.length} email{suggestions.length === 1 ? "" : "s"} to
          review
        </span>
      </div>

      <p className="text-meta text-muted-foreground mt-2 leading-relaxed">
        {summarise(suggestions)}
      </p>

      <div className="mt-3.5 flex gap-2">
        <Button size="sm" onClick={onReview}>
          Review
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onAcceptAll}
          disabled={acceptingAll}
          className="border-attn-border"
        >
          {acceptingAll ? "Accepting…" : "Accept all"}
        </Button>
      </div>
    </div>
  );
}
