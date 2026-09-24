"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo } from "react";
import { ArrowLeft, ArrowRight, ChevronFirst, ChevronLast, Crown, FlipVertical2, LockKeyhole, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SettingsDialog } from "@/components/settings-dialog";
import { gameStatus } from "@/lib/game";
import { panelOrder, workspacePosition } from "@/lib/workspace-position";
import { PlayerPanel } from "./player-panel";
import { useWorkspace } from "@/store/workspace";
import { PgnImportDialog } from "@/components/pgn-import-dialog";
import { GameLibrary } from "@/components/game-library";
import { ImportedGameViewer } from "@/components/imported-game-viewer";
import { PlatformImportDialog } from "@/components/platform-import-dialog";
import { AnalysisPanel } from "@/components/analysis-panel";
import { GameAnalysisPanel } from "@/components/game-analysis-panel";
import { connectAnalysis, useAnalysis } from "@/store/analysis";
import { useGameAnalysis } from "@/store/game-analysis";

const GameBoard = dynamic(() => import("@/components/game-board").then((module) => module.GameBoard), {
  ssr: false,
  loading: () => <div role="status" className="flex aspect-square items-center justify-center rounded-md border bg-muted text-muted-foreground">Loading board…</div>,
});

export function Workspace() {
  const game = useWorkspace((state) => state.game);
  const imported = useWorkspace((state) => state.imported);
  const closeGame = useWorkspace((state) => state.closeGame);
  const orientation = useWorkspace((state) => state.orientation);
  const goTo = useWorkspace((state) => state.goTo);
  const reset = useWorkspace((state) => state.reset);
  const flip = useWorkspace((state) => state.flip);
  const hydratePreferences = useWorkspace((state) => state.hydratePreferences);
  const storageError = useWorkspace((state) => state.storageError);
  const navigationPaths = useWorkspace((state) => state.navigationPaths);
  const { chess, players } = useMemo(() => workspacePosition(game, imported, navigationPaths), [game, imported, navigationPaths]);
  const [top, bottom] = panelOrder(orientation);
  const status = gameStatus(chess);
  useEffect(() => { hydratePreferences(); }, [hydratePreferences]);
  useEffect(() => connectAnalysis(), []);
  useEffect(() => {
    const hidden = () => {
      if (document.visibilityState !== "hidden") return;
      if (useAnalysis.getState().enabled) { useAnalysis.getState().stop(); useAnalysis.setState({ error: "Analysis paused while this tab was hidden. Resume when you are ready." }); }
      if (useGameAnalysis.getState().busy) void useGameAnalysis.getState().pause();
    };
    document.addEventListener("visibilitychange", hidden);
    return () => document.removeEventListener("visibilitychange", hidden);
  }, []);

  return (
    <div className="min-h-screen">
      <header className="border-b bg-card/50">
        <div className="mx-auto flex max-w-[1360px] flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary"><Crown size={23} /></div>
            <div><p className="text-lg font-semibold tracking-tight">Chess Review</p><p className="text-xs tracking-wide text-muted-foreground">YOUR LOCAL WORKSPACE</p></div>
          </div>
          <div className="flex items-center gap-5">
            <span className="hidden items-center gap-2 text-sm text-muted-foreground sm:flex"><span className="size-1.5 rounded-full bg-primary" /> Local & private</span>
            <SettingsDialog />
          </div>
        </div>
      </header>

      <main id="workspace-main" className="mx-auto max-w-[1360px] px-4 py-6 sm:px-8 sm:py-8">
        <div className="mb-7 flex flex-wrap items-center justify-between gap-5">
          <div className="flex items-center gap-3"><h1 className="text-2xl font-semibold tracking-tight">Workspace</h1><span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">{imported ? "Game viewer" : "Free play"}</span></div>
          <div className="flex flex-wrap gap-2" aria-label="Import actions">
            <PlatformImportDialog platform="chesscom" />
            <PlatformImportDialog platform="lichess" />
            <PgnImportDialog />
          </div>
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(320px,1fr)] xl:gap-9">
          <section aria-label="Chess board" className="min-w-0 lg:sticky lg:top-6">
            <div className="mx-auto max-w-[660px]">
              <div className="mb-3" data-testid="top-player"><PlayerPanel player={players[top]} /></div>
              <GameBoard />
              <div className="mt-3" data-testid="bottom-player"><PlayerPanel player={players[bottom]} /></div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground">Standard chess</span>
                <p role="status" data-testid="game-status" className={`text-sm font-medium ${chess.isCheck() ? "text-rose-300" : "text-primary"}`}>{status}</p>
              </div>
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-2.5">
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" aria-label={imported ? "First position" : "Go to start"} disabled={game.cursor === 0} onClick={() => goTo(0)}><ChevronFirst /></Button>
                  <Button variant="ghost" size="icon" aria-label={imported ? "Previous move" : "Undo move"} disabled={game.cursor === 0} onClick={() => goTo(game.cursor - 1)}><ArrowLeft /></Button>
                  <Button variant="ghost" size="icon" aria-label={imported ? "Next move" : "Redo move"} disabled={game.cursor === game.moves.length} onClick={() => goTo(game.cursor + 1)}><ArrowRight /></Button>
                  <Button variant="ghost" size="icon" aria-label={imported ? "Last move" : "Go to latest move"} disabled={game.cursor === game.moves.length} onClick={() => goTo(game.moves.length)}><ChevronLast /></Button>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" onClick={flip}><FlipVertical2 /> Flip</Button>
                  {imported ? <Button variant="ghost" onClick={closeGame}>Free play</Button> : <Button variant="ghost" disabled={!game.moves.length} onClick={reset}><RotateCcw /> Reset</Button>}
                </div>
              </div>
            </div>
          </section>

          <aside className="grid min-w-0 grid-cols-1 gap-5" aria-label="Game workspace panels">
            {imported ? <ImportedGameViewer /> : <section className="overflow-hidden rounded-xl border bg-card" aria-labelledby="moves-heading">
              <div className="flex items-center justify-between border-b px-5 py-4"><h2 id="moves-heading" className="font-semibold">Moves</h2><span className="font-mono text-xs text-muted-foreground">{game.cursor} / {game.moves.length} ply</span></div>
              {!game.moves.length ? (
                <div className="flex min-h-[200px] flex-col items-center justify-center px-6 py-8 text-center">
                  <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-secondary text-muted-foreground"><Crown size={22} /></div>
                  <p className="text-sm font-medium">Your first move starts here</p>
                  <p className="mt-2 max-w-[250px] text-sm leading-relaxed text-muted-foreground">Play either side. Your moves will appear here as you explore.</p>
                </div>
              ) : (
                <div className="max-h-[300px] min-h-[200px] overflow-y-auto p-3" aria-label="Move history">
                  {Array.from({ length: Math.ceil(game.moves.length / 2) }, (_, index) => (
                    <div key={index} className="grid grid-cols-[2.5rem_1fr_1fr] items-center gap-1 rounded-md px-1 py-0.5 even:bg-background/40">
                      <span className="pl-2 font-mono text-sm text-muted-foreground">{index + 1}.</span>
                      {[index * 2, index * 2 + 1].map((ply) => game.moves[ply] ? (
                        <Button key={ply} variant="ghost" className={`justify-start font-mono ${game.cursor === ply + 1 ? "bg-primary/15 text-primary" : ""}`} aria-current={game.cursor === ply + 1 ? "step" : undefined} aria-label={`Go to move ${index + 1}, ${ply % 2 === 0 ? "White" : "Black"}: ${game.moves[ply].san}`} onClick={() => goTo(ply + 1)}>{game.moves[ply].san}</Button>
                      ) : <span key={ply} />)}
                    </div>
                  ))}
                </div>
              )}
              <div className="border-t px-5 py-3 text-xs text-muted-foreground">{game.cursor < game.moves.length ? "Playing a new move here replaces the moves ahead." : "Select a move to revisit its position."}</div>
            </section>}

            <GameAnalysisPanel />
            <AnalysisPanel />

            <GameLibrary />
          </aside>
        </div>
        {storageError && <p role="alert" className="mt-5 text-sm text-destructive">{storageError}</p>}
        <footer className="mt-8 flex items-center gap-2 border-t pt-5 text-xs text-muted-foreground"><LockKeyhole size={13} /> No account needed. Board preferences are saved on this device.</footer>
      </main>
    </div>
  );
}
