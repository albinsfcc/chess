import { describe, expect, it } from "vitest";
import { DEFAULT_POSITION } from "chess.js";
import { displayedAnalysis, evaluationBar } from "./position-evaluation";
import { ENGINE_BUILD, type EngineResult } from "./engine/domain";
import type { GameAnalysis, PositionAnalysis } from "./game-analysis/domain";
const result: EngineResult = { requestId: "new", fen: DEFAULT_POSITION, engineBuild: ENGINE_BUILD, engineVersion: "test", config: { preset: "quick", multiPv: 3 }, bestMove: null, bestMoveSan: null, lines: [] };
describe("White-relative evaluation bar", () => {
  it("distinguishes unanalyzed from equality and applies the requested bounded sigmoid", () => {
    expect(evaluationBar(null, "w")).toMatchObject({ whitePercentage: 50, label: "—" });
    expect(evaluationBar({ type: "cp", value: 0 }, "b")).toMatchObject({ whitePercentage: 50, label: "0.00" });
    expect(evaluationBar({ type: "cp", value: 125 }, "b").label).toBe("+1.25");
    expect(evaluationBar({ type: "cp", value: -60 }, "w").label).toBe("-0.60");
    expect(evaluationBar({ type: "cp", value: 400 }, "w").whitePercentage).toBeCloseTo(100 / (1 + Math.exp(-1)));
    expect(evaluationBar({ type: "cp", value: -99999 }, "w").whitePercentage).toBeCloseTo(100 / (1 + Math.exp(5)));
  });
  it("keeps mate scores distinct, including a checkmated side to move", () => {
    expect(evaluationBar({ type: "mate", moves: 3 }, "b")).toMatchObject({ whitePercentage: 100, label: "M3" });
    expect(evaluationBar({ type: "mate", moves: -2 }, "w")).toMatchObject({ whitePercentage: 0, label: "-M2" });
    expect(evaluationBar({ type: "mate", moves: 0 }, "w")).toMatchObject({ whitePercentage: 0, label: "-M0" });
    expect(evaluationBar({ type: "mate", moves: 0 }, "b")).toMatchObject({ whitePercentage: 100, label: "M0" });
  });
  it("rejects stale live results and wrong game, session, path or FEN associations", () => {
    // Minimal typed association fixtures: the selector only reads these fields.
    const review = { id: "session", gameId: "game" } as GameAnalysis;
    const row = { analysisId: "session", gameId: "game", treePath: [0, 0, 1], fen: DEFAULT_POSITION, result } as PositionAnalysis;
    const select = (live: EngineResult | null, liveFen: string | null, path = row.treePath, gameId = "game") => displayedAnalysis(DEFAULT_POSITION, gameId, path, live, liveFen, review, [row]);
    expect(select(null, null)).toBe(result);
    expect(select({ ...result, fen: "old" }, "old", [1])).toBeNull();
    expect(select(result, "old", [1])).toBeNull();
    expect(select(null, null, row.treePath, "other")).toBeNull();
    const fresh = { ...result, requestId: "fresh" }; expect(select(fresh, DEFAULT_POSITION)).toBe(fresh);
    expect(displayedAnalysis(DEFAULT_POSITION, "game", row.treePath, null, null, review, [{ ...row, analysisId: "other" }])).toBeNull();
  });
});
