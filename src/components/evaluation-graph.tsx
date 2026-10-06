"use client";
import { GlassSelect } from "./ui/glass-select";

import { memo, useId } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { NodePath } from "@/lib/pgn/domain";
import { formatScore } from "@/lib/engine/normalize";
import type { PlannedPosition, PositionAnalysis } from "@/lib/game-analysis/domain";

/** Renders committed records only. No subscription to streamed engine output. */
export const EvaluationGraph = memo(function EvaluationGraph({ plan, records, selectedPath, select }: {
  plan: PlannedPosition[]; records: PositionAnalysis[]; selectedPath: NodePath; select: (path: NodePath) => void;
}) {
  const gradient = useId().replaceAll(":", "");
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
  const currentScore = active >= 0 ? byPly.get(plan[active].ply)?.scoreBefore : null;
  return <div className="space-y-2" aria-label="Evaluation history">
    <div className="review-chart"><svg viewBox="0 0 600 195" preserveAspectRatio="none" className="w-full" role="group" aria-label="White evaluation by ply" data-testid="evaluation-graph">
      <defs><linearGradient id={`${gradient}-positive`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#22c8ee" stopOpacity=".28" /><stop offset="1" stopColor="#22c8ee" stopOpacity="0" /></linearGradient><linearGradient id={`${gradient}-negative`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#ffbd25" stopOpacity="0" /><stop offset="1" stopColor="#ffbd25" stopOpacity=".28" /></linearGradient><clipPath id={`${gradient}-above`}><rect x="45" y="0" width="510" height="90" /></clipPath><clipPath id={`${gradient}-below`}><rect x="45" y="90" width="510" height="90" /></clipPath></defs>
      <line x1="45" x2="555" y1="90" y2="90" stroke="currentColor" opacity="0.35" strokeDasharray="3 3" />
      <text x="2" y="34" fill="currentColor" fontSize="11">+10</text><text x="9" y="94" fill="currentColor" fontSize="11">0</text><text x="2" y="154" fill="currentColor" fontSize="11">−10</text>
      <text x="43" y="190" fill="currentColor" fontSize="14">Ply {visible[0]?.ply}</text><text x="510" y="190" fill="currentColor" fontSize="14">Ply {visible.at(-1)?.ply}</text>
      {points.map((point, index) => {
        const previous = points[index - 1], selected = index + offset === active;
        const label = `Ply ${point.position.ply}: ${point.score ? formatScore(point.score) : "Unanalyzed"}. ${point.position.label}`;
        return <g key={point.position.ply}>
          {previous?.score && point.score && <>{["above", "below"].map((half, i) => <g key={half} clipPath={`url(#${gradient}-${half})`}><path d={`M ${previous.x} 90 L ${previous.x} ${previous.y} L ${point.x} ${point.y} L ${point.x} 90 Z`} fill={`url(#${gradient}-${i ? "negative" : "positive"})`} /><line x1={previous.x} y1={previous.y} x2={point.x} y2={point.y} stroke={i ? "#ffbd25" : "#22c8ee"} strokeWidth="2" /></g>)}</>}
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
              : <circle cx={point.x} cy={point.y} r={selected ? 4 : 2} fill={point.score ? point.y > 90 ? "#ffbd25" : "#22c8ee" : "#18252b"} stroke={selected ? "white" : point.score ? point.y > 90 ? "#ffbd25" : "#22c8ee" : "#a6afb9"} strokeWidth="1" strokeDasharray={point.score ? undefined : "2 2"} />}
          </g>
        </g>;
      })}
    </svg></div>
    <p className="text-xs text-muted-foreground">White evaluation in pawns, clipped at ±10 for display. Diamonds mark mate; hollow points are unanalyzed. Mate is not assigned a centipawn value.</p>
    <div className="review-graph-controls"><button aria-label="Previous graph position" disabled={active <= 0} onClick={() => select(plan[active - 1].treePath)}><ChevronLeft size={18} /></button><label className="min-w-0 flex-1"><span className="sr-only">Navigate evaluation graph</span><GlassSelect aria-label="Navigate evaluation graph" className="h-9 w-full rounded-md border bg-background px-2" value={active < 0 ? "" : plan[active].ply} onValueChange={(value) => { const item = plan.find((position) => position.ply === Number(value)); if (item) select(item.treePath); }}>
      {active < 0 && <option value="">Select a position</option>}
      {points.map(({ position, score }) => <option key={position.ply} value={position.ply}>Ply {position.ply} · {position.label} · {score ? formatScore(score) : "Unanalyzed"}</option>)}
    </GlassSelect></label><button aria-label="Next graph position" disabled={active >= plan.length - 1} onClick={() => select(plan[Math.max(0, active + 1)].treePath)}><ChevronRight size={18} /></button><span className="review-advantage">Evaluation: <strong>{currentScore ? formatScore(currentScore) : "—"}</strong></span></div>
    {plan.length > 100 && <nav aria-label="Evaluation history pages" className="flex flex-wrap items-center gap-2"><button className="rounded border px-3 py-2 text-sm disabled:opacity-50" disabled={!offset} onClick={() => select(plan[offset - 100].treePath)}>Earlier positions</button><span className="text-xs">{offset + 1}–{Math.min(plan.length, offset + 100)} of {plan.length}</span><button className="rounded border px-3 py-2 text-sm disabled:opacity-50" disabled={offset + 100 >= plan.length} onClick={() => select(plan[offset + 100].treePath)}>Later positions</button></nav>}
  </div>;
});
