import { describe, it, expect } from "vitest";
import { cn } from "@/lib/utils";

/**
 * `cn` merges through tailwind-merge, which only recognises Tailwind's stock
 * scales. Our type/weight/tracking scales are custom, so without the config in
 * `src/lib/utils.ts` tailwind-merge reads `text-micro` as a *colour*, sees a
 * second colour after it, and drops the size — the element then silently
 * inherits the 16px body font. That shipped once (stage chips rendered at 16px
 * instead of 11.5px); these tests exist so it cannot ship again.
 */

const CUSTOM_TEXT_SIZES = [
  "text-label",
  "text-micro",
  "text-caption",
  "text-meta",
  "text-body",
  "text-lede",
  "text-title",
  "text-metric",
];

describe("cn — custom type scale vs text colour", () => {
  it.each(CUSTOM_TEXT_SIZES)("keeps %s when a text colour follows it", (size) => {
    expect(cn(size, "text-muted-foreground")).toBe(`${size} text-muted-foreground`);
  });

  it("keeps the size on a stage chip's full class list", () => {
    const result = cn(
      "inline-flex items-center rounded-sm border font-medium whitespace-nowrap",
      "px-[7px] py-0.5 text-micro",
      "bg-chip-2 border-chip-2-border text-chip-2-foreground stage-chip-2",
    );
    expect(result).toContain("text-micro");
    expect(result).toContain("text-chip-2-foreground");
  });

  it("still lets one custom size override another", () => {
    expect(cn("text-body", "text-title")).toBe("text-title");
  });

  it("still merges custom sizes against Tailwind's stock sizes", () => {
    expect(cn("text-sm", "text-body")).toBe("text-body");
    expect(cn("text-body", "text-sm")).toBe("text-sm");
  });

  it("still lets one text colour override another", () => {
    expect(cn("text-muted-foreground", "text-foreground")).toBe("text-foreground");
  });
});

describe("cn — custom weight and tracking scales", () => {
  it("treats font-emphasis as a weight, not a family", () => {
    expect(cn("font-emphasis", "font-semibold")).toBe("font-semibold");
    expect(cn("font-emphasis", "font-mono")).toBe("font-emphasis font-mono");
  });

  it("merges custom tracking values", () => {
    expect(cn("tracking-label", "tracking-title")).toBe("tracking-title");
    expect(cn("tracking-title", "tracking-tight")).toBe("tracking-tight");
  });
});
