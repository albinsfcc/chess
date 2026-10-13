"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Upload } from "lucide-react";
import { Button } from "./ui/button";
import { PlatformImportDialog } from "./platform-import-dialog";
import { PgnImportDialog } from "./pgn-import-dialog";

export function ImportActions() {
  const [open, setOpen] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => { if (!host.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, []);
  return <div ref={host} className="import-actions" data-open={open}
    onMouseEnter={() => { if (matchMedia("(hover: hover)").matches) setOpen(true); }}
    onMouseLeave={() => setOpen(false)}
    onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}
    onKeyDown={(event) => { if (event.key === "Escape") { setOpen(false); host.current?.querySelector<HTMLButtonElement>(".import-trigger")?.focus(); } }}>
    <Button className="import-trigger" variant="outline" aria-expanded={open} aria-controls="import-options" onClick={() => setOpen(true)}><Upload />Import<ChevronDown /></Button>
    <div id="import-options" className="import-options" aria-label="Import options">
      <PlatformImportDialog platform="chesscom" /><PlatformImportDialog platform="lichess" /><PgnImportDialog />
    </div>
  </div>;
}
