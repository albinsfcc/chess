"use client";

import { useMemo } from "react";
import { MessageCircle } from "lucide-react";
import { useWorkspace } from "@/store/workspace";
import { useAnalysis } from "@/store/analysis";
import { positionFen } from "@/lib/game";
import { explainPosition } from "@/lib/position-coach";
import { usePositionAnalysis } from "./use-position-analysis";
import { Button } from "./ui/button";

export function PositionCoach() {
  const game = useWorkspace(state => state.game);
  const fen = positionFen(game);
  const previousFen = game.cursor ? positionFen({ ...game, cursor: game.cursor - 1 }) : undefined;
  const result = usePositionAnalysis(fen);
  const status = useAnalysis(state => state.status);
  const error = useAnalysis(state => state.error);
  const report = useMemo(() => explainPosition(fen, result, previousFen), [fen, result, previousFen]);
  return <section className="min-w-0 space-y-5 rounded-xl border bg-card p-5" aria-labelledby="coach-heading">
    <div>
      <h2 id="coach-heading" className="flex items-center gap-2 font-semibold"><MessageCircle size={18} className="text-primary" />Position coach</h2>
      <p className="mt-2 text-sm leading-relaxed" data-testid="coach-summary">{report.summary}</p>
      <p className="mt-2 text-xs text-muted-foreground">Board observations and planning prompts. Engine candidates use the analysis for this position; deeper tactics and strategic advantages still need calculation.</p>
    </div>
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
      <h3 className="font-semibold">First, check the danger</h3>
      <p className="mt-2 leading-relaxed">{report.urgent}</p>
    </div>
    <div><h3 className="font-semibold">What changed?</h3><p className="mt-2 text-sm leading-relaxed">{report.changed}</p></div>
    {!report.terminal && <div className="space-y-3">
      <h3 className="font-semibold">Candidate moves and replies</h3>
      {report.candidates.length ? report.candidates.map(candidate => <article key={candidate.move} className="space-y-2 rounded-lg border p-3 text-sm">
        <h4 className="font-mono font-semibold text-primary">{candidate.move}</h4>
        <p>{candidate.explanation}</p><p>{candidate.reply}</p>
        <p className="break-words font-mono text-xs">{candidate.continuation}</p>
        <p className="text-xs text-muted-foreground">{candidate.evaluation}</p>
      </article>) : <p className="text-sm text-muted-foreground">Analyze this position to get engine candidates and the opponent’s best replies found in those lines.</p>}
      <Button variant="outline" disabled={status === "loading" || status === "analyzing"} onClick={() => useAnalysis.getState().start(true)}>{status === "loading" || status === "analyzing" ? "Analyzing…" : "Analyze this position"}</Button>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>}
    <div className="space-y-2"><h3 className="font-semibold">Understand the position</h3>
      {report.factors.map((factor, index) => <details key={factor.title} className="rounded-lg border p-3" open={index === 0 ? true : undefined}>
        <summary className="cursor-pointer text-sm font-medium">{factor.title}</summary>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{factor.explanation}</p>
      </details>)}
    </div>
    {!report.terminal && <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-semibold">Your five-step thinking routine</summary>
      <ol className="mt-3 list-decimal space-y-3 pl-5 text-sm leading-relaxed">{report.routine.map((step, index) => <li key={index}>{step}</li>)}</ol>
    </details>}
  </section>;
}
