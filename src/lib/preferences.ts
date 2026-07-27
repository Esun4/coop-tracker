import { z } from "zod";

/**
 * Preference vocabulary. Kept out of the server-action module because a
 * "use server" file may only export async functions — client components need
 * these values directly.
 */

export const THEMES = ["light", "dark", "system"] as const;
export const PALETTES = ["ledger", "ink"] as const;
export const DENSITIES = ["compact", "comfortable"] as const;
/** All three are available to everyone. Nothing here is gated. */
export const SCAN_FREQUENCIES = ["manual", "every6h", "daily8am"] as const;

export type Theme = (typeof THEMES)[number];
export type Palette = (typeof PALETTES)[number];
export type DensityPref = (typeof DENSITIES)[number];
export type ScanFrequency = (typeof SCAN_FREQUENCIES)[number];

export const preferencesSchema = z.object({
  theme: z.enum(THEMES).optional(),
  palette: z.enum(PALETTES).optional(),
  density: z.enum(DENSITIES).optional(),
  scanFrequency: z.enum(SCAN_FREQUENCIES).optional(),
});

export type Preferences = z.infer<typeof preferencesSchema>;

/** The columns are plain strings; narrow once, with a safe fallback. */
export function narrowPreference<T extends string>(
  value: string,
  allowed: readonly T[],
  fallback: T,
): T {
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}
