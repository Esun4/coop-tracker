import { describe, it, expect } from "vitest";
import { extractLatexErrors } from "@/lib/latex-compile";

describe("extractLatexErrors", () => {
  it("picks '!' error lines with trailing context", () => {
    const log = [
      "This is pdfTeX, Version 3.14",
      "(./document.tex",
      "! Undefined control sequence.",
      "l.12 \\resumeItem",
      "               {Built things}",
      "more noise",
      "even more noise",
    ].join("\n");

    const result = extractLatexErrors(log);
    expect(result).toContain("! Undefined control sequence.");
    expect(result).toContain("l.12");
    expect(result).not.toContain("This is pdfTeX");
  });

  it("falls back to the log tail when no error marker exists", () => {
    const log = Array.from({ length: 50 }, (_, i) => `line ${i}`).join("\n");
    const result = extractLatexErrors(log);
    expect(result).toContain("line 49");
    expect(result).not.toContain("line 0");
  });
});
