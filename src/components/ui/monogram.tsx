import { cn } from "@/lib/utils";

/**
 * A company's initial on one neutral surface.
 *
 * Deliberately not hashed to a hue: the old per-company colours were the
 * loudest thing in every row and carried no information. The company name sits
 * next to it, so this is decorative.
 */

type MonogramSize = "sm" | "md" | "lg";

/**
 * One user-perceived character, which is not the same as one code unit or even
 * one code point: an emoji built from a ZWJ sequence, or a letter carrying a
 * combining accent, is several of both. Hoisted because constructing a
 * segmenter per render is wasteful in a table of these.
 */
const GRAPHEMES = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export function firstCharacter(name: string): string {
  const [first] = GRAPHEMES.segment(name.trim());
  const upper = first?.segment.toUpperCase();
  if (!upper) return "?";
  // Uppercasing can lengthen a grapheme — "ß" becomes "SS" — and the box is a
  // fixed size, so segment again and keep only the first.
  const [upperFirst] = GRAPHEMES.segment(upper);
  return upperFirst?.segment ?? "?";
}

const SIZE: Record<MonogramSize, string> = {
  sm: "size-[18px] rounded-[5px] text-[9.5px]",
  md: "size-[26px] rounded-[7px] text-micro",
  lg: "size-11 rounded-inline text-[17px]",
};

export function Monogram({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: MonogramSize;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "bg-monogram text-monogram-foreground flex shrink-0 items-center justify-center font-semibold",
        SIZE[size],
        className,
      )}
    >
      {firstCharacter(name)}
    </span>
  );
}
