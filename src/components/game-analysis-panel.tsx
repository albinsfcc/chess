"use client";
import { visibleLines } from "@/lib/engine/alternatives";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { EvaluationGraph } from "./evaluation-graph";
import { useGameAnalysis } from "@/store/game-analysis";
import { useWorkspace } from "@/store/workspace";
import { branchLabel } from "@/lib/game-analysis/domain";
import { changeDescription } from "@/lib/game-analysis/evaluation";
import { formatScore } from "@/lib/engine/normalize";
import { assessPosition } from "@/lib/game-analysis/move-quality";
import { useAnalysis } from "@/store/analysis";
import { MoveStrengthIcon } from "./move-strength-icon";
import { MoveStrengthLegend } from "./move-strength-legend";
import { usableResult } from "@/lib/engine/result-quality";
import { fullReview } from "@/lib/game-analysis/review-summary";
import { selectedBranch, generatePositions } from "@/lib/game-analysis/positions";
import { useOpenings } from "@/store/openings";

export function GameAnalysisPanel() {
  useOpenings((state) => state.index);
  const topMoves = useAnalysis((state) => state.preferences.multiPv);
  const review = useGameAnalysis(), document = useWorkspace((state) => state.imported);
  const path = useWorkspace((state) => state.selectedPath), select = useWorkspace((state) => state.selectNode);
  const gameId = document?.game.id ?? null;
  useEffect(() => { void useGameAnalysis.getState().load(gameId); }, [gameId]);
  const session = review.selected;
  const needsRepair = review.positions.some((row) => !usableResult(row.result));
  const current = review.positions.find((row) => row.treePath.join(".") === path.join("."));
  const played = path.length ? review.positions.find((row) => row.movePath?.join(".") === path.join(".")) : undefined;
  const assessment = played ? assessPosition(played, review.positions) : null;
  if (!document && !review.recent.length && !review.busy && !review.error) return null;
  return <section className="min-w-0 space-y-4 rounded-xl border bg-card p-5" aria-label="Complete-game analysis">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">Game analysis</h2></div>
    {document && path.length > 1 && <Button variant="outline" disabled={review.busy} onClick={() => { try { const branch = selectedBranch(path), endPly = generatePositions(document.tree, branch).length - 1; const {preset, multiPv} = useAnalysis.getState().preferences; void review.start(branch, {preset, multiPv, startPly: 0, endPly}); } catch (error) { useGameAnalysis.setState({error: error instanceof Error ? error.message : "This branch cannot be reviewed."}); } }}>Analyze selected variation</Button>}
    {review.loading && <p role="status" className="text-sm">Loading saved analysis…</p>}
    {review.busy && <p role="status" className="text-sm text-primary">Queue active{review.active ? ` · ${review.active.completedPositions}/${review.active.totalPositions} saved` : " · preparing engine"}. Board navigation remains available.</p>}
    {review.busy && (!session || review.active?.id !== session.id) && <Button variant="outline" onClick={() => void review.pause()}>Pause active queue</Button>}
    {!document && review.recent.length > 0 && <div className="space-y-2"><p className="text-sm text-muted-foreground">Saved sessions are available on this device. Reopen an incomplete session to Resume.</p>{review.recent.slice(0, 8).map((saved) => <Button className="h-auto w-full justify-start whitespace-normal text-left" variant="outline" key={saved.id} onClick={() => void review.showGame(saved.id)}>Open {branchLabel(saved.selectedTreePath)} analysis · {saved.completedPositions}/{saved.totalPositions} · {saved.status}</Button>)}</div>}
    {document && review.sessions.length > 0 && <label className="block text-sm">Saved analysis<select aria-label="Saved analysis" className="mt-1 h-10 w-full rounded-md border bg-background px-2" value={session?.id ?? ""} onChange={(event) => void review.open(event.target.value)}>{!session && <option value="">Choose a session</option>}{review.sessions.map((saved) => <option key={saved.id} value={saved.id}>{branchLabel(saved.selectedTreePath)} · {saved.configuration.preset} / {saved.configuration.multiPv} PV · {saved.completedPositions}/{saved.totalPositions} · {saved.status}</option>)}</select></label>}
    {document && !review.sessions.length && !review.loading && <p className="text-sm text-muted-foreground">Analyze the main line, or select a PGN variation and analyze that branch. Progress is saved after every position.</p>}
    {session && document?.game.id === session.gameId && <>
      <div className="space-y-2"><p data-testid="queue-progress" role="status" className="text-sm">{session.completedPositions} / {session.totalPositions} positions · {session.status}</p><progress className="h-2 w-full accent-primary" value={session.completedPositions} max={session.totalPositions} aria-label="Saved analysis progress" />
        <p className="break-words text-xs text-muted-foreground">{branchLabel(session.selectedTreePath)} · {session.engineVersion} · {session.configuration.preset} · MultiPV {session.configuration.multiPv} · plies {session.configuration.startPly}–{session.configuration.endPly}</p>
        <details className="text-xs text-muted-foreground"><summary>Configuration identity</summary><p className="break-all">{session.configurationHash}</p></details>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={!review.busy || review.active?.id !== session.id} onClick={() => void review.pause()}>Pause queue</Button>
        <Button disabled={review.busy || (session.status === "completed" && !needsRepair)} onClick={() => void review.resume()}>{needsRepair && session.status === "completed" ? "Repair missing grades" : "Resume queue"}</Button>
        <Button variant="outline" disabled={session.status === "completed" || session.status === "cancelled"} onClick={() => void review.cancel()}>Cancel queue</Button>
        <Button variant="ghost" disabled={!review.positions.length} onClick={() => void review.exportPgn()}>Export annotated PGN</Button>
      </div>
      <p className="text-xs text-muted-foreground">Cancelled sessions keep completed results and can be resumed explicitly. Closing this tab stops computation.</p>
      {session.lastError && <p role="alert" className="text-sm text-amber-200">{session.lastError}</p>}
      {!(session.status === "completed" && fullReview(session, document.game.id, document.tree.mainLine.length)) && <EvaluationGraph plan={review.plan} records={review.positions} selectedPath={path} select={select} />}
      {assessment && <p className="flex items-start gap-2 text-sm" aria-label="Move assessment"><MoveStrengthIcon label={assessment.label} className="size-7 shrink-0" /><span><strong>{assessment.label}</strong> — {assessment.reason}</span></p>}
      <MoveStrengthLegend />
      <details className="text-xs text-muted-foreground"><summary>How move labels work</summary><p>Every move in a completed full-line analysis receives a grade. Shallow completed searches receive provisional grades; only Brilliant and Great require depth 12. Book is a known local opening continuation; Forced is the only legal move; Missed Win means an actual mate in one was available but not played. Miss means an opponent-created winning chance returned to equal or worse. Best always includes the engine?s top move, regardless of adjacent-search drift. Brilliant also considers near-best piece/exchange sacrifices over six PV plies, while excluding established winning alternatives. Ordinary labels use estimated expected-points loss: Excellent ?2%, Good ?5%, Inaccuracy ?10%, Mistake ?20%, Blunder &gt;20%. The rating-neutral logistic conversion is our approximation, not Chess.com?s unpublished rating model. Mate transitions remain separate. Partial ranges, paused sessions and other branches still need analysis; missing data is never labeled as a bad move.</p></details>
      <div className="space-y-3 border-t pt-4" aria-label="Saved position analysis">
        {current ? <>
          <p className="text-sm">Ply {current.ply} · {current.label}{current.fromCache ? " · Reused cached position" : ""}</p>
          <div className="flex justify-between gap-2"><strong className="font-mono text-xl text-primary">{current.scoreBefore ? formatScore(current.scoreBefore) : "No score"}</strong><span className="text-xs text-muted-foreground">Depth {current.depth ?? "—"}</span></div>
          <p className="text-sm">Best move: <strong className="font-mono">{current.bestMoveSan ?? "No legal move"}</strong></p>
          {current.playedMoveSan && <p className="text-xs text-muted-foreground">Next recorded move: {current.playedMoveSan}</p>}
          <ol aria-label="Saved principal variations" className="space-y-2">{visibleLines(current.result, topMoves).map((line) => <li key={line.multiPv} className="rounded-md border p-3 text-sm"><div className="flex justify-between"><span className="font-mono text-primary">#{line.multiPv} · {line.lowerBound ? "≥ " : line.upperBound ? "≤ " : ""}{formatScore(line.score)}</span><span className="text-xs">Depth {line.depth}</span></div><p className="mt-2 break-words font-mono">{line.pvSan.join(" ") || "No continuation"}</p></li>)}</ol>
          <p className="text-xs text-muted-foreground">{current.nodes?.toLocaleString() ?? "—"} nodes · {current.elapsedMs ?? "—"} ms</p>
        </> : <p className="text-sm text-muted-foreground">This position is not analyzed in the selected session. Select a graph point or Resume to finish missing positions.</p>}
        {played && <div className="space-y-2 rounded-md border p-3 text-sm" aria-label="Played move evaluation"><p>Played move: <strong>{played.playedMoveSan}</strong></p><p>Before: {played.scoreBefore ? formatScore(played.scoreBefore) : "Pending"} · After: {played.scoreAfter ? formatScore(played.scoreAfter) : "Pending"}</p><p>{changeDescription(played.evaluationChange)}</p><p className="text-xs text-muted-foreground">Best alternative before this move: {played.bestMoveSan ?? "None"}</p></div>}
      </div>
    </>}
    {review.error && <p role="alert" className="break-words text-sm text-destructive">{review.error}</p>}
  </section>;
}
