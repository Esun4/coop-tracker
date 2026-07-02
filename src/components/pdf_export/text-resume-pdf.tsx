// Plain-text resume preview/download for the resume tailoring page (text mode
// only — LaTeX mode compiles the user's own template instead). Line-based
// rendering: the model's tailored output already carries the layout in its
// line structure, so we preserve it rather than re-interpreting it. Pure text
// PDF → nothing an ATS can trip on.
//
// Statically imports @react-pdf/renderer (large): only ever load this module
// via dynamic import.

import { Document, Page, Text, StyleSheet, pdf } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: {
    paddingVertical: 50,
    paddingHorizontal: 54,
    fontFamily: "Helvetica",
    fontSize: 10,
    lineHeight: 1.35,
    color: "#111111",
  },
  line: {},
  heading: {
    fontFamily: "Helvetica-Bold",
    marginTop: 10,
  },
  blank: {
    height: 6,
  },
});

// Heuristic: a short all-caps line is a section heading ("EXPERIENCE",
// "SKILLS") — render it bold with breathing room.
function isHeadingLine(line: string): boolean {
  const t = line.trim();
  return (
    t.length > 1 &&
    t.length <= 40 &&
    t === t.toUpperCase() &&
    /[A-Z]/.test(t)
  );
}

export function TextResumeDocument({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  return (
    <Document title="Resume">
      <Page size="LETTER" style={styles.page}>
        {lines.map((line, i) =>
          line.trim().length === 0 ? (
            <Text key={i} style={styles.blank}>
              {" "}
            </Text>
          ) : (
            <Text key={i} style={isHeadingLine(line) ? styles.heading : styles.line}>
              {line}
            </Text>
          )
        )}
      </Page>
    </Document>
  );
}

/** Render the tailored text resume to a PDF blob, client-side. */
export function renderTextResumePdf(text: string): Promise<Blob> {
  return pdf(<TextResumeDocument text={text} />).toBlob();
}
