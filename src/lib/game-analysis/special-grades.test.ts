import { Chess, DEFAULT_POSITION } from "chess.js";
import { expect, it } from "vitest";
import { classifyMove, intrinsicAssessment } from "./move-quality";
import { ENGINE_BUILD, type EngineResult, type EngineScore } from "../engine/domain";
import { usableResult, withTerminalScore } from "../engine/result-quality";
import { UciSession } from "../engine/session";
function result(fen: string, score: EngineScore = { type: "cp", value: 0 }): EngineResult {
  return { fen, engineBuild: ENGINE_BUILD, engineVersion: "test", requestId: "test", config: { preset: "quick", multiPv: 3 }, bestMove: null, bestMoveSan: null, lines: [{ multiPv: 1, depth: 3, score, lowerBound: false, upperBound: false, pvUci: [], pvSan: [], replayComplete: true }] };
}
it("detects missed mate in one for both sides, even without Stockfish", () => {
  const fen = "7k/5K2/6Q1/8/8/8/8/8 w - - 0 1";
  expect(intrinsicAssessment(fen, "g6g5")).toMatchObject({ label: "Missed Win", reason: expect.stringContaining("Qg7#") });
  expect(intrinsicAssessment(fen, "g6h6")?.label).toBe("Best");
  expect(intrinsicAssessment(fen, "g6g8")?.label).toBe("Best");
  expect(intrinsicAssessment("8/8/8/8/8/6q1/5k2/7K b - - 0 1", "g3g4")?.label).toBe("Missed Win");
  expect(intrinsicAssessment(fen, "g6g5", "A known continuation")?.label).toBe("Missed Win");
});
it("distinguishes exactly one legal move from merely an engine favourite", () => {
  const fen = "7r/8/8/8/8/5k2/8/7K w - - 0 1";
  expect(new Chess(fen).moves()).toEqual(["Kg1"]);
  expect(intrinsicAssessment(fen, "h1g1")?.label).toBe("Forced");
  expect(intrinsicAssessment(DEFAULT_POSITION, "e2e4")).toBeNull();
  expect(intrinsicAssessment(DEFAULT_POSITION, "e2e4", "King's Pawn Game")?.label).toBe("Book");
  expect(intrinsicAssessment(DEFAULT_POSITION, "e2e5", "anything")).toBeNull();
});
it("detects an opponent-created missed winning opportunity for White and Black", () => {
  for (const color of ["w", "b"]) {
    const chess = new Chess(); if (color === "w") chess.move("e4");
    const previous = result(chess.fen()); chess.move(color === "w" ? "e5" : "e4");
    const before = result(chess.fen(), { type: "cp", value: color === "w" ? 300 : -300 });
    const move = chess.move(color === "w" ? "Nf3" : "e5"), after = result(chess.fen());
    expect(classifyMove(before, after, `${move.from}${move.to}`, { previous })).toMatchObject({ label: "Miss", provisional: true });
    expect(classifyMove(before, after, `${move.from}${move.to}`)?.label).toBe("Blunder");
  }
});
it("grades all adjacent usable results at shallow depth, including mate transitions", () => {
  const chess = new Chess(); const fens = [chess.fen()], moves = ["e4", "e5", "Nf3", "Nc6", "Bb5"];
  for (const move of moves) { chess.move(move); fens.push(chess.fen()); }
  const uci = chess.history({ verbose: true }).map((move) => `${move.from}${move.to}`);
  for (let i = 0; i < uci.length; i++) expect(classifyMove(result(fens[i]), result(fens[i + 1]), uci[i])).toMatchObject({ label: "Excellent", provisional: true });
  for (const before of [{ type: "mate", moves: 3 }, { type: "mate", moves: -3 }] as const)
    for (const after of [{ type: "mate", moves: 5 }, { type: "mate", moves: -5 }, { type: "cp", value: 0 }] as const)
      expect(classifyMove(result(fens[0], before), result(fens[1], after), "e2e4")).not.toBeNull();
});
it("supplies exact terminal results when no engine info was emitted", () => {
  const mate = withTerminalScore({ ...result("7k/6Q1/5K2/8/8/8/8/8 b - - 0 1"), lines: [] });
  expect(mate.lines[0].score).toEqual({ type: "mate", moves: 0 }); expect(usableResult(mate)).toBe(true);
  const stale = withTerminalScore({ ...result("7k/5K2/6Q1/8/8/8/8/8 b - - 0 1"), lines: [] });
  expect(stale.lines[0].score).toEqual({ type: "cp", value: 0 });
});
it("uses the last exact score instead of leaving a completed search bounded", () => {
  const events: unknown[] = [], session = new UciSession(() => {}, (event) => events.push(event));
  session.command({ type: "initialize" }); session.receive("uciok"); session.receive("readyok");
  session.command({ type: "search", request: { requestId: "1", fen: DEFAULT_POSITION, config: { preset: "quick", multiPv: 3 } } });
  session.receive("info depth 7 score cp 30 pv e2e4"); session.receive("info depth 8 score cp 50 lowerbound pv e2e4"); session.receive("bestmove e2e4");
  expect(events.at(-1)).toMatchObject({ type: "result", complete: true, result: { lines: [{ depth: 7, lowerBound: false, score: { type: "cp", value: 30 } }] } }); session.dispose();
});
