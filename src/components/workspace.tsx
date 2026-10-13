"use client";

import { useFocusMode } from "./use-focus-mode";
import { ComputerGame, ComputerAssistance } from "./computer-game";
import { useComputer } from "@/store/computer";
import dynamic from "next/dynamic";
import { SoundEffects } from "./sound-effects";
import { useEffect, useMemo, useState } from "react";
import { Maximize2, Minimize2, ArrowLeft, ArrowRight, ChevronFirst, ChevronLast, Crown, FlipVertical2, LockKeyhole, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SettingsDialog } from "@/components/settings-dialog";
import { gameStatus } from "@/lib/game";
import { panelOrder, workspacePosition } from "@/lib/workspace-position";
import { useBoardFit } from "./use-board-fit";
import { useMoveNavigation } from "./use-move-navigation";
import { ImportActions } from "./import-actions";
import { PlayerPanel } from "./player-panel";
import { useWorkspace } from "@/store/workspace";
import { GameLibrary } from "@/components/game-library";
import { WorkspaceInspector, type InspectorSection } from "./workspace-inspector";
import { GameAnalysisDialog } from "./game-analysis-dialog";
import { ImportedGameViewer } from "@/components/imported-game-viewer";
import { AnalysisPanel } from "@/components/analysis-panel";
import { GameAnalysisPanel } from "@/components/game-analysis-panel";
import { connectAnalysis, useAnalysis } from "@/store/analysis";
import { useGameAnalysis } from "@/store/game-analysis";
import { ReviewSummaryCard } from "./review-summary";
import { OpeningPanel } from "./opening-panel";

const GameBoard = dynamic(() => import("@/components/game-board").then((module) => module.GameBoard), {
  ssr: false,
  loading: () => <div role="status" className="flex aspect-square items-center justify-center rounded-md border bg-muted text-muted-foreground">Loading board…</div>,
});

export function Workspace() {
  const { focused, toggle: toggleFocus } = useFocusMode();
  const computerSession = useComputer();
  const computer = computerSession.active;
  const [section, setSection] = useState<InspectorSection>("moves");
  const boardHost = useBoardFit();
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
  useMoveNavigation();
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
    <div className="workspace-shell min-h-screen" data-focus={focused}>
      <header className="workspace-header">
        <SoundEffects />
        <div className="mx-auto flex max-w-[1920px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary"><Crown size={23} /></div>
            <div><p className="text-lg font-semibold tracking-tight">Chess Review</p><h1 className="text-xs tracking-wide text-muted-foreground">Workspace</h1></div>
          </div>
          <div className="frost-toolbar flex flex-wrap items-center gap-2" aria-label="Import actions">
            <ComputerGame />
            {!computer && <ImportActions />}
            <SettingsDialog />
          </div>
        </div>
      </header>

      <main id="workspace-main" className="workspace-main mx-auto w-full max-w-[1920px] px-3 py-3 sm:px-5">
        <div className="workspace-grid grid items-start gap-4">
          <section ref={boardHost} aria-label="Chess board" className="workspace-board-area min-w-0">
            <div className="workspace-chess mx-auto w-full">
              <div data-board-chrome className="mb-2" data-testid="top-player"><PlayerPanel player={computer ? { ...players[top], name: top === computerSession.human ? "Human" : computerSession.bot.name } : players[top]} /></div>
              <GameBoard />
              <div data-board-chrome className="mt-2" data-testid="bottom-player"><PlayerPanel player={computer ? { ...players[bottom], name: bottom === computerSession.human ? "Human" : computerSession.bot.name } : players[bottom]} /></div>
              <div data-board-chrome className="mt-1 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">Standard chess</span>
                <p role="status" data-testid="game-status" className={`text-sm font-medium ${chess.isCheck() ? "text-rose-300" : "text-primary"}`}>{status}</p>
              </div>
              <div data-board-chrome data-testid="board-navigation" className="board-toolbar board-navigation mt-2 rounded-xl border p-2">
                {!computer && <><div className="board-mode-control">{imported ? <Button variant="outline" onClick={closeGame}>Free play</Button> : <Button variant="outline" disabled={!game.moves.length} onClick={reset}><RotateCcw /> Reset</Button>}</div>
                <div className="board-history-controls" aria-label="Position navigation">
                  <Button variant="ghost" size="icon" aria-label={imported ? "First position" : "Go to start"} disabled={game.cursor === 0} onClick={() => goTo(0)}><ChevronFirst /></Button>
                  <Button variant="ghost" size="icon" aria-label={imported ? "Previous move" : "Undo move"} disabled={game.cursor === 0} onClick={() => goTo(game.cursor - 1)}><ArrowLeft /></Button>
                  <Button variant="ghost" size="icon" aria-label={imported ? "Next move" : "Redo move"} disabled={game.cursor === game.moves.length} onClick={() => goTo(game.cursor + 1)}><ArrowRight /></Button>
                  <Button variant="ghost" size="icon" aria-label={imported ? "Last move" : "Go to latest move"} disabled={game.cursor === game.moves.length} onClick={() => goTo(game.moves.length)}><ChevronLast /></Button>
                </div>
                </>}
                <div className="board-view-controls"><Button className="board-flip-control" variant="outline" onClick={flip}><FlipVertical2 /> Flip</Button><Button className="focus-toggle" variant="outline" title={focused ? "Exit focus" : "Focus mode"} aria-label={focused ? "Exit focus" : "Focus mode"} aria-pressed={focused} onClick={toggleFocus}>{focused ? <Minimize2 /> : <Maximize2 />}<span className="focus-label">{focused ? "Exit focus" : "Focus mode"}</span></Button></div>
              </div>
            </div>
          </section>

          <aside className="workspace-panels grid min-w-0 grid-cols-1 gap-4" aria-label="Game workspace panels" tabIndex={0}>
            <WorkspaceInspector value={focused ? "moves" : section} onChange={setSection} actions={<GameAnalysisDialog onReviewStart={() => setSection("moves")} />} panels={{ moves: <>
            {computer ? !focused && section === "moves" && <ComputerAssistance /> : <ReviewSummaryCard />}
            {imported ? <ImportedGameViewer afterMoves={<ReviewSummaryCard part="details" />} /> : <section className="overflow-hidden rounded-xl border bg-card" aria-labelledby="moves-heading">
              <div className="flex items-center justify-between border-b px-5 py-4"><h2 id="moves-heading" className="font-semibold">Moves</h2><span className="font-mono text-xs text-muted-foreground">{game.cursor} / {game.moves.length} ply</span></div>
              {!game.moves.length ? (
                <div className="flex min-h-[200px] flex-col items-center justify-center px-6 py-8 text-center">
                  <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-secondary text-muted-foreground"><Crown size={22} /></div>
                  <p className="text-sm font-medium">Your first move starts here</p>
                  <p className="mt-2 max-w-[250px] text-sm leading-relaxed text-muted-foreground">Play either side. Your moves will appear here as you explore.</p>
                </div>
              ) : (
                <div className="p-3" aria-label="Move history">
                  {Array.from({ length: Math.ceil(game.moves.length / 2) }, (_, index) => (
                    <div key={index} className="grid grid-cols-[2.5rem_1fr_1fr] items-center gap-1 rounded-md px-1 py-0.5 even:bg-background/40">
                      <span className="pl-2 font-mono text-sm text-muted-foreground">{index + 1}.</span>
                      {[index * 2, index * 2 + 1].map((ply) => game.moves[ply] ? (
                        <Button key={ply} variant="ghost" className={`justify-start font-mono ${game.cursor === ply + 1 ? "bg-primary/15 text-primary" : ""}`} aria-current={game.cursor === ply + 1 ? "step" : undefined} aria-label={`Go to move ${index + 1}, ${ply % 2 === 0 ? "White" : "Black"}: ${game.moves[ply].san}`} onClick={() => goTo(ply + 1)} title={computerSession.feedback[ply + 1]?.assessment.reason}>{game.moves[ply].san}{computer && computerSession.feedback[ply + 1] && <span data-testid={`human-feedback-${ply + 1}`} className="ml-1 text-xs text-primary">{computerSession.feedback[ply + 1].assessment.label}</span>}</Button>
                      ) : <span key={ply} />)}
                    </div>
                  ))}
                </div>
              )}
              <div className="border-t px-5 py-3 text-xs text-muted-foreground">{game.cursor < game.moves.length ? "Playing a new move here replaces the moves ahead." : "Select a move to revisit its position."}</div>
            </section>}

            </>, opening: <OpeningPanel />, engine: computer ? section === "engine" && <ComputerAssistance /> : <><AnalysisPanel /><GameAnalysisPanel /></>, library: computer ? <p>Finish or exit the computer game to open your library.</p> : <GameLibrary onOpen={() => setSection("moves")} /> }} />

            {storageError && <p role="alert" className="text-sm text-destructive">{storageError}</p>}
            <footer className="flex items-center gap-2 border-t py-3 text-xs text-muted-foreground"><LockKeyhole size={13} /> Local and private. Games and preferences stay on this device.</footer>
          </aside>
        </div>
      </main>
    </div>
  );
}
