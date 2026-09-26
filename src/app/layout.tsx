import type { Metadata } from "next";
import "./globals.css";
import { PIECE_CODES, pieceAsset } from "@/lib/board-appearance";

export const metadata: Metadata = {
  title: "Chess Review · Workspace",
  description: "A local chess workspace. Play, explore positions, and review your moves.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className="h-full antialiased"><head>{PIECE_CODES.map(code => <link key={code} rel="preload" as="image" href={pieceAsset(code)} />)}</head><body><a href="#workspace-main" className="sr-only z-[100] rounded bg-primary p-3 text-primary-foreground focus:not-sr-only focus:fixed focus:left-3 focus:top-3">Skip to workspace</a>{children}</body></html>;
}

