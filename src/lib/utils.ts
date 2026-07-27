import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

/**
 * The type, weight and tracking scales in `globals.css` are custom, and
 * tailwind-merge only knows Tailwind's stock values. Anything it does not
 * recognise after `text-` it files as a *colour*, so `cn("text-micro",
 * "text-chip-2-foreground")` saw two colours, kept the last one, and silently
 * dropped the size — the chip then inherited the 16px body font. Registering
 * the scales here puts size, weight, tracking and colour back in separate
 * groups so they stop cancelling each other out.
 *
 * Keep these lists in sync with the `@theme` block in `globals.css`.
 */
const TEXT_SIZES = [
  "label",
  "micro",
  "caption",
  "meta",
  "body",
  "lede",
  "title",
  "metric",
]

const TRACKING = ["label", "column", "title", "wordmark", "metric"]

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: TEXT_SIZES }],
      "font-weight": [{ font: ["emphasis"] }],
      tracking: [{ tracking: TRACKING }],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
