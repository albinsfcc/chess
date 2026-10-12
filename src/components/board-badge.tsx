"use client";
import { useState } from "react";
import { badgeSquare } from "@/lib/board-assessment";
import type { ReactNode } from "react";

export function BoardBadge({ square, orientation, title, description, accessibleLabel, testId, kind, children }: {
  square: string; orientation: "white" | "black"; title: string; description: string;
  accessibleLabel: string; testId: string; kind?: string; children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const { column, row } = badgeSquare(square, orientation);
  return <div className="pointer-events-none absolute z-30" style={{ left: `${column * 12.5}%`, top: `${row * 12.5}%`, width: "12.5%", height: "12.5%" }}>
    <button type="button" data-testid={testId} data-square={square} data-kind={kind} aria-label={accessibleLabel} aria-expanded={expanded}
      style={{ scale: 1.5, transform: `translate(12px, ${row === 0 ? 8 : -12}px)`, transformOrigin: "top right", ...(column === 7 ? { right: 18 } : {}) }}
      title={title} onClick={() => setExpanded(!expanded)} onBlur={() => setExpanded(false)} onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); setExpanded(false); } }}
      className="pointer-events-auto absolute right-0 top-0 flex size-[42%] max-h-9 max-w-9 items-center justify-center rounded-full shadow-md">
      {children}</button>
    {expanded && <div role="status" className="pointer-events-auto absolute overflow-y-auto rounded-md border bg-popover p-2 text-xs text-popover-foreground shadow-lg" style={{ width: "min(11rem, 45vw)", maxHeight: "min(8rem, 35vw)", ...(column >= 4 ? { right: 0 } : { left: 0 }), ...(row < 4 ? { top: "100%" } : { bottom: "100%" }) }}><strong>{title}</strong><p className="mt-1">{description}</p></div>}
  </div>;
}
