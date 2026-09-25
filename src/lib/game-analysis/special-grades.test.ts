import { Chess, DEFAULT_POSITION } from "chess.js";
import { expect, it } from "vitest";
import { classifyMove, intrinsicAssessment, pointsLossLabel } from "./move-quality";
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
    expect(classifyMove(before, after, `${move.from}${move.to}`)?.label).toBe("Mistake");
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

it("never downgrades the chosen top move because a later search drifts", () => {
  for (const score of [{ type: "cp", value: -600 }, { type: "mate", moves: -3 }] as const) {
    const chess = new Chess(), before = result(chess.fen(), { type: "cp", value: 100 });
    before.bestMove = "e2e4"; chess.move("e4");
    expect(classifyMove(before, result(chess.fen(), score), "e2e4")?.label).toBe("Best");
  }
});
it.each([[0, "Excellent"], [.02, "Excellent"], [.02001, "Good"], [.05, "Good"], [.05001, "Inaccuracy"], [.1, "Inaccuracy"], [.10001, "Mistake"], [.2, "Mistake"], [.20001, "Blunder"]] as const)("uses published loss boundary %s for %s", (loss, label) => {
  expect(pointsLossLabel(loss)).toBe(label);
});
it("recognizes near-best and deferred piece sacrifices, and excludes already winning alternatives", () => {
  const chess = new Chess("r3k3/8/8/8/8/8/8/R3K3 w - - 0 1"), before = result(chess.fen(), { type: "cp", value: 100 });
  before.bestMove = "a1a2"; before.lines[0].depth = 16;
  before.lines.push({ ...before.lines[0], multiPv: 2, score: { type: "cp", value: 90 }, pvUci: ["a1a7", "e8d8", "e1d1", "a8a7"] });
  chess.move("Ra7"); const after = result(chess.fen(), { type: "cp", value: 90 }); after.lines[0].depth = 16;
  after.lines[0].pvUci = ["e8d8", "e1d1", "a8a7"];
  expect(classifyMove(before, after, "a1a7")?.label).toBe("Brilliant");
  before.lines[0].score = { type: "cp", value: 810 }; before.lines[1].score = { type: "cp", value: 800 }; after.lines[0].score = { type: "cp", value: 800 };
  expect(classifyMove(before, after, "a1a7")?.label).toBe("Excellent");
});
it("counts a sound exchange sacrifice", () => {
  const chess = new Chess("2b1k3/1n6/8/8/8/8/8/1R2K3 w - - 0 1"), before = result(chess.fen());
  before.bestMove = "b1b7"; before.lines[0].depth = 16; chess.move("Rxb7");
  const after = result(chess.fen()); after.lines[0].depth = 16; after.lines[0].pvUci = ["c8b7"];
  expect(classifyMove(before, after, "b1b7")?.label).toBe("Brilliant");
});
import recorded from '../../../tests/fixtures/sacrifice-engine-output.json';
import { parseUci } from '../engine/uci';
import { normalizeInfo } from '../engine/normalize';
it("regresses the supplied game using recorded local Stockfish 19 lines", () => {
  const normalized = recorded.map((row) => ({ ...result(row.fen), bestMove: row.best.split(" ")[1], lines: row.lines.flatMap((raw) => { const parsed = parseUci(raw); return parsed?.type === "info" ? [normalizeInfo(row.fen, parsed)] : []; }) }));
  expect(classifyMove(normalized[0], normalized[1], "c4f7")?.label).toBe("Brilliant");
  expect(classifyMove(normalized[2], normalized[3], "d5f6")?.label).toBe("Brilliant");
  expect(classifyMove(normalized[4], normalized[5], "c1h6")?.label).toBe("Great");
});

import critical from '../../../tests/fixtures/critical-engine-output.json';
it("recognizes the supplied game's critical queen moves", () => {
  const normalized = critical.map((row) => ({ ...result(row.fen), bestMove: row.best.split(" ")[1], lines: row.lines.flatMap((raw) => { const parsed = parseUci(raw); return parsed?.type === "info" ? [normalizeInfo(row.fen, parsed)] : []; }) }));
  expect(classifyMove(normalized[0], normalized[1], "d1d5")?.label).toBe("Great");
  expect(classifyMove(normalized[2], normalized[3], "f5g6")?.label).toBe("Great");
});
it("does not call an ordinary bishop-for-knight exchange Brilliant", () => {
  const chess = new Chess(); chess.loadPgn('1. e4 c5 2. Bc4 Nc6 3. Nf3 g6 4. d3 Bg7 5. Nc3 d6 6. O-O e6 7. Bg5 Qd7 8. Re1');
  const before = result(chess.fen()); before.bestMove = "g8e7"; before.lines[0].depth = 16;
  chess.move("Nge7"); const after = result(chess.fen()); after.lines[0].depth = 16; after.lines[0].pvUci = ["g5e7", "c6e7"];
  expect(classifyMove(before, after, "g8e7")?.label).toBe("Best");
  before.bestMove = "h7h6";
  expect(classifyMove(before, after, "g8e7")?.label).toBe("Excellent");
});
it("does not use adjacent-search drift as proof of a near-best sacrifice", () => {
  const chess = new Chess("r3k3/8/8/8/8/8/8/R3K3 w - - 0 1"), before = result(chess.fen());
  before.bestMove = "a1a2"; before.lines[0].depth = 16; chess.move("Ra7");
  const after = result(chess.fen()); after.lines[0].depth = 16; after.lines[0].pvUci = ["a8a7"];
  expect(classifyMove(before, after, "a1a7")?.label).toBe("Excellent");
});
import quiet from '../../../tests/fixtures/quiet-move-engine-output.json';
it("rejects all four false Brilliant labels from the screenshot with recorded Stockfish lines", () => {
  const normalized = quiet.map((row) => ({ ...result(row.fen), bestMove: row.best.split(" ")[1], lines: row.lines.flatMap((raw) => { const parsed = parseUci(raw); return parsed?.type === "info" ? [normalizeInfo(row.fen, parsed)] : []; }) }));
  for (let i = 0; i < quiet.length; i += 2) {
    const assessment = classifyMove(normalized[i], normalized[i + 1], quiet[i].uci);
    expect(assessment, quiet[i].move).not.toBeNull();
    expect(assessment?.label, quiet[i].move).not.toBe("Brilliant");
  }
});
