// Pure, framework-free text helpers for the cover-letter PDF export.
//
// Nothing here knows about React, @react-pdf/renderer, or the export state
// machine — these are plain functions the PDF template and export hook
// compose, kept isolated so each is trivially testable.

/**
 * Split letter text into paragraphs on blank lines. Single newlines inside a
 * paragraph are preserved (address blocks and sign-offs rely on them); runs of
 * two or more newlines are paragraph breaks. Whitespace-only paragraphs are
 * dropped.
 */
export function splitLetterParagraphs(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/** Word count on whitespace boundaries; the unit the condense prompt targets. */
export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

// The letter body should fill the page, not just fit on it: ~27 printed lines
// of body text (excluding the name/address header and the signature block),
// which the generation and condense prompts both aim for.
export const TARGET_BODY_LINES = 27;
// ~11pt Times on a 6.5" column averages ~15 words per line.
const WORDS_PER_LINE = 15;
// Header + signature words sit outside the 27-line body budget but inside the
// whole-letter word target the condense prompt receives.
const HEADER_SIGNATURE_ALLOWANCE = 30;
const MIN_TARGET = 150;

// 27 lines × 15 words + header/signature ≈ a full-but-one-page letter.
export const ONE_PAGE_TARGET_WORDS =
  TARGET_BODY_LINES * WORDS_PER_LINE + HEADER_SIGNATURE_ALLOWANCE;

/**
 * Word target for a condense attempt. Anchored to the 27-line one-page budget
 * (attempt 1 asks for the full budget, attempt 2 backs off ~15%) rather than a
 * fixed ratio, so an overflowing letter is trimmed to a *full* page instead of
 * being over-shrunk. The current-length ratio only guarantees the target is
 * meaningfully below what the model was just given, or it won't cut at all.
 * Never below 150 words — shorter stops being a cover letter.
 */
export function condenseTargetWords(
  currentWords: number,
  attempt: number
): number {
  const anchor =
    attempt <= 1
      ? ONE_PAGE_TARGET_WORDS
      : Math.floor(ONE_PAGE_TARGET_WORDS * 0.85);
  const belowCurrent = Math.floor(currentWords * (attempt <= 1 ? 0.9 : 0.75));
  return Math.max(MIN_TARGET, Math.min(anchor, belowCurrent));
}
