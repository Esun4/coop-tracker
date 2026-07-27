import { describe, it, expect } from "vitest";
import {
  buildApplicationsCsv,
  applicationsCsvFilename,
  CSV_HEADERS,
  type CsvRow,
} from "@/lib/csv";

function row(overrides: Partial<CsvRow> = {}): CsvRow {
  return {
    company: "Stripe",
    roleTitle: "SWE Intern",
    status: "INTERVIEW",
    location: "Toronto",
    applicationDate: null,
    source: "Referral",
    contactInfo: null,
    notes: null,
    archived: false,
    ...overrides,
  };
}

describe("buildApplicationsCsv", () => {
  it("writes the header row even when there are no applications", () => {
    expect(buildApplicationsCsv([])).toBe(CSV_HEADERS.join(","));
  });

  it("writes one line per application, in the order given", () => {
    const csv = buildApplicationsCsv([
      row({ company: "Stripe" }),
      row({ company: "Figma" }),
    ]);
    const lines = csv.split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[1].startsWith("Stripe,")).toBe(true);
    expect(lines[2].startsWith("Figma,")).toBe(true);
  });

  it("uses the human stage label, not the enum value", () => {
    expect(buildApplicationsCsv([row({ status: "FINAL_ROUND" })])).toContain(
      "Final round",
    );
  });

  it("passes an unknown status through rather than emitting undefined", () => {
    expect(buildApplicationsCsv([row({ status: "SOMETHING_NEW" })])).toContain(
      "SOMETHING_NEW",
    );
  });

  it("quotes fields containing a comma, quote or newline", () => {
    const csv = buildApplicationsCsv([
      row({ notes: 'Said "maybe", then went quiet\nfollow up' }),
    ]);
    // The embedded quote is doubled, and the whole field is wrapped.
    expect(csv).toContain('"Said ""maybe"", then went quiet\nfollow up"');
  });

  it("leaves plain fields unquoted", () => {
    expect(buildApplicationsCsv([row()])).toContain("Stripe,SWE Intern,");
  });

  it("neutralises fields a spreadsheet would run as a formula", () => {
    for (const hostile of [
      "=1+1",
      "+SUM(A1)",
      "-2+3",
      "@SUM(A1)",
      "  =cmd|'/c calc'!A1",
      "\t=1+1",
    ]) {
      const csv = buildApplicationsCsv([row({ company: hostile })]);
      const cell = csv.split("\n")[1];
      // Prefixed with an apostrophe, so the cell is text and not a formula.
      expect(cell.startsWith("'") || cell.startsWith("\"'")).toBe(true);
    }
  });

  it("leaves a value that merely contains an operator alone", () => {
    expect(buildApplicationsCsv([row({ company: "Ford+Co" })])).toContain(
      "Ford+Co",
    );
  });

  it("writes the application date as UTC YYYY-MM-DD, not a locale rendering", () => {
    const csv = buildApplicationsCsv([
      row({ applicationDate: new Date("2026-07-26T00:00:00Z") }),
    ]);
    // A locale rendering in any negative-offset timezone would say the 25th.
    expect(csv).toContain("2026-07-26");
  });

  it("accepts a date string and drops one it cannot parse", () => {
    expect(buildApplicationsCsv([row({ applicationDate: "2026-01-05" })])).toContain(
      "2026-01-05",
    );
    const cells = buildApplicationsCsv([row({ applicationDate: "not a date" })])
      .split("\n")[1]
      .split(",");
    expect(cells[4]).toBe("");
  });

  it("renders nulls as empty fields, keeping the column count fixed", () => {
    const csv = buildApplicationsCsv([
      row({ location: null, source: null, contactInfo: null, notes: null }),
    ]);
    const cells = csv.split("\n")[1].split(",");
    expect(cells).toHaveLength(CSV_HEADERS.length);
  });

  it("writes archived as Yes/No", () => {
    expect(buildApplicationsCsv([row({ archived: true })]).endsWith("Yes")).toBe(
      true,
    );
    expect(buildApplicationsCsv([row({ archived: false })]).endsWith("No")).toBe(
      true,
    );
  });
});

describe("applicationsCsvFilename", () => {
  // Two exports on the same day share a name; the browser suffixes the repeat.
  it("is dated, so exports from different days are told apart", () => {
    expect(applicationsCsvFilename(new Date("2026-07-26T18:00:00Z"))).toBe(
      "applications-2026-07-26.csv",
    );
  });
});
