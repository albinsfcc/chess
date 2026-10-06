"use client";
import { useEffect } from "react";
import { useTheme } from "@/store/theme";
import { THEME_KEY, BLUR_KEY } from "@/lib/theme";
export function ThemeSync() {
  useEffect(() => {
    useTheme.getState().hydrate();
    const sync = (event: StorageEvent) => {
      if (event.storageArea !== localStorage) return;
      if (event.key === THEME_KEY || event.key === null) useTheme.getState().sync(event.newValue);
      if (event.key === BLUR_KEY || event.key === null) useTheme.getState().syncBlur(event.newValue);
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  return null;
}
