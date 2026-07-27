"use client";

import { useEffect, useRef } from "react";
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

  // Push the stored theme only when the *stored* value changes. next-themes
  // rebuilds `setTheme` on every theme change (it closes over the current
  // theme), so depending on its identity here meant: toggle the header button →
  // setTheme identity changes → this effect re-runs → the theme snaps straight
  // back to whatever the account had. The toggle looked dead. The ref tracks
  // what was last applied so a genuine preference change still lands.
  const appliedTheme = useRef<string | null>(null);

  useEffect(() => {
    if (appliedTheme.current === theme) return;
    appliedTheme.current = theme;
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
