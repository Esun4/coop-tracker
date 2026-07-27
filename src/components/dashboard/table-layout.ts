/**
 * Shared so the skeleton and the real table cannot drift apart. A skeleton
 * that holds different geometry than the thing it stands in for causes a
 * reflow the moment data lands, which is the whole problem it exists to avoid.
 *
 * Both column strings are written out in full rather than composed, because
 * Tailwind only generates arbitrary values it can see literally in the source —
 * a template-built `grid-cols-[…]` produces no CSS at all.
 */
const COLS_DEFAULT =
  "grid-cols-[1.5fr_190px_100px_130px_120px_34px] grid px-[18px]";

/**
 * The 24px selection column is prepended, not reserved: with selection off it
 * does not exist, so the default table has no empty gutter down its left edge.
 */
const COLS_SELECTION =
  "grid-cols-[24px_1.5fr_190px_100px_130px_120px_34px] grid px-[18px]";

export function tableCols(selection = false): string {
  return selection ? COLS_SELECTION : COLS_DEFAULT;
}

export const TABLE_COLS = COLS_DEFAULT;

export const TABLE_HEADINGS = [
  "Company & role",
  "Stage",
  "Last update",
  "Location",
  "Source",
] as const;
