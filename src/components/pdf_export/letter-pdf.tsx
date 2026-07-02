// PDF template + renderer for the cover-letter export.
//
// This module statically imports @react-pdf/renderer (large), so it must only
// ever be loaded via dynamic import — see use-letter-export.ts. It renders
// off-DOM: nothing here appears on the page.

import { Document, Page, Text, StyleSheet, pdf } from "@react-pdf/renderer";
import { splitLetterParagraphs } from "@/lib/letter-format";

export interface LetterPdfOptions {
  /** Body size in points. 11 is the default; the export hook steps down to 10
   *  as a last-resort squeeze before giving up on a one-page fit. */
  fontSize?: number;
}

const DEFAULT_FONT_SIZE = 11;

const styles = StyleSheet.create({
  page: {
    // 1" margins on US Letter — the classic printed-letter frame.
    paddingVertical: 72,
    paddingHorizontal: 72,
    fontFamily: "Times-Roman",
    lineHeight: 1.45,
    color: "#1a1a1a",
  },
  paragraph: {
    marginBottom: 10,
  },
});

// Exported for the render smoke test, which drives it through the node
// renderer (renderToBuffer) instead of the browser blob path.
export function LetterDocument({
  text,
  fontSize = DEFAULT_FONT_SIZE,
}: {
  text: string;
  fontSize?: number;
}) {
  const paragraphs = splitLetterParagraphs(text);
  return (
    <Document title="Cover Letter">
      <Page size="LETTER" style={[styles.page, { fontSize }]}>
        {paragraphs.map((paragraph, i) => (
          <Text key={i} style={styles.paragraph}>
            {paragraph}
          </Text>
        ))}
      </Page>
    </Document>
  );
}

/** Render the letter to a PDF blob (client-side, no server round-trip). */
export function renderLetterPdf(
  text: string,
  options: LetterPdfOptions = {}
): Promise<Blob> {
  return pdf(<LetterDocument text={text} fontSize={options.fontSize} />).toBlob();
}
