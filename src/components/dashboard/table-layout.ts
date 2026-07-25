/**
 * Shared so the skeleton and the real table cannot drift apart. A skeleton
 * that holds different geometry than the thing it stands in for causes a
 * reflow the moment data lands, which is the whole problem it exists to avoid.
 */
export const TABLE_COLS =
  "grid-cols-[1.5fr_190px_100px_130px_120px_34px] grid px-[18px]";

export const TABLE_HEADINGS = [
  "Company & role",
  "Stage",
  "Last update",
  "Location",
  "Source",
] as const;
