import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import { ENGINE_BUILD, type EngineResult } from "../engine/domain";
import { moveAccuracy, reviewPhase, reviewSummary } from "./review-summary";
import { generatePositions } from "./positions";
import { validatePgn } from "../pgn/import-service";
import type { PositionAnalysis } from "./domain";
function result(fen: string, cp: number): EngineResult {
  return { fen, engineBuild: ENGINE_BUILD, engineVersion: "test", requestId: "test", config: { preset: "quick", multiPv: 3 }, bestMove: null, bestMoveSan: null, lines: [{ multiPv: 1, depth: 16, score: { type: "cp", value: cp }, lowerBound: false, upperBound: false, pvUci: [], pvSan: [], replayComplete: true }] };
}
describe("local review accuracy", () => {
  it("defines phase groupings without altering the accuracy formula", () => {
    expect(reviewPhase(new Chess().fen(), 0)).toBe("Open");
    expect(reviewPhase(new Chess().fen(), 20)).toBe("Mid");
    expect(reviewPhase("7k/8/8/8/8/8/8/R6K w - - 0 1", 0)).toBe("End");
  });
  it("is symmetric for White and Black, penalizes loss and never exceeds 100", () => {
    const fen = new Chess().fen();
    const white = moveAccuracy(result(fen, 100), result(fen, -100), "e2e4", "w");
    expect(white).toBeGreaterThan(0); expect(white).toBeLessThan(100);
    expect(moveAccuracy(result(fen, -100), result(fen, 100), "e7e5", "b")).toBeCloseTo(white!);
    expect(moveAccuracy(result(fen, 0), result(fen, 100), "e2e4", "w")).toBe(100);
  });
  it("uses same-position MultiPV, preserves top choices, rejects incomplete or incompatible scores", () => {
    const fen = new Chess().fen(), before = result(fen, 0), after = result(fen, -500);
    before.bestMove = "e2e4";
    expect(moveAccuracy(before, after, "e2e4", "w")).toBe(100);
    before.bestMove = null; before.lines.push({ ...before.lines[0], multiPv: 2, pvUci: ["e2e4"] });
    expect(moveAccuracy(before, after, "e2e4", "w")).toBe(100);
    expect(moveAccuracy(before, { ...after, lines: [] }, "e2e4", "w")).toBeNull();
    expect(moveAccuracy(before, { ...after, engineVersion: "other" }, "e2e4", "w")).toBeNull();
  });
  it("handles mate transitions separately", () => {
    const fen = new Chess().fen(), before = result(fen, 0), after = result(fen, 0);
    before.lines[0].score = { type: "mate", moves: 3 }; after.lines[0].score = { type: "mate", moves: 2 };
    expect(moveAccuracy(before, after, "e2e4", "w")).toBe(100);
    after.lines[0].score = { type: "cp", value: 100 };
    expect(moveAccuracy(before, after, "e2e4", "w")).toBeCloseTo(100 * Math.exp(-5 * (1 - 1 / (1 + Math.exp(-100 / 400)))));
  });
  it.each(["w", "b"] as const)("penalizes missed mate without treating +30.66 as a lost game from %s perspective", mover => {
    const sign = mover === "w" ? 1 : -1, fen = new Chess().fen();
    const before = result(fen, 0), after = result(fen, 3066 * sign);
    before.lines[0].score = { type: "mate", moves: 5 * sign };
    expect(moveAccuracy(before, after, "d2d4", mover)).toBeCloseTo(100 * Math.exp(-.5));
    after.lines[0].score = { type: "mate", moves: -2 * sign };
    expect(moveAccuracy(before, after, "d2d4", mover)).toBeCloseTo(100 * Math.exp(-5));
  });
  it("excludes a forced move from overall and phase accuracy but retains its classification", async () => {
    const document = (await validatePgn('[SetUp "1"]\n[FEN "7r/8/8/8/8/5k2/8/7K w - - 0 1"]\n1. Kg1 *')).validGames[0];
    const plan = generatePositions(document.tree, "main");
    const rows: PositionAnalysis[] = plan.map(position => ({ ...position, id: String(position.ply), analysisId: "forced", gameId: document.game.id, configurationHash: "test", result: result(position.fen, 0), scoreBefore: { type: "cp", value: 0 }, scoreAfter: null, evaluationChange: { type: "unavailable", reason: "test" }, bestMoveUci: null, bestMoveSan: null, depth: 16, nodes: null, elapsedMs: null, fromCache: false, createdAt: new Date().toISOString() }));
    const summary = reviewSummary(plan, rows, document.game.id);
    expect(summary.w).toMatchObject({ total: 1, eligible: 0, scored: 0, accuracy: null, counts: { Forced: 1 } });
    expect(summary.w.phases.End.total).toBe(0);
  });
  it("counts each player's moves and withholds incomplete or empty accuracy", async () => {
    const document = (await validatePgn('1. e4 e5 2. Nf3 *')).validGames[0], plan = generatePositions(document.tree, "main");
    const rows: PositionAnalysis[] = plan.map((position) => ({ ...position, id: String(position.ply), analysisId: "session", gameId: document.game.id, configurationHash: "test", result: result(position.fen, 0), scoreBefore: { type: "cp", value: 0 }, scoreAfter: null, evaluationChange: { type: "unavailable", reason: "test" }, bestMoveUci: null, bestMoveSan: null, depth: 16, nodes: null, elapsedMs: null, fromCache: false, createdAt: new Date().toISOString() }));
    const summary = reviewSummary(plan, rows, document.game.id);
    expect(summary.w).toMatchObject({ total: 2, graded: 2, accuracy: 100 }); expect(summary.b).toMatchObject({ total: 1, graded: 1, accuracy: 100 });
    expect(summary.w.phases.Open).toEqual({ total: 2, scored: 2, sum: 200 });
    expect(summary.w.phases.End.total).toBe(0);
    expect(reviewSummary(plan, rows.slice(0, 2), document.game.id).w.phases.Open).toEqual({ total: 2, scored: 1, sum: 100 });
    expect(reviewSummary(plan, rows.slice(0, 2), document.game.id).w.accuracy).toBeNull();
    expect(reviewSummary([], [], document.game.id).w.accuracy).toBeNull();
  });
});
