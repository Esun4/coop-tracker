import { cn } from "@/lib/utils";

/**
 * A company's initial on one neutral surface.
 *
 * Deliberately not hashed to a hue: the old per-company colours were the
 * loudest thing in every row and carried no information. The company name sits
 * next to it, so this is decorative.
 */

type MonogramSize = "sm" | "md" | "lg";

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
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}
