import { useThreats } from "./threats";
import { create } from "zustand";
import { chessAt } from "@/lib/game";
import { engineClient } from "@/lib/engine/client";
import { defaultEnginePreferences, enginePreferencesSchema, ENGINE_PREFERENCES_KEY, type EnginePreferences, type EngineResult, type EngineStatus } from "@/lib/engine/domain";
import { AnalysisRepository } from "@/lib/engine/repository";
import { useWorkspace } from "./workspace";
import { classifyMove, type MoveAssessment } from "@/lib/game-analysis/move-quality";
import { bookContinuation } from "@/lib/openings";

type AnalysisState = {
  assessment: MoveAssessment | null;
  preferences: EnginePreferences; hydrated: boolean; enabled: boolean; status: EngineStatus; result: EngineResult | null;
  fen: string | null; error: string | null; storageError: string | null; version: string | null; cached: boolean;
  hydrate: () => void; updatePreferences: (patch: Partial<EnginePreferences>) => void;
  start: (assisted: boolean) => void; analyze: (force?: boolean) => Promise<void>; stop: () => void; restart: () => Promise<void>;
  positionChanged: (newGame?: boolean) => void;
};
let serial = 0;
async function assessLastMove(result: EngineResult, token: number) {
  const game = useWorkspace.getState().game;
  if (!game.cursor) return;
  try {
    const previous = chessAt({ ...game, cursor: game.cursor - 1 });
    const before = await new AnalysisRepository().get(previous.fen(), result.engineVersion, result.config);
    const move = game.moves[game.cursor - 1];
    const previousResult = game.cursor > 1 ? await new AnalysisRepository().get(chessAt({ ...game, cursor: game.cursor - 2 }).fen(), result.engineVersion, result.config) : null;
    const uci = `${move.from}${move.to}${move.promotion ?? ""}`;
    if (token === serial && before) useAnalysis.setState({ assessment: classifyMove(before, result, uci, { book: bookContinuation(before.fen, uci)?.name, previous: previousResult ?? undefined }) });
  } catch { /* Missing adjacent data leaves this move ungraded. */ }
}
function refreshThreats() {
  try { void useThreats.getState().update(useAnalysis.getState().preferences.showThreats ? currentPosition() : null); }
  catch { void useThreats.getState().update(null); }
}
function currentPosition() {
  const workspace = useWorkspace.getState();
  if (workspace.imported && (!workspace.imported.tree.playable || workspace.imported.game.analysisStatus === "unsupported")) throw new Error("This variant is unsupported. Stockfish analyzes standard chess only.");
  return chessAt(workspace.game).fen();
}
export const useAnalysis = create<AnalysisState>((set, get) => ({
  assessment: null,
  preferences: { ...defaultEnginePreferences }, hydrated: false, enabled: false, status: "stopped", result: null, fen: null, error: null, storageError: null, version: null, cached: false,
  hydrate: () => {
    if (get().hydrated) return;
    set({ hydrated: true });
    try {
      const raw = localStorage.getItem(ENGINE_PREFERENCES_KEY);
      if (raw) { const parsed = enginePreferencesSchema.safeParse(JSON.parse(raw)); if (parsed.success) set({ preferences: parsed.data }); }
    } catch { set({ storageError: "Engine preferences could not be read. Session settings are still available." }); }
  },
  updatePreferences: (patch) => {
    const parsed = enginePreferencesSchema.safeParse({ ...get().preferences, ...patch }); if (!parsed.success) return;
    const before = get().preferences;
    set({ preferences: parsed.data });
    try { localStorage.setItem(ENGINE_PREFERENCES_KEY, JSON.stringify(parsed.data)); set({ storageError: null }); }
    catch { set({ storageError: "Engine preferences could not be saved. They apply to this session." }); }
    if (before.showThreats !== parsed.data.showThreats) refreshThreats();
    if (get().enabled && (before.preset !== parsed.data.preset || before.multiPv !== parsed.data.multiPv || before.automatic !== parsed.data.automatic)) void get().analyze(true);
  },
  start: (assisted) => { get().hydrate(); set({ enabled: false }); get().updatePreferences({ automatic: assisted }); if (assisted) void get().analyze(); else get().stop(); },
  analyze: async (force = false) => {
    if (engineClient().reserved) { set({ error: "Pause the complete-game queue before using live analysis." }); return; }
    const token = ++serial;
    const client = engineClient(); client.stop();
    set({ enabled: true, error: null, result: null, cached: false, assessment: null });
    try {
      const fen = currentPosition(); const config = { preset: get().preferences.preset, multiPv: get().preferences.multiPv };
      set({ fen, status: "loading" });
      const version = await client.ready(); if (token !== serial) return;
      set({ version });
      if (!force) {
        try {
          const cached = await new AnalysisRepository().get(fen, version, config); if (token !== serial) return;
          if (cached) { set({ result: cached, status: "ready", cached: true }); void assessLastMove(cached, token); return; }
        } catch { set({ storageError: "Saved analysis is unavailable. Live analysis still works." }); }
      }
      if (token !== serial) return;
      const result = await client.analyze(fen, config); if (token !== serial) return;
      set({ result, status: "ready" });
      void assessLastMove(result, token);
      // Only complete current-position results are persisted, never raw UCI output.
      try { await new AnalysisRepository().save(result); }
      catch { set({ storageError: "Analysis completed, but could not be saved in browser storage." }); }
    } catch (error) {
      if (token !== serial || (error instanceof Error && error.name === "AbortError")) return;
      set({ status: "error", result: null, error: error instanceof Error ? error.message : "Analysis could not start." });
    }
  },
  stop: () => { serial++; engineClient().stop(); set({ enabled: false, status: "stopped" }); },
  restart: async () => {
    const token = ++serial; set({ enabled: false, result: null, error: null, status: "loading", assessment: null });
    try { await engineClient().restart(); if (token === serial) await get().analyze(true); }
    catch (error) { if (token === serial) set({ status: "error", error: error instanceof Error ? error.message : "Engine restart failed." }); }
  },
  positionChanged: (newGame = false) => {
    refreshThreats();
    serial++; const client = engineClient(); if (newGame) client.newGame(); else client.stop();
    set({ result: null, fen: null, cached: false, error: null, status: "stopped", assessment: null });
    if (get().enabled && get().preferences.automatic) void get().analyze();
  },
}));

/** Connect once at workspace mount; cleanup terminates the only worker. */
export function connectAnalysis(): () => void {
  const client = engineClient();
  const offEngine = client.subscribe((event) => {
    if (client.reserved) return;
    if (event.type === "result" && event.result.fen === useAnalysis.getState().fen) useAnalysis.setState({ result: event.result });
    else if (event.type === "status" && (useAnalysis.getState().enabled || event.status === "stopped" || event.status === "error")) useAnalysis.setState({ status: event.status });
    else if (event.type === "ready") useAnalysis.setState({ version: event.engineVersion });
    else if (event.type === "error") useAnalysis.setState({ error: event.message, status: "error", result: null, assessment: null });
  });
  const offWorkspace = useWorkspace.subscribe((next, previous) => {
    if (next.game === previous.game && next.imported === previous.imported) return;
    const newGame = next.imported?.game.id !== previous.imported?.game.id || (!next.imported && next.game.moves.length === 0 && previous.game.moves.length > 0);
    if (newGame || chessAt(next.game).fen() !== chessAt(previous.game).fen()) useAnalysis.getState().positionChanged(newGame);
  });
  useAnalysis.getState().hydrate(); refreshThreats();
  return () => { void useThreats.getState().update(null); offEngine(); offWorkspace(); useAnalysis.getState().stop(); client.terminate(); };
}
