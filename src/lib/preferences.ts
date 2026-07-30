import { z } from "zod";

/**
 * Preference vocabulary. Kept out of the server-action module because a
 * "use server" file may only export async functions — client components need
 * these values directly.
 */

export const THEMES = ["light", "dark", "system"] as const;
export const PALETTES = ["ledger", "ink"] as const;
export const DENSITIES = ["compact", "comfortable"] as const;
export const SCAN_FREQUENCIES = ["manual", "every6h", "daily8am"] as const;

/**
 * Manual sync is the free tier: you press Sync, we check once. Anything that
 * runs on a schedule without you is Pro.
 */
export const PRO_SCAN_FREQUENCIES = ["every6h", "daily8am"] as const;

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

/** Does choosing this frequency require Pro? */
export function isProScanFrequency(value: string): boolean {
  return (PRO_SCAN_FREQUENCIES as readonly string[]).includes(value);
}

/**
 * What the stored frequency actually *means* right now.
 *
 * A user who picks "Every 6 hours" on Pro and then lapses keeps `every6h` in
 * their row — we don't rewrite the column, so their choice comes back if they
 * resubscribe. Everything that reads the setting must go through here instead,
 * or a lapsed account would keep a background sweep it is no longer paying for.
 */
export function effectiveScanFrequency(
  stored: string,
  isPro: boolean,
): ScanFrequency {
  const narrowed = narrowPreference<ScanFrequency>(
    stored,
    SCAN_FREQUENCIES,
    "manual",
  );
  return isPro || !isProScanFrequency(narrowed) ? narrowed : "manual";
}
