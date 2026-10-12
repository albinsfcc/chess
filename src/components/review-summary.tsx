"use client";
import { useMemo } from "react";
import { useGameAnalysis } from "@/store/game-analysis";
import { useWorkspace } from "@/store/workspace";
import { useOpenings } from "@/store/openings";
import { useReviewDialog } from "@/store/game-review";
import { fullReview, REVIEW_LABELS, REVIEW_PHASES, reviewSummary } from "@/lib/game-analysis/review-summary";
import { Crown } from "lucide-react";
import { MoveStrengthIcon } from "./move-strength-icon";
import { EvaluationGraph } from "./evaluation-graph";

export function ReviewSummary({ compact = false }: { compact?: boolean } = {}) {
  const { positions, plan, selected } = useGameAnalysis(), imported = useWorkspace((state) => state.imported);
  const path = useWorkspace((state) => state.selectedPath), select = useWorkspace((state) => state.selectNode);
  const index = useOpenings((state) => state.index);
  const summary = useMemo(() => imported && selected?.status === "completed" ? reviewSummary(plan, positions, imported.game.id, index ?? undefined) : null, [plan, positions, imported, selected?.status, index]);
  if (!imported || !summary) return null;
  const plies = imported.tree.mainLine.length, graded = summary.w.graded + summary.b.graded;
  const largestCount = Math.max(1, ...REVIEW_LABELS.flatMap(label => [summary.w.counts[label] ?? 0, summary.b.counts[label] ?? 0]));
  const depths = positions.map(row => row.depth).filter((depth): depth is number => depth !== null);
  return <div className="min-w-0 space-y-4" aria-label="Game review summary">
    {!compact && <section className="review-trend" aria-label="Evaluation trend"><div className="review-section-heading"><h3>Evaluation trend <span className="review-ply-count">({plies} plies · {Math.ceil(plies / 2)} moves)</span></h3><div className="review-legend"><span>White +</span><span>Black +</span></div></div><EvaluationGraph plan={plan} records={positions} selectedPath={path} select={select} /></section>}
    <section aria-label="Player performance">{!compact && <h3 className="review-section-heading">Player performance</h3>}
    <div className="review-players">
      {(["w", "b"] as const).map(side => {
        const winner = imported.game.result === (side === "w" ? "1-0" : "0-1"), loser = imported.game.result === (side === "w" ? "0-1" : "1-0");
        const bot = imported.game.source === "computer" && imported.game.headers.HumanColour !== (side === "w" ? "White" : "Black");
        return <div key={side} className="review-player" data-winner={winner}>
          <div className="review-player-heading"><span className="review-player-piece" data-side={side}><Crown size={20} aria-hidden="true" /></span><div className="min-w-0"><p className="review-player-name">{side === "w" ? imported.game.white || "White" : imported.game.black || "Black"} {bot && <span className="review-bot-tag">Bot</span>}</p><p className="text-sm text-muted-foreground">{side === "w" ? "White" : "Black"}</p></div><span className="review-outcome">{winner ? "● Winner" : loser ? "Defeat" : imported.game.result === "1/2-1/2" ? "Draw" : "Unfinished"}</span></div>
          <div className="review-accuracy"><p><strong aria-label={`${side === "w" ? "White" : "Black"} accuracy`}>{summary[side].accuracy?.toFixed(1) ?? "—"}</strong><span>%</span></p><span>Accuracy estimate</span></div>
          <div className="review-phases" title="Opening: first 10 moves. Endgame: at most 13 non-pawn material points. Middlegame: other positions. Each phase uses the existing accuracy calculation.">{REVIEW_PHASES.map(phase => {
            const value = summary[side].phases[phase], score = value.total && value.scored === value.total ? value.sum / value.scored : null;
            return <div key={phase}><p>{compact ? ({ Open: "Opening", Mid: "Middlegame", End: "Endgame" }[phase]) : phase}<span>{score === null ? "—" : `${Math.round(score)}%`}</span></p><div className="review-phase-track"><span style={{ width: `${score ?? 0}%` }} data-low={score !== null && score < 75} /></div></div>;
          })}</div>
        </div>;
      })}
      <span className="review-result">{imported.game.result}</span>
    </div></section>
    <section className="review-breakdown"><div className="review-section-heading"><h3>Move strength breakdown</h3><span>{graded} moves categorized</span></div>
    <table className="review-breakdown-table" aria-label="Move classifications by player"><thead><tr><th scope="col">White</th><th scope="col">Move classification</th><th scope="col">Black</th></tr></thead><tbody>{REVIEW_LABELS.map((label) => {
      const white = summary.w.counts[label] ?? 0, black = summary.b.counts[label] ?? 0;
      return <tr key={label} data-grade={label}>
        <td><div className="review-breakdown-side" data-side="w"><span className="review-breakdown-count">{white}</span><span className="review-breakdown-track" aria-hidden="true"><span style={{ width: `${white / largestCount * 100}%` }} /></span></div></td>
        <th scope="row"><span className="review-breakdown-label"><MoveStrengthIcon label={label} />{label}</span></th>
        <td><div className="review-breakdown-side" data-side="b"><span className="review-breakdown-track" aria-hidden="true"><span style={{ width: `${black / largestCount * 100}%` }} /></span><span className="review-breakdown-count">{black}</span></div></td>
      </tr>;
    })}</tbody></table></section>
    {!compact && <section className="review-engine-meta"><div><p><span className="review-engine-dot" />{selected?.engineVersion} · {depths.length ? `Depth ${Math.min(...depths)}–${Math.max(...depths)}` : selected?.configuration.preset} · {selected?.configuration.multiPv} lines</p><p>{graded} / {summary.w.total + summary.b.total} moves graded</p></div>
    <details className="text-xs text-muted-foreground"><summary>How accuracy is calculated</summary><p className="mt-2">Local estimate v2: arithmetic mean of 100 ? exp(?5 ? loss) over non-forced moves. Loss is the larger of expected-points loss and 0.5 ? centipawn loss / (800 + absolute starting evaluation), capped at 1. This keeps significant material errors visible in already winning or losing positions. Exact engine-top moves score 100; same-position MultiPV is preferred over adjacent searches. Missing a forced win has a minimum loss of 0.10; maintaining mate is not penalized for search-depth changes. Mate distances are never converted to pawns. Missing results show ?. This is not Chess.com accuracy; engine depth can change the assessment.</p></details>
    <p className="review-phase-note">Phase estimates: opening = first 10 moves; endgame = at most 13 non-pawn material points; middlegame = other positions. Unplayed or incomplete phases show —.</p></section>}
  </div>;
}
export function ReviewSummaryCard() {
  const session = useGameAnalysis((state) => state.selected), imported = useWorkspace((state) => state.imported);
  const open = useReviewDialog((state) => state.open);
  if (open || !imported || session?.status !== "completed" || !fullReview(session, imported.game.id, imported.tree.mainLine.length)) return null;
  return <section className="min-w-0 rounded-xl border bg-card p-4" aria-label="Game review card"><ReviewSummary /></section>;
}
