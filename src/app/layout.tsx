import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chess Review · Workspace",
  description: "A local chess workspace. Play, explore positions, and review your moves.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className="h-full antialiased"><body><a href="#workspace-main" className="sr-only z-[100] rounded bg-primary p-3 text-primary-foreground focus:not-sr-only focus:fixed focus:left-3 focus:top-3">Skip to workspace</a>{children}</body></html>;
}

