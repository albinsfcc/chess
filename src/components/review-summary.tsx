"use client";
import { useMemo } from "react";
import { useGameAnalysis } from "@/store/game-analysis";
import { useWorkspace } from "@/store/workspace";
import { useOpenings } from "@/store/openings";
import { useReviewDialog } from "@/store/game-review";
import { fullReview, REVIEW_LABELS, reviewSummary } from "@/lib/game-analysis/review-summary";
import { MoveStrengthIcon } from "./move-strength-icon";
import { EvaluationGraph } from "./evaluation-graph";

export function ReviewSummary() {
  const { positions, plan, selected } = useGameAnalysis(), imported = useWorkspace((state) => state.imported);
  const path = useWorkspace((state) => state.selectedPath), select = useWorkspace((state) => state.selectNode);
  const index = useOpenings((state) => state.index);
  const summary = useMemo(() => imported && selected?.status === "completed" ? reviewSummary(plan, positions, imported.game.id, index ?? undefined) : null, [plan, positions, imported, selected?.status, index]);
  if (!imported || !summary) return null;
  return <div className="min-w-0 space-y-4" aria-label="Game review summary">
    <EvaluationGraph plan={plan} records={positions} selectedPath={path} select={select} />
    <h2 className="text-center text-xl font-semibold">Game review</h2>
    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
      {(["w", "b"] as const).map((side, i) => <div key={side} className="contents">
        {i === 1 && <span className="text-sm text-muted-foreground">{imported.game.result}</span>}
        <div className="min-w-0 rounded-lg border p-3 text-center"><p className="break-words text-sm font-medium">{side === "w" ? imported.game.white || "White" : imported.game.black || "Black"}</p><p className="text-xs text-muted-foreground">{side === "w" ? "White" : "Black"}</p><p className="text-2xl font-semibold tabular-nums" aria-label={`${side === "w" ? "White" : "Black"} accuracy`}>{summary[side].accuracy?.toFixed(1) ?? "—"}</p><p className="text-xs text-muted-foreground">Accuracy (estimate)</p></div>
      </div>)}
    </div>
    <table className="w-full table-fixed text-sm" aria-label="Move classifications by player"><thead><tr><th className="w-12 py-2">White</th><th>Move strength</th><th className="w-12">Black</th></tr></thead><tbody>{REVIEW_LABELS.map((label) => <tr key={label}><td className="py-1 text-center tabular-nums">{summary.w.counts[label] ?? 0}</td><th scope="row" className="py-1 font-normal"><span className="inline-flex items-center gap-2"><MoveStrengthIcon label={label} />{label}</span></th><td className="py-1 text-center tabular-nums">{summary.b.counts[label] ?? 0}</td></tr>)}</tbody></table>
    <p className="text-xs text-muted-foreground">{summary.w.graded + summary.b.graded} / {summary.w.total + summary.b.total} moves graded · {selected?.engineVersion} · {selected?.configuration.preset} · {selected?.configuration.multiPv} lines</p>
    <details className="text-xs text-muted-foreground"><summary>How accuracy is calculated</summary><p className="mt-2">Local estimate: average of 100 × exp(−5 × estimated expected-points loss) per move. Uses the same-position engine line when available. Engine-top moves score 100. Losing or allowing a forced mate scores 0; other mate transitions score 100. Mate distances are never converted to pawns. Missing results show —. This is not Chess.com accuracy; shallow searches can change after deeper review.</p></details>
  </div>;
}
export function ReviewSummaryCard() {
  const session = useGameAnalysis((state) => state.selected), imported = useWorkspace((state) => state.imported);
  const open = useReviewDialog((state) => state.open);
  if (open || !imported || session?.status !== "completed" || !fullReview(session, imported.game.id, imported.tree.mainLine.length)) return null;
  return <section className="min-w-0 rounded-xl border bg-card p-4" aria-label="Game review card"><ReviewSummary /></section>;
}
