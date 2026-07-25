"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";

/**
 * Pushes the account's stored preferences onto the document.
 *
 * The palette is a data attribute on <html> because it swaps CSS variables;
 * the theme goes through next-themes so it keeps agreeing with the system
 * setting. Renders nothing.
 */
export function PreferencesSync({
  theme,
  palette,
}: {
  theme: string;
  palette: string;
}) {
  const { setTheme } = useTheme();

  useEffect(() => {
    document.documentElement.dataset.palette = palette;
  }, [palette]);

  useEffect(() => {
    setTheme(theme);
  }, [theme, setTheme]);

  return null;
}
