"use client";
import { useState } from "react";
import { badgeSquare, MOVE_BADGES } from "@/lib/board-assessment";
import type { MoveAssessment } from "@/lib/game-analysis/move-quality";

export function BoardMoveBadge({ square, orientation, assessment, san }: { square: string; orientation: "white" | "black"; assessment: MoveAssessment; san: string }) {
  const [expanded, setExpanded] = useState(false);
  const { column, row } = badgeSquare(square, orientation), badge = MOVE_BADGES[assessment.label];
  return <div className="pointer-events-none absolute z-30" style={{ left: `${column * 12.5}%`, top: `${row * 12.5}%`, width: "12.5%", height: "12.5%" }}>
    <button type="button" data-testid="board-move-badge" data-square={square} aria-label={`${san}: ${assessment.label}. ${assessment.reason}`} aria-expanded={expanded}
      title={`${san}: ${assessment.label}`} onClick={() => setExpanded(!expanded)} onBlur={() => setExpanded(false)} onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); setExpanded(false); } }}
      className="pointer-events-auto absolute right-0 top-0 flex size-[42%] max-h-8 max-w-8 items-center justify-center rounded-md border border-white font-mono text-[clamp(10px,1.1vw,14px)] font-bold text-white shadow-md"
      style={{ backgroundColor: badge.color }}>{badge.symbol}</button>
    {expanded && <div role="status" className="pointer-events-auto absolute overflow-y-auto rounded-md border bg-popover p-2 text-xs text-popover-foreground shadow-lg" style={{ width: "min(11rem, 45vw)", maxHeight: "min(8rem, 35vw)", ...(column >= 4 ? { right: 0 } : { left: 0 }), ...(row < 4 ? { top: "100%" } : { bottom: "100%" }) }}><strong>{san} · {assessment.label}</strong><p className="mt-1">{assessment.reason}</p></div>}
  </div>;
}
