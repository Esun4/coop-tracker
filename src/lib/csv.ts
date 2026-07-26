import { statusLabels, type ApplicationStatusType } from "@/lib/schemas";

/**
 * CSV export, as a pure function of the rows handed to it. Lives here rather
 * than in the dashboard because two callers need identical output over
 * different row sets: the toolbar's "Export CSV" (everything loaded) and the
 * bulk bar's "Export" (the current selection).
 *
 * The field list is the contract with whatever the user opens this in, so it is
 * declared once and both callers get the same columns in the same order.
 */

/** Structural on purpose: tests should not have to build a full Prisma row. */
export interface CsvRow {
  company: string;
  roleTitle: string;
  status: string;
  location: string | null;
  applicationDate: Date | string | null;
  source: string | null;
  contactInfo: string | null;
  notes: string | null;
  archived: boolean;
}

export const CSV_HEADERS = [
  "Company",
  "Role",
  "Status",
  "Location",
  "Application Date",
  "Source",
  "Contact / Recruiter",
  "Notes",
  "Archived",
] as const;

/**
 * Quote a field only when it would otherwise break the row. A quote inside a
 * quoted field is doubled — that is the escape CSV actually defines, and the
 * reason a note containing `"` cannot be passed through untouched.
 *
 * A field opening with `=`, `+`, `-` or `@` is also prefixed with an apostrophe:
 * spreadsheets read those as formulas, and this file carries company names and
 * notes that came out of email the classifier read. Quoting alone does not stop
 * that — the apostrophe is what makes the cell literal text.
 */
function escape(value: string | null | undefined): string {
  const str = value ?? "";
  const safe = /^[\t\r ]*[=+\-@]/.test(str) ? `'${str}` : str;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/**
 * `YYYY-MM-DD`, from the date's own UTC value.
 *
 * `toLocaleDateString()` was both ambiguous across locales and off by a day: a
 * date stored at UTC midnight renders as the day before in any negative-offset
 * timezone, which is every Canadian user of this app.
 */
function formatDate(value: Date | string | null): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

export function buildApplicationsCsv(rows: readonly CsvRow[]): string {
  const body = rows.map((row) =>
    [
      escape(row.company),
      escape(row.roleTitle),
      escape(
        statusLabels[row.status as ApplicationStatusType] ?? row.status,
      ),
      escape(row.location),
      escape(formatDate(row.applicationDate)),
      escape(row.source),
      escape(row.contactInfo),
      escape(row.notes),
      row.archived ? "Yes" : "No",
    ].join(","),
  );

  return [CSV_HEADERS.join(","), ...body].join("\n");
}

export function applicationsCsvFilename(now = new Date()): string {
  return `applications-${now.toISOString().slice(0, 10)}.csv`;
}
