import { describe, it, expect } from "vitest";
import {
  splitLetterParagraphs,
  countWords,
  condenseTargetWords,
  ONE_PAGE_TARGET_WORDS,
} from "@/lib/letter-format";

describe("splitLetterParagraphs", () => {
  it("splits on blank lines and keeps single newlines inside a paragraph", () => {
    const text =
      "Jane Doe\n123 Main St\n\nDear Hiring Manager,\n\nFirst paragraph.\n\n\nSincerely,\nJane";
    expect(splitLetterParagraphs(text)).toEqual([
      "Jane Doe\n123 Main St",
      "Dear Hiring Manager,",
      "First paragraph.",
      "Sincerely,\nJane",
    ]);
  });

  it("normalises Windows line endings and drops whitespace-only paragraphs", () => {
    const text = "One.\r\n\r\n   \r\n\r\nTwo.";
    expect(splitLetterParagraphs(text)).toEqual(["One.", "Two."]);
  });

  it("returns an empty array for empty input", () => {
    expect(splitLetterParagraphs("")).toEqual([]);
    expect(splitLetterParagraphs("   \n\n  ")).toEqual([]);
  });
});

describe("countWords", () => {
  it("counts on whitespace boundaries", () => {
    expect(countWords("Dear Hiring Manager,\nI am writing.")).toBe(6);
  });

  it("returns 0 for empty or whitespace-only text", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   \n ")).toBe(0);
  });
});

// Targets are anchored to the full one-page budget (~27 body lines) rather
// than fixed shrink ratios, so an overflowing letter is trimmed to a FULL
// page, not over-shrunk. (Behavior change requested 2026-07-01: exports were
// coming out too short.)
describe("condenseTargetWords", () => {
  it("asks a long letter for the full one-page budget on the first attempt", () => {
    expect(condenseTargetWords(1000, 1)).toBe(ONE_PAGE_TARGET_WORDS);
  });

  it("stays meaningfully below the current length when the letter barely overflows", () => {
    // 460 words: 90% (414) is below the 435 anchor, so that's the ask —
    // otherwise the model has no room to cut anything.
    expect(condenseTargetWords(460, 1)).toBe(414);
    expect(condenseTargetWords(460, 1)).toBeLessThan(ONE_PAGE_TARGET_WORDS);
  });

  it("cuts harder on the second attempt but stays near a full page", () => {
    const first = condenseTargetWords(1000, 1);
    const second = condenseTargetWords(1000, 2);
    expect(second).toBeLessThan(first);
    expect(second).toBe(Math.floor(ONE_PAGE_TARGET_WORDS * 0.85));
  });

  it("never goes below the 150-word floor", () => {
    expect(condenseTargetWords(160, 2)).toBe(150);
  });
});
