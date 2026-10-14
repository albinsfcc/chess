import type { Metadata } from "next";
import "./globals.css";
import "./ocean.css";
import { THEME_BOOTSTRAP, BLUR_BOOTSTRAP } from "@/lib/theme";
import { ThemeSync } from "@/components/theme-sync";
import { PIECE_CODES, pieceAsset } from "@/lib/board-appearance";

export const metadata: Metadata = {
  title: "Chess Review · Workspace",
  description: "A local chess workspace. Play, explore positions, and review your moves.",
};

/* Google stylesheet keeps font delivery independent of the offline production build. */
/* eslint-disable @next/next/no-page-custom-font */
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning className="h-full antialiased"><head><link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" /><link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Brahmi&display=swap" rel="stylesheet" /><script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP + ";" + BLUR_BOOTSTRAP }} />{PIECE_CODES.map(code => <link key={code} rel="preload" as="image" href={pieceAsset(code)} />)}</head><body><ThemeSync /><a href="#workspace-main" className="sr-only z-[100] rounded bg-primary p-3 text-primary-foreground focus:not-sr-only focus:fixed focus:left-3 focus:top-3">Skip to workspace</a>{children}</body></html>;
}

