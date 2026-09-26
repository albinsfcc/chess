"use client";
import { useComputer } from "@/store/computer";
import { useEffect } from "react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { PRESETS } from "@/lib/engine/domain";
import { fullReview } from "@/lib/game-analysis/review-summary";
import { useWorkspace } from "@/store/workspace";
import { useAnalysis } from "@/store/analysis";
import { useGameAnalysis } from "@/store/game-analysis";
import { connectReviewDialog, useReviewDialog } from "@/store/game-review";
import { ReviewSummary } from "./review-summary";
export function GameAnalysisDialog({ onReviewStart }: { onReviewStart?: () => void } = {}) {
  const imported = useWorkspace((state) => state.imported), review = useGameAnalysis(), dialog = useReviewDialog();
  const preferences = useAnalysis((state) => state.preferences);
  const { open, gameId, close } = dialog;
  useEffect(() => connectReviewDialog(), []);
  useEffect(() => { if (open && imported?.game.id !== gameId) close(); }, [imported?.game.id, open, gameId, close]);
  useEffect(() => {
    if (!imported || dialog.pendingGameId !== imported.game.id) return;
    const timer = setTimeout(() => { useReviewDialog.setState({pendingGameId: null}); void useReviewDialog.getState().opening(); }, 0);
    return () => clearTimeout(timer);
  }, [imported, dialog.pendingGameId]);
  if (!imported) return null;
  const session = fullReview(review.selected, imported.game.id, imported.tree.mainLine.length) ? review.selected : null;
  const completed = !dialog.preparing && session?.status === "completed";
  const total = imported.tree.mainLine.length + 1;
  return <>
    {dialog.automaticGameId !== imported.game.id && <Button disabled={review.busy || !imported.tree.playable || dialog.preparing} onClick={() => void dialog.opening()}>Review game</Button>}
    {dialog.automaticGameId === imported.game.id && !dialog.open && !review.busy && !dialog.preparing && session?.status !== "completed" && <Button onClick={() => void dialog.opening()}>Resume review</Button>}
    <Dialog open={dialog.open} onOpenChange={(open) => { if (!open) dialog.close(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg" onCloseAutoFocus={(event) => { event.preventDefault(); document.querySelector<HTMLElement>('[aria-label="Game workspace panels"]')?.focus(); }}>
        <DialogHeader><DialogTitle>{completed ? "Review ready" : "Reviewing game"}</DialogTitle><DialogDescription>{completed ? "Your full main-line review is ready. Start review to explore it beside the board." : imported.game.source === "computer" ? "Preparing the analysis collected during play. Only missing positions need a search. Closing this window saves progress." : "Reviewing every move locally, from the starting position through the final position. Closing this window pauses the review and saves progress."}</DialogDescription></DialogHeader>
        {completed ? <><ReviewSummary /><Button onClick={() => { useWorkspace.getState().selectNode([]); dialog.close(); onReviewStart?.(); document.querySelector('[aria-label="Game workspace panels"]')?.scrollTo({ top: 0 }); }}>Start review</Button></> : <>
          <p role="status" data-testid="review-progress">{session?.completedPositions ?? 0} / {total} positions · {review.busy ? "running" : session?.status ?? "preparing"}</p>
          <progress className="h-2 w-full accent-primary" value={session?.completedPositions ?? 0} max={total} aria-label="Game review progress" />
          <p className="text-sm" aria-label="Approximate workload">Approximate remaining search time: {((total - (session?.completedPositions ?? 0)) * PRESETS[session?.configuration.preset ?? preferences.preset] / 1000).toFixed(1)} seconds. Cached positions may finish sooner.</p>
          <p className="text-xs text-muted-foreground">Preset and number of engine lines are configured in Settings. Paused reviews resume automatically while this window is open and the tab is visible.</p>
          {(review.error || session?.status === "failed") && <><p role="alert" className="text-sm text-destructive">{review.error ?? session?.lastError ?? "Review interrupted. Saved results are safe."}</p><Button disabled={review.busy} onClick={() => void dialog.retry()}>Retry review</Button></>}
          <Button variant="outline" onClick={dialog.close}>Close and pause</Button>
        </>}
        {imported.game.source === "computer" && <div className="flex gap-2"><Button variant="outline" onClick={() => { dialog.close(); void useComputer.getState().start(useComputer.getState().bot, useComputer.getState().human === "w" ? "white" : "black"); }}>Play again</Button><Button variant="ghost" onClick={() => useComputer.getState().exit()}>Return to workspace</Button></div>}
      </DialogContent>
    </Dialog>
  </>;
}
