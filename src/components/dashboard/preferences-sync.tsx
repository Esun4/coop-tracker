"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";
import { PALETTES } from "@/lib/preferences";

/**
 * Applies the account's stored preferences to the document.
 *
 * The palette is a data attribute on <html> because it swaps CSS variables.
 * Setting it from an effect alone would paint the default ramp first and swap
 * a frame later, so the value is also written by a blocking inline script that
 * runs while the document is still parsing — the same trick next-themes uses
 * for the light/dark class.
 *
 * The theme itself goes through next-themes so it keeps agreeing with the
 * system setting. Renders nothing visible.
 */
export function PreferencesSync({
  theme,
  palette,
}: {
  theme: string;
  palette: string;
}) {
  const { setTheme } = useTheme();

  // Only ever a known palette name reaches the script below.
  const safePalette = (PALETTES as readonly string[]).includes(palette)
    ? palette
    : "ledger";

  useEffect(() => {
    document.documentElement.dataset.palette = safePalette;
  }, [safePalette]);

  useEffect(() => {
    setTheme(theme);
  }, [theme, setTheme]);

  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `document.documentElement.dataset.palette=${JSON.stringify(
          safePalette,
        )}`,
      }}
    />
  );
}
