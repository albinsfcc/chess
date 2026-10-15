import { describe, expect, it } from "vitest";
import { Chess, DEFAULT_POSITION } from "chess.js";
import { explainPosition } from "./position-coach";
import { ENGINE_BUILD, type EngineResult } from "./engine/domain";

const engine: EngineResult = {
  fen: DEFAULT_POSITION, requestId: "coach", engineBuild: ENGINE_BUILD, engineVersion: "test",
  config: { preset: "quick", multiPv: 3 }, bestMove: "e2e4", bestMoveSan: "e4",
  lines: [{ multiPv: 1, depth: 12, score: { type: "cp", value: 25 }, lowerBound: false, upperBound: false,
    pvUci: ["e2e4", "e7e5", "g1f3"], pvSan: ["incorrect cached SAN"], replayComplete: true }],
};
describe("position coach", () => {
  it("covers the ten factors and provides narration without requiring an engine", () => {
    const report = explainPosition(DEFAULT_POSITION);
    expect(report.factors).toHaveLength(10);
    expect(report.routine).toHaveLength(5);
    expect(report.summary).toContain("Material is level");
    expect(report.candidates).toEqual([]);
    expect(report.narration).toContain("Pawn structure");
    expect(report.factors.find(f => f.title === "Center and space")?.explanation).toContain("White attacks 0");
  });
  it("replays engine lines legally and rejects stale results", () => {
    expect(explainPosition(DEFAULT_POSITION, engine).candidates[0]).toMatchObject({ move: "e4", reply: "Black's engine reply is e5.", continuation: "e4 e5 Nf3" });
    const chess = new Chess(); chess.move("e4");
    const report = explainPosition(chess.fen(), engine, DEFAULT_POSITION);
    expect(report.candidates).toEqual([]);
    expect(report.changed).toContain("White played e4");
    expect(report.summary).toContain("Black to move");
    const invalid = { ...engine, lines: [{ ...engine.lines[0], pvUci: ["e2e5"] }] };
    expect(explainPosition(DEFAULT_POSITION, invalid).candidates).toEqual([]);
  });
  it("prioritizes check and distinguishes checkmate, stalemate, and insufficient material", () => {
    expect(explainPosition("4k3/8/8/8/8/8/4r3/4K3 w - - 0 1").urgent).toContain("White is in check");
    const chess = new Chess(); ["f3", "e5", "g4", "Qh4#"].forEach(m => chess.move(m));
    expect(explainPosition(chess.fen())).toMatchObject({ terminal: true, candidates: [], urgent: "White is checkmated. There is no legal reply." });
    expect(explainPosition("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1").urgent).toContain("stalemate");
    expect(explainPosition("7k/8/6K1/8/8/8/8/8 w - - 0 1").terminal).toBe(true);
  });
  it("identifies undefended attacks and concrete pawn structure for both sides", () => {
    const report = explainPosition("4k3/8/8/8/3q4/8/3R4/7K w - - 0 1");
    expect(report.urgent).toContain("White's rook on d2");
    const pawns = explainPosition("4k3/7p/8/P7/P7/8/8/4K3 w - - 0 1").factors.find(f => f.title === "Pawn structure")!.explanation;
    expect(pawns).toContain("doubled pawns on the a");
    expect(pawns).toContain("passed pawns on a5, a4");
    expect(pawns).toContain("Black: isolated pawns on h7");
  });
});
