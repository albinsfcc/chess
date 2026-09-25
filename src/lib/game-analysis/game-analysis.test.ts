import "fake-indexeddb/auto";
import { Chess } from "chess.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GamesDatabase, GamesRepository } from "@/lib/db/games";
import { validatePgn } from "@/lib/pgn/import-service";
import { annotatedPgn as fixture } from "@/lib/pgn/fixtures";
import { AnalysisRepository } from "@/lib/engine/repository";
import { configurationHash } from "@/lib/engine/configuration";
import { ENGINE_BUILD, type AnalysisConfig, type EngineResult } from "@/lib/engine/domain";
import { toWhiteScore } from "@/lib/engine/normalize";
import { generatePositions, positionRange } from "./positions";
import { evaluationChange } from "./evaluation";
import { GameAnalysisRepository } from "./repository";
import { GameAnalysisQueue, type EngineForQueue, type QueueEvent } from "./queue";
import { annotatedPgn } from "./export";
import type { GameDocument } from "@/lib/pgn/domain";

const config = { preset: "quick", multiPv: 3, startPly: 0, endPly: 4 } as const;
function result(fen: string, configuration: AnalysisConfig): EngineResult {
  const chess = new Chess(fen), move = chess.moves({ verbose: true })[0];
  return { requestId: crypto.randomUUID(), fen, config: configuration, engineBuild: ENGINE_BUILD, engineVersion: "Stockfish Test", bestMove: move ? `${move.from}${move.to}${move.promotion ?? ""}` : null, bestMoveSan: move?.san ?? null,
    lines: [{ multiPv: 1, depth: 12, nodes: 1200, timeMs: 250, score: { type: "cp", value: 20 }, lowerBound: false, upperBound: false, pvUci: move ? [`${move.from}${move.to}${move.promotion ?? ""}`] : [], pvSan: move ? [move.san] : [], replayComplete: true }] };
}
class FakeEngine implements EngineForQueue {
  controlled = false; held = false;
  pending: { resolve: (value: EngineResult) => void; reject: (error: Error) => void; result: EngineResult } | null = null;
  ready = vi.fn(async () => "Stockfish Test");
  acquire = vi.fn(() => { if (this.held) throw new Error("busy"); this.held = true; return () => { this.held = false; }; });
  newGame = vi.fn();
  analyze = vi.fn(async (fen: string, configuration: AnalysisConfig) => {
    if (!this.controlled) return result(fen, configuration);
    return new Promise<EngineResult>((resolve, reject) => { this.pending = { resolve, reject, result: result(fen, configuration) }; });
  });
  stop = vi.fn(() => { this.pending?.reject(new DOMException("Cancelled", "AbortError")); this.pending = null; });
  finish() { const pending = this.pending; this.pending = null; pending?.resolve(pending.result); }
}
let db: GamesDatabase, games: GamesRepository, sessions: GameAnalysisRepository, cache: AnalysisRepository, document: GameDocument, engine: FakeEngine, queue: GameAnalysisQueue, events: QueueEvent[];
beforeEach(async () => {
  db = new GamesDatabase(`game-analysis-${crypto.randomUUID()}`); games = new GamesRepository(db); sessions = new GameAnalysisRepository(db); cache = new AnalysisRepository(db);
  document = (await validatePgn(fixture)).validGames[0]; await games.save([document]);
  engine = new FakeEngine(); events = [];
  queue = new GameAnalysisQueue(engine, sessions, games, cache, (event) => events.push(event), (work) => work());
});
afterEach(async () => { await queue.pause(); vi.restoreAllMocks(); await db.delete(); });
const saved = async () => (await sessions.list(document.game.id)).sessions[0];

describe("position generation", () => {
  it("generates before-move FENs and the final position on the main line", () => {
    const positions = generatePositions(document.tree, "main");
    expect(positions).toHaveLength(5); expect(positions[0]).toMatchObject({ ply: 0, treePath: [], playedMoveUci: "e2e4", playedMoveSan: "e4" });
    const board = new Chess(); board.move("e4");
    expect(positions[1]).toMatchObject({ fen: board.fen(), treePath: [0], movePath: [1], playedMoveUci: "e7e5" });
    expect(positions.at(-1)).toMatchObject({ ply: 4, treePath: [3], playedMoveSan: null });
    expect(positionRange(positions, { ...config, startPly: 1, endPly: 2 })).toHaveLength(2);
    expect(() => positionRange(positions, { ...config, endPly: 100 })).toThrow("between");
  });
  it("walks only the selected recursive variation and its shared prefix", () => {
    const positions = generatePositions(document.tree, [0, 0, 1, 0]);
    expect(positions.map((position) => position.playedMoveSan)).toEqual(["d4", "Nf6", null]);
    expect(positions[1]).toMatchObject({ treePath: [0, 0, 0], movePath: [0, 0, 1, 0, 0] });
    expect(positions[2].fen).toContain("5n2");
  });
  it("reports the exact illegal move and rejects unsupported games", () => {
    const broken = structuredClone(document.tree); broken.mainLine[1].san = "e4";
    expect(() => generatePositions(broken, "main")).toThrow("ply 2: 1... e4");
    expect(() => generatePositions({ ...broken, playable: false }, "main")).toThrow("Unsupported");
  });
});
describe("evaluation facts", () => {
  const cp = (value: number) => ({ type: "cp", value } as const), mate = (moves: number) => ({ type: "mate", moves } as const);
  it("calculates White and Black loss in their own perspective, clamping improvements", () => {
    expect(evaluationChange(cp(100), cp(-50), "w")).toEqual({ type: "cp", loss: 150, whiteDelta: -150 });
    expect(evaluationChange(cp(-100), cp(30), "b")).toEqual({ type: "cp", loss: 130, whiteDelta: 130 });
    expect(evaluationChange(cp(10), cp(20), "w")).toMatchObject({ loss: 0 });
    expect(evaluationChange(cp(10), cp(0), "b")).toMatchObject({ loss: 0 });
    expect(toWhiteScore(cp(50), "b")).toEqual(cp(-50));
    expect(evaluationChange(cp(0), cp(10), "b", true)).toMatchObject({ type: "unavailable" });
  });
  it("stores mate transitions without fake centipawn loss", () => {
    expect(evaluationChange(mate(3), mate(2), "w")).toMatchObject({ type: "mate", facts: [{ kind: "maintained-forced-mate" }, { kind: "shortened-mate" }] });
    expect(evaluationChange(mate(3), mate(5), "b")).toMatchObject({ facts: [{ kind: "maintained-forced-mate" }, { kind: "extended-mate" }] });
    expect(evaluationChange(mate(3), cp(50), "w")).toMatchObject({ type: "mate", facts: [{ kind: "lost-forced-mate", winner: "w" }] });
    expect(evaluationChange(cp(20), mate(-3), "w")).toMatchObject({ type: "mate", facts: [{ kind: "allowed-forced-mate", winner: "b" }] });
    expect(evaluationChange(mate(1), mate(0), "w")).toMatchObject({ facts: [{ kind: "maintained-forced-mate", winner: "w" }, { kind: "shortened-mate", afterDistance: 0 }] });
  });
});
describe("persisted sequential queue", () => {
  it("retries empty engine output and completes with usable grades", async () => {
    engine.analyze.mockImplementationOnce(async (fen, configuration) => ({ ...result(fen, configuration), lines: [] }));
    await queue.start(document.game.id, "main", config);
    expect((await saved()).status).toBe("completed"); expect(engine.analyze).toHaveBeenCalledTimes(6);
    expect((await sessions.positions((await saved()).id)).every((row) => row.result.lines.length)).toBe(true);
  });
  it("fails recoverably rather than completing a session with missing scores", async () => {
    engine.analyze.mockImplementationOnce(async (fen, configuration) => result(fen, configuration))
      .mockImplementationOnce(async (fen, configuration) => ({ ...result(fen, configuration), lines: [] }))
      .mockImplementationOnce(async (fen, configuration) => ({ ...result(fen, configuration), lines: [] }));
    await queue.start(document.game.id, "main", config); const partial = await saved();
    expect(partial).toMatchObject({ status: "failed", completedPositions: 1, lastError: expect.stringContaining("no usable exact evaluation") });
    await queue.resume(partial.id); expect((await saved()).status).toBe("completed");
  });
  it("repairs legacy unscored records without duplicating or losing completed positions", async () => {
    await queue.start(document.game.id, "main", config); const session = await saved(), rows = await sessions.positions(session.id);
    for (const row of rows.slice(0, 2)) await db.positionAnalyses.put({ ...row, result: { ...row.result, lines: [] } });
    await queue.resume(session.id);
    expect((await saved()).completedPositions).toBe(5); expect((await saved()).status).toBe("completed");
    const repaired = await sessions.positions(session.id); expect(repaired).toHaveLength(5); expect(repaired.every((row) => row.result.lines.length)).toBe(true);
    expect(repaired[4].createdAt).toBe(rows[4].createdAt);
  });
  it("completes, caches, associates results, and reuses shared branch positions", async () => {
    await queue.start(document.game.id, "main", config);
    const session = await saved(); expect(session).toMatchObject({ status: "completed", completedPositions: 5, totalPositions: 5 });
    expect((await games.get(document.game.id)).game.analysisStatus).toBe("analyzed");
    const positions = await sessions.positions(session.id); expect(positions[0]).toMatchObject({ scoreAfter: { type: "cp", value: 20 }, evaluationChange: { type: "cp", loss: 0 } });
    expect(engine.analyze).toHaveBeenCalledTimes(5);
    await queue.start(document.game.id, "main", config); expect(engine.analyze).toHaveBeenCalledTimes(5);
    await queue.start(document.game.id, [0, 0], { ...config, endPly: 2 });
    expect(engine.analyze).toHaveBeenCalledTimes(7);
    expect((await sessions.positions((await saved()).id))[0].fromCache).toBe(true);
  });
  it("pauses safely and resumes from the first unfinished position without duplicates", async () => {
    engine.controlled = true; const running = queue.start(document.game.id, "main", config);
    await vi.waitFor(() => expect(engine.pending).not.toBeNull()); engine.finish();
    await vi.waitFor(async () => expect((await saved()).completedPositions).toBe(1));
    await queue.pause(); await running; const partial = await saved(); expect(partial.status).toBe("paused");
    engine.controlled = false; await queue.resume(partial.id);
    expect((await sessions.get(partial.id)).completedPositions).toBe(5);
    expect(await db.positionAnalyses.where("analysisId").equals(partial.id).count()).toBe(5);
    await queue.resume(partial.id); expect(await db.positionAnalyses.where("analysisId").equals(partial.id).count()).toBe(5);
  });
  it("cancels without losing committed records and supports explicit resume", async () => {
    engine.controlled = true; const running = queue.start(document.game.id, "main", config);
    await vi.waitFor(() => expect(engine.pending).not.toBeNull()); engine.finish();
    await vi.waitFor(async () => expect((await saved()).completedPositions).toBe(1));
    await queue.cancel(); await running; const partial = await saved(); expect(partial.status).toBe("cancelled");
    expect(await sessions.positions(partial.id)).toHaveLength(1);
    engine.controlled = false; await queue.resume(partial.id); expect((await sessions.get(partial.id)).status).toBe("completed");
  });
  it("recovers an interrupted browser session as paused", async () => {
    await queue.start(document.game.id, "main", { ...config, endPly: 1 }); const session = await saved();
    await sessions.update(session.id, { status: "running", runId: "old-tab" }); await queue.recover();
    expect(await sessions.get(session.id)).toMatchObject({ status: "paused", completedPositions: 2, lastError: expect.stringContaining("previous tab") });
  });
  it("prevents simultaneous sessions", async () => {
    engine.controlled = true; const running = queue.start(document.game.id, "main", config);
    await expect(queue.start(document.game.id, "main", config)).rejects.toThrow("Pause"); await queue.pause(); await running;
  });
  it("can pause during engine initialization without waiting for it to finish", async () => {
    let finishBoot!: (version: string) => void;
    engine.ready.mockReturnValue(new Promise((resolve) => { finishBoot = resolve; }));
    const running = queue.start(document.game.id, "main", config);
    await vi.waitFor(() => expect(engine.ready).toHaveBeenCalled());
    await queue.pause(); await running;
    expect(queue.active).toBe(false); expect(engine.held).toBe(false); expect(engine.analyze).not.toHaveBeenCalled();
    finishBoot("Stockfish Test");
  });
  it("keeps work after a write failure and reuses the search cached before that failure", async () => {
    const commit = sessions.commit.bind(sessions); vi.spyOn(sessions, "commit").mockImplementationOnce(commit).mockRejectedValueOnce(new Error("Storage full"));
    await queue.start(document.game.id, "main", config); const partial = await saved();
    expect(partial).toMatchObject({ status: "failed", completedPositions: 1, lastError: expect.stringContaining("Storage full") });
    vi.mocked(sessions.commit).mockImplementation(commit); await queue.resume(partial.id);
    expect((await sessions.get(partial.id)).status).toBe("completed"); expect(engine.analyze).toHaveBeenCalledTimes(5);
  });
  it("resumes after an engine crash or timeout without discarding committed work", async () => {
    engine.analyze.mockImplementationOnce(async (fen, configuration) => result(fen, configuration)).mockRejectedValueOnce(new Error("Engine search timed out"));
    await queue.start(document.game.id, "main", config); const session = await saved();
    expect(session).toMatchObject({ status: "failed", completedPositions: 1, lastError: expect.stringContaining("At ply 1: Engine search timed out") });
    expect(engine.held).toBe(false);
    await queue.resume(session.id); expect((await sessions.get(session.id)).status).toBe("completed");
    expect(await sessions.positions(session.id)).toHaveLength(5);
  });
  it("deleting a game removes its sessions and associations while retaining reusable cache", async () => {
    await queue.start(document.game.id, "main", config);
    await games.delete(document.game.id);
    expect(await db.gameAnalyses.count()).toBe(0); expect(await db.positionAnalyses.count()).toBe(0);
    expect(await db.analyses.count()).toBe(5);
  });
  it("rejects changed engine versions and corrupt position records without deleting earlier work", async () => {
    await queue.start(document.game.id, "main", config); const session = await saved();
    engine.ready.mockResolvedValue("Different version"); await queue.resume(session.id);
    expect(events.at(-2)).toMatchObject({ type: "error", message: expect.stringContaining("version") });
    expect(await sessions.positions(session.id)).toHaveLength(5);
    engine.ready.mockResolvedValue("Stockfish Test");
    await db.positionAnalyses.update(`${session.id}:0`, { fen: "bad" });
    await queue.resume(session.id);
    expect(events.at(-2)).toMatchObject({ type: "error", message: expect.stringContaining("corrupt") });
    expect(await db.positionAnalyses.count()).toBe(5);
  });
});
describe("cache and annotated export", () => {
  it("hashes only compatible search settings and matches full FEN and engine version", async () => {
    const hash = await configurationHash(config);
    expect(hash).not.toBe(await configurationHash({ ...config, preset: "deep" }));
    expect(hash).not.toBe(await configurationHash({ ...config, multiPv: 5 }));
    expect(hash).toBe(await configurationHash({ preset: "quick", multiPv: 3 }));
    const fen = document.tree.initialFen; await cache.save(result(fen, config));
    expect(await cache.get(fen, "Other", config)).toBeNull();
    expect(await cache.get(fen.replace(" 0 1", " 1 1"), "Stockfish Test", config)).toBeNull();
    expect(await cache.get(fen, "Stockfish Test", config)).not.toBeNull();
    expect((await db.analyses.toArray())[0].configurationHash).toBe(hash);
  });
  it("exports completed evaluations, preserving original headers, comments, NAGs and recursive variations", async () => {
    await queue.start(document.game.id, "main", config); const session = await saved();
    const raw = document.game.rawPgn;
    const exported = annotatedPgn(document, session, await sessions.positions(session.id));
    expect(exported).toContain("[%eval 0.20,12]"); expect(exported).toContain("best line:");
    for (const comment of ["Opening note", "Centre", "Reply comment", "Indian defence"]) expect(exported).toContain(comment);
    const parsed = await validatePgn(exported); expect(parsed.invalidEntries).toHaveLength(0); expect(parsed.validGames).toHaveLength(1);
    expect(parsed.validGames[0].tree.mainLine.map((node) => node.san)).toEqual(document.tree.mainLine.map((node) => node.san));
    expect(parsed.validGames[0].tree.mainLine[0].variations[0][1].variations[0][0].san).toBe("Nf6");
    expect(parsed.validGames[0].tree.mainLine[0].nags).toEqual(["$1"]);
    expect(document.game.rawPgn).toBe(raw); expect((await games.get(document.game.id)).game.rawPgn).toBe(raw);
  });
});
