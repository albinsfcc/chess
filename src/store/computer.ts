import { create } from "zustand";
import { BOTS, botDelayMs, cancellableDelay, chooseBotMove, chooseOpeningMove, computerResult, FEEDBACK_HOLD_MS, OPENING_MULTI_PV, OPENING_VARIETY_PLIES, humanColor, type BotProfile, type Side } from "@/lib/computer";
import { chessAt, createGame, tryMove, type PromotionPiece, type GameState } from "@/lib/game";
import { engineClient } from "@/lib/engine/client";
import { ENGINE_BUILD, type AnalysisConfig, type EngineResult } from "@/lib/engine/domain";
import { usableResult, withTerminalScore } from "@/lib/engine/result-quality";
import { ComputerProgressRepository } from "@/lib/game-analysis/computer-progress";
import { classifyMove, type MoveAssessment } from "@/lib/game-analysis/move-quality";
import { evaluationChange, changeDescription } from "@/lib/game-analysis/evaluation";
import { bookContinuation } from "@/lib/openings";
import { AnalysisRepository } from "@/lib/engine/repository";
import { validatePgn } from "@/lib/pgn/validate";
import { gamesRepository } from "@/lib/db/games";
import { useWorkspace } from "./workspace";
import { useAnalysis } from "./analysis";
import { useGameAnalysis } from "./game-analysis";
import { useReviewDialog } from "./game-review";
import { useThreats } from "./threats";
import { useLibrary } from "./library";
import { useOpenings } from "./openings";

export type HumanFeedback = { assessment: MoveAssessment; bestMove: string | null; change: ReturnType<typeof evaluationChange> };
type State = {
  showFeedback: boolean; feedback: Record<number, HumanFeedback>; feedbackPly: number | null; positions: Record<number, EngineResult>; reviewConfig: AnalysisConfig;
  active: boolean; starting: boolean; assisted: boolean; thinking: boolean; reviewingMove: boolean; error: string | null;
  bot: BotProfile; human: "w" | "b"; result: string | null; id: string | null;
  start: (bot: BotProfile, side: Side, assisted?: boolean, random?: () => number, showFeedback?: boolean) => Promise<void>;
  setAssisted: (enabled: boolean) => void; timeout: (loser?: "w" | "b") => void; retry: () => void; resign: () => void; exit: () => void;
};
let generation = 0, release: (() => void) | undefined, unsubscribe: (() => void) | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let feedbackTimer: ReturnType<typeof setTimeout> | undefined;
let cancelDelay: (() => void) | undefined;
let randomMove = Math.random;
let endingReason = "normal";
let snapshot: Pick<ReturnType<typeof useWorkspace.getState>, "game" | "imported" | "freeGame" | "selectedPath" | "navigationPaths" | "orientation"> | undefined;
function clearAnalysis() {
  useAnalysis.setState({ enabled: false, result: null, fen: null, assessment: null, status: "stopped", error: null });
  void useThreats.getState().update(null);
}
function cancel() { generation++; clearTimeout(timer); cancelDelay?.(); cancelDelay = undefined; engineClient().stop("computer"); clearAnalysis(); }
function unlockEngine() { cancel(); unsubscribe?.(); unsubscribe = undefined; release?.(); release = undefined; }

async function finish(resigned?: "w" | "b", termination = "normal") {
  if (resigned) endingReason = termination;
  const state = useComputer.getState(), chess = chessAt(useWorkspace.getState().game);
  const result = computerResult(chess, resigned) ?? state.result;
  if (!result) return;
  cancel(); clearTimeout(feedbackTimer); const token = generation;
  useComputer.setState({ result, thinking: false, reviewingMove: false });
  useWorkspace.setState({ computer: { human: state.human, locked: true } });
  chess.header("Event", `Computer game ${state.id}`, "Site", "Local", "Date", new Date().toISOString().slice(0, 10).replaceAll("-", "."),
    "White", state.human === "w" ? "Human" : state.bot.name, "Black", state.human === "b" ? "Human" : state.bot.name,
    "Result", result, "HumanName", "Human", "HumanColour", state.human === "w" ? "White" : "Black",
    "BotName", state.bot.name, "BotLevel", state.bot.level, "BotApproximateRating", String(state.bot.rating), "Source", "computer",
    "Termination", endingReason, "ReviewPreset", state.reviewConfig.preset, "ReviewMultiPV", String(state.reviewConfig.multiPv));
  try {
    const parsed = await validatePgn(chess.pgn());
    const document = parsed.validGames[0];
    if (!document) throw new Error("The completed game could not be prepared for review.");
    document.game.source = "computer"; document.game.id = state.id!;
    await gamesRepository().save([document]);
    const saved = await gamesRepository().findIdentity(document.game);
    if (token !== generation) return;
    unlockEngine(); useComputer.setState({ active: false, error: null });
    useWorkspace.setState({ computer: null });
    useWorkspace.getState().openGame(saved ?? document);
    useReviewDialog.setState({ automaticGameId: (saved ?? document).game.id });
    void useReviewDialog.getState().opening(() => new ComputerProgressRepository().prepareReview(saved ?? document, state.reviewConfig));
    void useLibrary.getState().refresh();
  } catch (error) {
    if (token === generation) useComputer.setState({ error: `Game kept in this tab. ${error instanceof Error ? error.message : "Saving failed."} Retry to save and review.` });
  }
}

function publishAssistance() {
  const state = useComputer.getState(), game = useWorkspace.getState().game;
  const result = state.positions[game.cursor];
  if (state.assisted && chessAt(game).turn() === state.human && result?.fen === chessAt(game).fen()) {
    useAnalysis.setState({ result, fen: result.fen, version: result.engineVersion, status: "ready", cached: true });
  } else clearAnalysis();
}
function gradeHumanMoves(game: GameState) {
  const state = useComputer.getState(), feedback = { ...state.feedback };
  if (!state.showFeedback) return;
  let latest: number | null = null;
  for (let ply = 1; ply <= game.cursor; ply++) {
    if (feedback[ply]) continue;
    const before = state.positions[ply - 1], after = state.positions[ply], move = game.moves[ply - 1];
    if (!before || !after || before.fen.split(" ")[1] !== state.human) continue;
    const uci = `${move.from}${move.to}${move.promotion ?? ""}`;
    const assessment = classifyMove(before, after, uci, { book: bookContinuation(before.fen, uci)?.name, previous: state.positions[ply - 2] });
    if (!assessment) continue;
    const change = evaluationChange(before.lines[0]?.score ?? null, after.lines[0]?.score ?? null, state.human);
    feedback[ply] = { assessment: { ...assessment, reason: `${assessment.reason} ${changeDescription(change)} Best move: ${before.bestMoveSan ?? "none"}.` }, bestMove: before.bestMoveSan, change };
    latest = ply;
  }
  useComputer.setState({ feedback, ...(latest !== null ? { feedbackPly: latest } : {}) });
  if (latest !== null) { clearTimeout(feedbackTimer); feedbackTimer = setTimeout(() => useComputer.setState({ feedbackPly: null }), 4000); }
}
/** Fill every missing association, including positions crossed by a quick human move. */
async function collectPositions(game: GameState, token: number) {
  const state = useComputer.getState(), client = engineClient(), version = await client.ready();
  const current = () => token === generation && useComputer.getState().active;
  if (!current()) return;
  const config = state.reviewConfig, cache = new AnalysisRepository(), progress = new ComputerProgressRepository();
  for (let ply = 0; ply <= game.cursor; ply++) {
    if (!current()) return;
    if (useComputer.getState().positions[ply]) continue;
    const fen = chessAt({ ...game, cursor: ply }).fen();
    let result = await cache.get(fen, version, config);
    if (!current()) return;
    const fromCache = !!result && usableResult(result);
    if (!result || !usableResult(result)) {
      result = withTerminalScore({ requestId: `terminal:${state.id}:${ply}`, fen, config, engineBuild: ENGINE_BUILD, engineVersion: version, lines: [], bestMove: null, bestMoveSan: null });
      if (!usableResult(result)) result = withTerminalScore(await client.analyze(fen, config, "computer"));
      if (!current()) return;
      if (!usableResult(result)) throw new Error("Stockfish returned no exact review evaluation. Retry to continue.");
      await cache.save(result);
    }
    if (!current()) return;
    await progress.save(state.id!, ply, result, fromCache);
    if (!current()) return;
    useComputer.setState({ positions: { ...useComputer.getState().positions, [ply]: result } });
    gradeHumanMoves(game);
    if (ply === game.cursor) publishAssistance();
  }
}
function schedule() {
  cancel();
  const state = useComputer.getState();
  if (!state.active) return;
  if (state.result || computerResult(chessAt(useWorkspace.getState().game))) { void finish(); return; }
  const botTurn = chessAt(useWorkspace.getState().game).turn() !== state.human;
  const reviewingMove = botTurn && state.showFeedback && useWorkspace.getState().game.cursor > 0;
  useComputer.setState({ thinking: botTurn && !reviewingMove, reviewingMove, error: null });
  useWorkspace.setState({ computer: { human: state.human, locked: botTurn } });
  const token = generation;
  if (botTurn) {
    void search(token, true);
  } else timer = setTimeout(() => void search(token, false), 300);
}
async function search(token: number, botTurn: boolean) {
  const state = useComputer.getState();
  if (token !== generation) return;
  const game = useWorkspace.getState().game, chess = chessAt(game), fen = chess.fen();
  const current = () => token === generation && useComputer.getState().active && useWorkspace.getState().game === game;
  try {
    const client = engineClient(); await client.ready(); if (!current()) return;
    if (botTurn) {
      if (state.showFeedback && game.cursor > 0) {
        await collectPositions(game, token); if (!current()) return;
        if (useComputer.getState().feedback[game.cursor]) {
          // Republish on retry too: the full hold starts when feedback becomes visible.
          clearTimeout(feedbackTimer);
          useComputer.setState({ feedbackPly: game.cursor });
          const hold = cancellableDelay(FEEDBACK_HOLD_MS); cancelDelay = hold.cancel;
          await hold.promise; if (!current()) return;
          feedbackTimer = setTimeout(() => useComputer.setState({ feedbackPly: null }), 4000);
        }
      }
      useComputer.setState({ reviewingMove: false, thinking: true });
      // Start the natural thinking delay and engine search together, after feedback.
      const delay = cancellableDelay(botDelayMs(randomMove)); cancelDelay = delay.cancel;
      const opening = game.cursor < OPENING_VARIETY_PLIES;
      const result = await client.analyze(fen, { preset: "deep", multiPv: opening ? Math.max(OPENING_MULTI_PV, state.bot.multiPv) : state.bot.multiPv }, "computer", state.bot.search);
      if (!current()) return;
      const move = (opening ? chooseOpeningMove(chess, result, state.bot, randomMove) : null) ?? chooseBotMove(chess, result, state.bot, randomMove);
      await collectPositions(game, token); if (!current()) return;
      await delay.promise; if (!current()) return;
      const next = tryMove(game, move.slice(0, 2), move.slice(2, 4), move[4] as PromotionPiece | undefined);
      if (next.kind !== "moved") throw new Error("Stockfish returned an illegal move. Retry the engine.");
      // Updating the workspace advances the generation synchronously: apply exactly once.
      useWorkspace.setState({ game: next.game, boardTransition: "navigate" });
    } else { await collectPositions(game, token); if (current()) publishAssistance(); }
  } catch (error) {
    if (current()) { cancelDelay?.(); useComputer.setState({ thinking: false, reviewingMove: false, error: error instanceof Error ? error.message : "Stockfish failed. Retry to continue." }); clearAnalysis(); }
  }
}
export const useComputer = create<State>((set, get) => ({
  showFeedback: true, feedback: {}, feedbackPly: null, positions: {}, reviewConfig: { preset: "standard", multiPv: 3 },
  active: false, starting: false, assisted: false, thinking: false, reviewingMove: false, error: null, bot: BOTS[0], human: "w", result: null, id: null,
  start: async (bot, side, assisted = false, random = Math.random, showFeedback = true) => {
    if (get().starting || get().active) return;
    set({ starting: true, error: null });
    try {
      useReviewDialog.getState().close(); await useGameAnalysis.getState().pause();
      useAnalysis.getState().stop(); clearAnalysis();
      release = engineClient().acquire("computer"); engineClient().newGame("computer");
      void useOpenings.getState().load();
      const w = useWorkspace.getState();
      snapshot ??= { game: w.game, imported: w.imported, freeGame: w.freeGame, selectedPath: w.selectedPath, navigationPaths: w.navigationPaths, orientation: w.orientation };
      const human = humanColor(side, random); randomMove = random; endingReason = "normal";
      const { preset, multiPv } = useAnalysis.getState().preferences;
      set({ active: true, bot, human, assisted, showFeedback, feedback: {}, feedbackPly: null, positions: {}, reviewConfig: { preset, multiPv }, result: null, id: crypto.randomUUID() });
      useWorkspace.setState({ computer: { human, locked: human === "b" }, game: createGame(), imported: null, freeGame: null, selectedPath: [], navigationPaths: [], orientation: human === "w" ? "white" : "black", boardTransition: "replace", boardEpoch: w.boardEpoch + 1 });
      unsubscribe = useWorkspace.subscribe((next, previous) => { if (next.game !== previous.game) schedule(); });
      schedule();
    } catch (error) { unlockEngine(); set({ active: false, error: error instanceof Error ? error.message : "Could not start game." }); }
    finally { set({ starting: false }); }
  },
  setAssisted: (assisted) => { set({ assisted }); publishAssistance(); },
  timeout: (loser = get().human) => { if (get().active && !get().result) void finish(loser, "timeout"); },
  retry: () => { if (get().result) void finish(); else schedule(); },
  resign: () => { if (get().active && !get().result) void finish(get().human, "resignation"); },
  exit: () => {
    unlockEngine(); clearTimeout(feedbackTimer); set({ feedbackPly: null, active: false, assisted: false, thinking: false, reviewingMove: false, result: null, error: null });
    useReviewDialog.getState().close();
    useWorkspace.setState({ ...snapshot, computer: null, boardTransition: "replace", boardEpoch: useWorkspace.getState().boardEpoch + 1 }); snapshot = undefined;
  },
}));
