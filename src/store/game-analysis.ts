import { create } from "zustand";
import { gamesRepository } from "@/lib/db/games";
import type { GameAnalysis, GameAnalysisConfig, PlannedPosition, PositionAnalysis } from "@/lib/game-analysis/domain";
import { generatePositions, positionRange, validateAssociations } from "@/lib/game-analysis/positions";
import { GameAnalysisRepository } from "@/lib/game-analysis/repository";
import { gameAnalysisQueue, type QueueEvent } from "@/lib/game-analysis/queue";
import { annotatedPgn } from "@/lib/game-analysis/export";
import { useWorkspace, variationsSaved } from "./workspace";
import { useAnalysis } from "./analysis";
import { useLibrary } from "./library";

type ReviewState = {
  gameId: string | null; sessions: GameAnalysis[]; recent: GameAnalysis[]; selected: GameAnalysis | null;
  positions: PositionAnalysis[]; plan: PlannedPosition[]; busy: boolean; active: GameAnalysis | null; loading: boolean; error: string | null;
  load: (gameId: string | null) => Promise<void>; open: (id: string) => Promise<void>; showGame: (id: string) => Promise<void>;
  start: (branch: GameAnalysis["selectedTreePath"], configuration: GameAnalysisConfig) => Promise<void>;
  resume: () => Promise<void>; pause: () => Promise<void>; cancel: () => Promise<void>; exportPgn: () => Promise<void>;
};
let loadSerial = 0, openSerial = 0;
let recovery: Promise<void> | null = null;
const repository = () => new GameAnalysisRepository();
function message(error: unknown) {
  if (error instanceof Error && /MissingAPI|Quota|DatabaseClosed|OpenFailed|Security|InvalidState|UnknownError/.test(error.name)) return "Saved analysis is unavailable. Check browser storage permissions and available space, then reload to retry. Previously saved results are kept.";
  return error instanceof Error ? error.message : "Analysis storage is unavailable. Check browser storage and retry.";
}
function runner() { return gameAnalysisQueue(onQueueEvent); }
function onQueueEvent(event: QueueEvent) {
  if (event.type === "busy") useGameAnalysis.setState({ busy: event.busy });
  else if (event.type === "error") useGameAnalysis.setState({ error: event.message });
  else {
    const state = useGameAnalysis.getState();
    useGameAnalysis.setState({ active: event.session,
      sessions: state.gameId === event.session.gameId ? [event.session, ...state.sessions.filter((row) => row.id !== event.session.id)] : state.sessions,
      recent: [event.session, ...state.recent.filter((row) => row.id !== event.session.id)].slice(0, 30) });
    if (state.gameId === event.session.gameId && (!state.selected || state.selected.id === event.session.id)) void state.open(event.session.id);
    if (event.session.completedPositions === 1 || event.session.status === "completed") void useLibrary.getState().refresh();
  }
}
export const useGameAnalysis = create<ReviewState>((set, get) => ({
  gameId: null, sessions: [], recent: [], selected: null, positions: [], plan: [], busy: false, active: null, loading: false, error: null,
  load: async (gameId) => {
    const token = ++loadSerial; openSerial++; set({ gameId, sessions: [], selected: null, positions: [], plan: [], loading: true, error: null });
    try {
      recovery ??= runner().recover().catch((error: unknown) => { set({ error: message(error) }); });
      await recovery;
      const recent = await repository().recent(); if (token !== loadSerial) return; set({ recent });
      if (gameId) {
        const { sessions, corrupt } = await repository().list(gameId); if (token !== loadSerial) return;
        set({ sessions, ...(corrupt ? { error: `${corrupt} corrupt session(s) could not be opened. Start a new analysis to reuse intact cached positions.` } : {}) });
        if (sessions.length) await get().open(sessions[0].id);
      }
    } catch (error) { if (token === loadSerial) set({ error: message(error) }); }
    finally { if (token === loadSerial) set({ loading: false }); }
  },
  open: async (id) => {
    const token = ++openSerial;
    try {
      const session = await repository().get(id);
      // A session's immutable plan is reused for progress commits, not reconstructed per position.
      const plan = get().selected?.id === id && get().plan.length ? get().plan : positionRange(generatePositions((await gamesRepository().get(session.gameId)).tree, session.selectedTreePath), session.configuration);
      const positions = await repository().positions(id);
      validateAssociations(session, plan, positions);
      if (token !== openSerial || session.gameId !== get().gameId) return;
      if (get().selected?.id !== id) { useAnalysis.getState().stop(); useAnalysis.setState({ result: null }); }
      set({ selected: session, positions, plan });
    } catch (error) { if (token === openSerial) set({ error: message(error), selected: null, positions: [], plan: [] }); }
  },
  showGame: async (id) => {
    try { const session = await repository().get(id); useWorkspace.getState().openGame(await gamesRepository().get(session.gameId)); await get().load(session.gameId); await get().open(id); }
    catch (error) { set({ error: message(error) }); }
  },
  start: async (branch, configuration) => {
    const document = useWorkspace.getState().imported; if (!document) return;
    if (get().busy) { set({ error: "Pause the current queue before starting another analysis." }); return; }
    useAnalysis.getState().stop(); useAnalysis.setState({ result: null });
    set({ selected: null, positions: [], plan: [], error: null });
    try { await variationsSaved(); await runner().start(document.game.id, branch, configuration); }
    catch (error) { set({ error: message(error) }); }
  },
  resume: async () => {
    const session = get().selected; if (!session) return;
    useAnalysis.getState().stop(); useAnalysis.setState({ result: null }); set({ error: null });
    try { await runner().resume(session.id); } catch (error) { set({ error: message(error) }); }
  },
  pause: async () => { try { await runner().pause(); } catch (error) { set({ error: message(error) }); } },
  cancel: async () => { try { await runner().cancel(get().selected?.id); } catch (error) { set({ error: message(error) }); } },
  exportPgn: async () => {
    const session = get().selected; if (!session) return;
    try {
      const document = await gamesRepository().get(session.gameId), positions = await repository().positions(session.id);
      const blob = new Blob([annotatedPgn(document, session, positions)], { type: "application/x-chess-pgn;charset=utf-8" });
      const url = URL.createObjectURL(blob); const anchor = documentForDownload();
      anchor.href = url; anchor.download = `chess-review-${session.id}.pgn`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { set({ error: message(error) }); }
  },
}));
function documentForDownload() { return document.createElement("a"); }
