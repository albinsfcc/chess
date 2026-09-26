import "fake-indexeddb/auto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Chess } from "chess.js";
import { EngineClient, type EngineWorker } from "@/lib/engine/client";
import { ENGINE_BUILD, type SearchRequest, type WorkerCommand, type WorkerEvent } from "@/lib/engine/domain";
import { BOTS, botDelayMs, cancellableDelay } from "@/lib/computer";
import { chessAt, createGame } from "@/lib/game";
import { gamesDatabase, gamesRepository } from "@/lib/db/games";
import { useComputer } from "./computer";
import { useWorkspace } from "./workspace";
import { useAnalysis } from "./analysis";
import { useReviewDialog } from "./game-review";
import { AnalysisRepository } from "@/lib/engine/repository";
import { engineClient } from "@/lib/engine/client";
import { ComputerProgressRepository } from "@/lib/game-analysis/computer-progress";
vi.mock("@/lib/engine/client", async (original) => {
  const engineModule = await original<typeof import("@/lib/engine/client")>();
  return { ...engineModule, engineClient: vi.fn() };
});
class Worker implements EngineWorker {
  onmessage: EngineWorker["onmessage"] = null; onerror = null; onmessageerror = null;
  autoReview = false;
  requests: SearchRequest[] = []; commands: WorkerCommand[] = [];
  postMessage(command: WorkerCommand) {
    this.commands.push(command);
    if (command.type === "initialize") queueMicrotask(() => this.emit({ type: "ready", engineVersion: "Computer Test" }));
    if (command.type === "search") { this.requests.push(command.request); if (this.autoReview && !command.request.bot) setTimeout(() => this.complete(command.request), 0); }
  }
  terminate() {}
  emit(data: WorkerEvent) { this.onmessage?.({ data } as MessageEvent<WorkerEvent>); }
  complete(request: SearchRequest, uci?: string) {
    const chess = new Chess(request.fen), move = chess.moves({ verbose: true }).find((m) => m.lan === uci) ?? chess.moves({ verbose: true })[0];
    this.emit({ type: "result", complete: true, result: { ...request, engineBuild: ENGINE_BUILD, engineVersion: "Computer Test", bestMove: move?.lan ?? null, bestMoveSan: move?.san ?? null, lines: move ? [{ multiPv: 1, depth: 10, score: { type: "cp", value: 25 }, lowerBound: false, upperBound: false, pvUci: [move.lan], pvSan: [move.san], replayComplete: true }] : [] } });
  }
}
let worker: Worker, client: EngineClient;
beforeEach(async () => {
  worker = new Worker(); client = new EngineClient(() => worker); vi.mocked(engineClient).mockReturnValue(client);
  useWorkspace.setState({ game: createGame(), imported: null, computer: null });
  useAnalysis.setState({ enabled: false, preferences: { preset: "quick", multiPv: 3, automatic: false, showArrow: true, showThreats: false } });
  await gamesDatabase().delete(); await gamesDatabase().open();
});
afterEach(() => { useComputer.getState().exit(); client.terminate(); vi.restoreAllMocks(); });
it("chooses delays at both boundaries and cancels a pending nonblocking timer", async () => {
  expect(botDelayMs(() => 0)).toBe(1000); expect(botDelayMs(() => 1)).toBe(10000); expect(botDelayMs(() => .5)).toBe(5500);
  vi.useFakeTimers();
  try {
    const delay = cancellableDelay(10000), ready = vi.fn(); void delay.promise.then(ready);
    await vi.advanceTimersByTimeAsync(999); expect(ready).not.toHaveBeenCalled();
    delay.cancel(); await Promise.resolve(); expect(ready).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  } finally { vi.useRealTimers(); }
});
it("collects unrestricted positions even with assistance off, grading only human moves", async () => {
  worker.autoReview = true;
  await useComputer.getState().start(BOTS[0], "white", false, () => 0);
  expect(useComputer.getState().showFeedback).toBe(true);
  await vi.waitFor(() => expect(useComputer.getState().positions[0]).toBeDefined());
  const config = useComputer.getState().reviewConfig;
  useAnalysis.setState({ preferences: { ...useAnalysis.getState().preferences, preset: "deep", multiPv: 5 } });
  useWorkspace.getState().move("e2", "e4");
  await vi.waitFor(() => expect(worker.requests.some(row => row.bot)).toBe(true));
  worker.complete(worker.requests.find(row => row.bot)!, "e7e5");
  await vi.waitFor(() => expect(useComputer.getState().feedback[1]).toBeDefined());
  expect(useWorkspace.getState().game.cursor).toBe(1); // Result ready, minimum delay still pending.
  await vi.waitFor(() => expect(useComputer.getState().positions[2]).toBeDefined(), { timeout: 3000 });
  expect(useComputer.getState().feedback[2]).toBeUndefined();
  expect(useAnalysis.getState().result).toBeNull();
  const rows = await new ComputerProgressRepository().positions(useComputer.getState().id!);
  expect(rows.map(row => row.ply)).toEqual([0, 1, 2]);
  expect(rows.every(row => row.result.config.preset === config.preset && row.result.config.multiPv === config.multiPv && row.configurationHash.length === 64)).toBe(true);
  expect(worker.requests.filter(row => !row.bot).every(row => row.config.preset === "quick" && row.config.multiPv === 3)).toBe(true);
});
it("cancels a ready bot move during its delay on exit and never applies it to the next game", async () => {
  worker.autoReview = true;
  await useComputer.getState().start(BOTS[0], "black", false, () => 1);
  await vi.waitFor(() => expect(worker.requests.some(row => row.bot)).toBe(true));
  const stale = worker.requests.find(row => row.bot)!; worker.complete(stale, "e2e4");
  await vi.waitFor(() => expect(useComputer.getState().positions[0]).toBeDefined());
  expect(useWorkspace.getState().game.cursor).toBe(0);
  useComputer.getState().exit(); await useComputer.getState().start(BOTS[5], "white", false, () => 0, false);
  worker.complete(stale, "e2e4"); await new Promise(resolve => setTimeout(resolve, 20));
  expect(useWorkspace.getState().game.cursor).toBe(0); expect(useComputer.getState().feedback).toEqual({});
  expect(useComputer.getState().showFeedback).toBe(false);
});
it("cancels pending bot replies on timeout and opens the existing review with the terminal result", async () => {
  const opening = vi.spyOn(useReviewDialog.getState(), "opening").mockResolvedValue();
  await useComputer.getState().start(BOTS[0], "black", false, () => 1);
  await vi.waitFor(() => expect(worker.requests).toHaveLength(1)); const pending = worker.requests[0];
  useComputer.getState().timeout("w"); worker.complete(pending, "e2e4");
  await vi.waitFor(() => expect(opening).toHaveBeenCalledOnce());
  const game = (await gamesRepository().list())[0];
  expect(game).toMatchObject({ result: "0-1", headers: { Termination: "timeout" } });
  expect((await gamesRepository().get(game.id)).tree.mainLine).toHaveLength(0);
});
it("defaults assistance off, locks Black until the opening bot move, and preserves the workspace", async () => {
  worker.autoReview = true;
  await useComputer.getState().start(BOTS[0], "black", false, () => 0);
  expect(useComputer.getState().assisted).toBe(false); expect(useWorkspace.getState().orientation).toBe("black");
  expect(useWorkspace.getState().move("e2", "e4").kind).toBe("illegal");
  await vi.waitFor(() => expect(worker.requests).toHaveLength(1)); worker.complete(worker.requests[0], "e2e4");
  await vi.waitFor(() => expect(useWorkspace.getState().game.cursor).toBe(1), { timeout: 3000 });
  expect(useWorkspace.getState().move("e7", "e5").kind).toBe("moved");
  useWorkspace.getState().goTo(0); expect(useWorkspace.getState().game.cursor).toBe(2);
  useComputer.getState().exit(); expect(useWorkspace.getState().game.cursor).toBe(0);
});
it("cancels assistance synchronously, gives the bot priority, rejects stale results and clears overlays", async () => {
  await useComputer.getState().start(BOTS[0], "white", true);
  await vi.waitFor(() => expect(worker.requests).toHaveLength(1)); const assistance = worker.requests[0];
  expect(assistance.bot).toBeUndefined();
  useWorkspace.getState().move("e2", "e4"); expect(useAnalysis.getState().result).toBeNull(); expect(useAnalysis.getState().fen).toBeNull();
  worker.complete(assistance); expect(useWorkspace.getState().game.cursor).toBe(1);
  await vi.waitFor(() => expect(worker.requests).toHaveLength(2)); expect(worker.requests[1].bot).toEqual(BOTS[0].search);
  await expect(client.analyze(new Chess().fen(), { preset: "quick", multiPv: 1 })).rejects.toThrow("Pause");
  const staleBot = worker.requests[1]; useComputer.getState().exit();
  await useComputer.getState().start(BOTS[5], "white"); worker.complete(staleBot);
  expect(useWorkspace.getState().game.cursor).toBe(0); expect(useAnalysis.getState().result).toBeNull(); expect(useComputer.getState().assisted).toBe(false);
});
it("caches compatible assistance and disabling clears its result immediately", async () => {
  await useComputer.getState().start(BOTS[0], "white", true);
  await vi.waitFor(() => expect(worker.requests).toHaveLength(1)); worker.complete(worker.requests[0]);
  await vi.waitFor(() => expect(useAnalysis.getState().result).not.toBeNull());
  await vi.waitFor(async () => expect(await new AnalysisRepository().get(new Chess().fen(), "Computer Test", { preset: "quick", multiPv: 3 })).not.toBeNull());
  useComputer.getState().setAssisted(false); expect(useAnalysis.getState().result).toBeNull(); expect(useAnalysis.getState().fen).toBeNull();
});
it("saves resignation as a normal computer PGN and automatically opens the existing review", async () => {
  const opening = vi.spyOn(useReviewDialog.getState(), "opening").mockResolvedValue();
  await useComputer.getState().start(BOTS[3], "white"); useWorkspace.getState().move("e2", "e4"); useComputer.getState().resign();
  await vi.waitFor(() => expect(opening).toHaveBeenCalledOnce());
  const games = await gamesRepository().list(); expect(games).toHaveLength(1);
  expect(games[0]).toMatchObject({ source: "computer", white: "Human", black: "Kairo", result: "0-1", headers: { HumanColour: "White", BotLevel: "Club", Termination: "resignation" } });
  expect((await gamesRepository().get(games[0].id)).tree.mainLine).toHaveLength(1); expect(client.reserved).toBe(false);
});
it("automatically completes a terminal bot move and recovers from startup failure", async () => {
  const opening = vi.spyOn(useReviewDialog.getState(), "opening").mockResolvedValue();
  worker.autoReview = true;
  await useComputer.getState().start(BOTS[5], "white", false, () => 0);
  const game = createGame(); for (const san of ["f3", "e5", "g4"]) { const chess = chessAt(game), move = chess.move(san); game.moves.push({ from: move.from, to: move.to, san: move.san }); game.cursor++; }
  useWorkspace.setState({ game });
  await vi.waitFor(() => expect(worker.requests).toHaveLength(1)); worker.emit({ type: "error", message: "Startup failed" });
  await vi.waitFor(() => expect(useComputer.getState().error).toContain("Startup failed"));
  expect(useWorkspace.getState().move("d8", "h4").kind).toBe("illegal"); useComputer.getState().retry();
  await vi.waitFor(() => expect(worker.requests).toHaveLength(2)); worker.complete(worker.requests[1], "d8h4");
  await vi.waitFor(() => expect(opening).toHaveBeenCalledOnce(), { timeout: 3000 }); expect((await gamesRepository().list())[0].result).toBe("0-1");
});


