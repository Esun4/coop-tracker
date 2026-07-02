"use client";

// Orchestrates the one-page PDF export: render the letter, count real pages,
// and if it overflows, ask the condense action to shorten it and try again.
// The guarantee this hook enforces: a downloaded PDF is always exactly one page.

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { condenseCoverLetter } from "@/lib/actions/cover-letter";
import { countPdfPages } from "@/lib/pdfutils";
import { countWords, condenseTargetWords } from "@/lib/letter-format";

export type LetterExportPhase = "idle" | "rendering" | "condensing";

// Two LLM passes is the ceiling — each costs money and rate-limit quota, and a
// second pass at ~55% of the original length fits in practice. Past that we
// squeeze typography instead of paying for a third call.
const MAX_CONDENSE_ATTEMPTS = 2;
const FALLBACK_FONT_SIZE = 10;

export function useLetterExport(
  /** Called with the shortened text when a condense pass ran, so the on-screen
   *  letter always matches what was downloaded. */
  onLetterShortened?: (letter: string) => void
) {
  const [phase, setPhase] = useState<LetterExportPhase>("idle");

  const exportPdf = useCallback(
    async (letter: string) => {
      setPhase("rendering");
      try {
        // The renderer is heavy, so it stays out of the page bundle until the
        // first export.
        const { renderLetterPdf } = await import(
          "@/components/pdf_export/letter-pdf"
        );

        let current = letter;
        let blob = await renderLetterPdf(current);
        let pages = await countPdfPages(blob);
        let shortened = false;

        for (
          let attempt = 1;
          pages > 1 && attempt <= MAX_CONDENSE_ATTEMPTS;
          attempt++
        ) {
          setPhase("condensing");
          const result = await condenseCoverLetter({
            letter: current,
            targetWords: condenseTargetWords(countWords(current), attempt),
          });
          if ("error" in result) {
            toast.error(result.error);
            return;
          }
          current = result.letter;
          shortened = true;

          setPhase("rendering");
          blob = await renderLetterPdf(current);
          pages = await countPdfPages(blob);
        }

        // Last resort: one typographic step down before giving up.
        if (pages > 1) {
          blob = await renderLetterPdf(current, {
            fontSize: FALLBACK_FONT_SIZE,
          });
          pages = await countPdfPages(blob);
        }

        if (pages > 1) {
          toast.error(
            "Couldn't fit the letter on one page — try trimming it by hand first."
          );
          return;
        }

        if (shortened) {
          onLetterShortened?.(current);
          toast.success("Letter was shortened to fit on one page");
        }

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `cover-letter-${new Date().toISOString().split("T")[0]}.pdf`;
        link.click();
        URL.revokeObjectURL(url);
      } catch {
        toast.error("Couldn't export the PDF. Please try again.");
      } finally {
        setPhase("idle");
      }
    },
    [onLetterShortened]
  );

  return { exportPdf, phase, isExporting: phase !== "idle" };
}
