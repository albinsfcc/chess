"use client";

import { memo } from "react";
import type { NodePath } from "@/lib/pgn/domain";
import { formatScore } from "@/lib/engine/normalize";
import type { PlannedPosition, PositionAnalysis } from "@/lib/game-analysis/domain";

/** Renders committed records only. No subscription to streamed engine output. */
export const EvaluationGraph = memo(function EvaluationGraph({ plan, records, selectedPath, select }: {
  plan: PlannedPosition[]; records: PositionAnalysis[]; selectedPath: NodePath; select: (path: NodePath) => void;
}) {
  const byPly = new Map(records.map((row) => [row.ply, row]));
  const active = plan.findIndex((row) => row.treePath.join(".") === selectedPath.join("."));
  const offset = Math.floor(Math.max(0, active) / 100) * 100, visible = plan.slice(offset, offset + 100);
  const points = visible.map((position, index) => {
    const score = byPly.get(position.ply)?.scoreBefore;
    const x = 45 + index * 510 / Math.max(1, visible.length - 1);
    const y = !score ? 90 : score.type === "cp" ? 90 - Math.max(-1000, Math.min(1000, score.value)) * 0.06
      : (score.moves === 0 ? position.mover === "b" : score.moves > 0) ? 14 : 166;
    return { position, score, x, y };
  });
  return <div className="space-y-2" aria-label="Evaluation history">
    <svg viewBox="0 0 600 195" className="w-full" role="group" aria-label="White evaluation by ply" data-testid="evaluation-graph">
      <line x1="45" x2="555" y1="90" y2="90" stroke="currentColor" opacity="0.35" />
      <text x="2" y="34" fill="currentColor" fontSize="11">+10</text><text x="9" y="94" fill="currentColor" fontSize="11">0</text><text x="2" y="154" fill="currentColor" fontSize="11">−10</text>
      <text x="43" y="190" fill="currentColor" fontSize="14">Ply {visible[0]?.ply}</text><text x="510" y="190" fill="currentColor" fontSize="14">Ply {visible.at(-1)?.ply}</text>
      {points.map((point, index) => {
        const previous = points[index - 1], selected = index + offset === active;
        const label = `Ply ${point.position.ply}: ${point.score ? formatScore(point.score) : "Unanalyzed"}. ${point.position.label}`;
        return <g key={point.position.ply}>
          {previous?.score && point.score && <line x1={previous.x} y1={previous.y} x2={point.x} y2={point.y} stroke="#58b9ca" strokeWidth="2" />}
          <g role="button" data-graph-index={index} aria-label={label} aria-current={selected ? "step" : undefined} tabIndex={selected || (active < 0 && index === 0) ? 0 : -1} className="cursor-pointer focus:outline-2 focus:outline-primary" onClick={() => select(point.position.treePath)} onKeyDown={(event) => {
            const next = { ArrowLeft: Math.max(0, index - 1), ArrowRight: Math.min(visible.length - 1, index + 1), Home: 0, End: visible.length - 1 }[event.key];
            if (next !== undefined || event.key === "Enter" || event.key === " ") {
              event.preventDefault(); event.stopPropagation(); select(visible[next ?? index].treePath);
              event.currentTarget.ownerSVGElement?.querySelector<SVGGElement>(`[data-graph-index="${next ?? index}"]`)?.focus();
            }
          }}>
            <title>{label}</title>
            <circle cx={point.x} cy={point.y} r="10" fill="transparent" />
            {point.score?.type === "mate" ? <path d={`M ${point.x} ${point.y - 6} l 6 6 l -6 6 l -6 -6 Z`} fill="#f1cf84" stroke={selected ? "white" : "#f1cf84"} strokeWidth="2" />
              : <circle cx={point.x} cy={point.y} r={selected ? 6 : 4} fill={point.score ? "#58b9ca" : "#18252b"} stroke={selected ? "white" : point.score ? "#58b9ca" : "#a6afb9"} strokeWidth="2" strokeDasharray={point.score ? undefined : "2 2"} />}
          </g>
        </g>;
      })}
    </svg>
    <p className="text-xs text-muted-foreground">White evaluation in pawns, clipped at ±10 for display. Diamonds mark mate; hollow points are unanalyzed. Mate is not assigned a centipawn value.</p>
    <label className="block text-sm">Navigate evaluation graph<select aria-label="Navigate evaluation graph" className="mt-1 h-9 w-full rounded-md border bg-background px-2" value={active < 0 ? "" : plan[active].ply} onChange={(event) => { const item = plan.find((position) => position.ply === Number(event.target.value)); if (item) select(item.treePath); }}>
      {active < 0 && <option value="">Select a position</option>}
      {points.map(({ position, score }) => <option key={position.ply} value={position.ply}>Ply {position.ply} · {position.label} · {score ? formatScore(score) : "Unanalyzed"}</option>)}
    </select></label>
    {plan.length > 100 && <nav aria-label="Evaluation history pages" className="flex flex-wrap items-center gap-2"><button className="rounded border px-3 py-2 text-sm disabled:opacity-50" disabled={!offset} onClick={() => select(plan[offset - 100].treePath)}>Earlier positions</button><span className="text-xs">{offset + 1}–{Math.min(plan.length, offset + 100)} of {plan.length}</span><button className="rounded border px-3 py-2 text-sm disabled:opacity-50" disabled={offset + 100 >= plan.length} onClick={() => select(plan[offset + 100].treePath)}>Later positions</button></nav>}
  </div>;
});
