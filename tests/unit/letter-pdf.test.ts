// Render smoke test for the cover-letter PDF export: proves the template
// actually renders and that page counting detects overflow — the two runtime
// behaviors the one-page guarantee in use-letter-export.ts depends on.
// Everything runs locally (no network, no DB).

import { describe, it, expect } from "vitest";
import React from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
// The app's countPdfPages wrapper uses pdfjs's browser build, which needs DOM
// globals at import time; in Node we count pages through the legacy build
// instead (same parser, node-compatible entry point).
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { LetterDocument } from "@/components/pdf_export/letter-pdf";

const PARAGRAPH =
  "I am a second-year software engineering student with experience building " +
  "full-stack web applications in React and Node, and I am excited to bring " +
  "that experience to your team this term. ";

function letterOfParagraphs(count: number): string {
  return [
    "Dear Hiring Manager,",
    ...Array.from({ length: count }, () => PARAGRAPH.repeat(3).trim()),
    "Sincerely,\nJane Doe",
  ].join("\n\n");
}

async function renderAndCountPages(
  text: string,
  fontSize?: number
): Promise<number> {
  // renderToBuffer types its argument as the inner <Document>'s props;
  // a component that *returns* a Document needs this cast.
  const buffer = await renderToBuffer(
    React.createElement(LetterDocument, {
      text,
      fontSize,
    }) as React.ReactElement<DocumentProps>
  );
  const loadingTask = getDocument({ data: new Uint8Array(buffer) });
  const doc = await loadingTask.promise;
  const pageCount = doc.numPages;
  await loadingTask.destroy();
  return pageCount;
}

describe("LetterDocument rendering", () => {
  it("renders a typical letter onto exactly one page", async () => {
    expect(await renderAndCountPages(letterOfParagraphs(3))).toBe(1);
  });

  it("overflows onto multiple pages when the letter is too long", async () => {
    // This is the signal the export hook keys its condense loop off of.
    expect(await renderAndCountPages(letterOfParagraphs(12))).toBeGreaterThan(1);
  });

  it("fits more text on a page at the fallback font size", async () => {
    // Not asserting exact page counts — just that shrinking the font never
    // increases pages, which is what the last-resort squeeze relies on.
    const atDefault = await renderAndCountPages(letterOfParagraphs(6));
    const atFallback = await renderAndCountPages(letterOfParagraphs(6), 10);
    expect(atFallback).toBeLessThanOrEqual(atDefault);
  });
});
