import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import { attackedHumanPieces, BOTS, chooseBotMove, chooseOpeningMove, computerResult, humanColor } from "./computer";
import { installOpeningIndex, openingKey } from "./openings";
import { ENGINE_BUILD, type EngineResult } from "./engine/domain";
import { UciSession } from "./engine/session";

function result(chess: Chess): EngineResult {
  const moves = chess.moves({ verbose: true }).slice(0, 5);
  return { requestId: "test", fen: chess.fen(), config: { preset: "quick", multiPv: 5 }, engineBuild: ENGINE_BUILD, engineVersion: "test", bestMove: "a1a8", bestMoveSan: null,
    lines: moves.map((move, i) => ({ multiPv: i + 1, depth: 1, score: { type: "cp", value: 0 }, lowerBound: false, upperBound: false, pvUci: [move.lan], pvSan: [move.san], replayComplete: true })) };
}
describe("computer profiles and rules", () => {
  it("varies legal book continuations for every bot with seeded randomness and strength limits", () => {
    for (const black of [false, true]) {
      const chess = new Chess(); if (black) chess.move("e4");
      const moves = black ? ["e7e5", "c7c5", "a7a5"] : ["e2e4", "d2d4", "a2a4"];
      installOpeningIndex({ version: 1, repository: "test", commit: "0".repeat(40), license: "CC0-1.0", maxPly: 12,
        entries: [{ name: "Opening", eco: "A00", pgn: "", ply: 1 }], named: {}, edges: { [openingKey(chess.fen())]: Object.fromEntries(moves.map(move => [move, 0])) } });
      const analysis = result(chess);
      analysis.lines = moves.map((move, i) => ({ ...analysis.lines[0], multiPv: i + 1, pvUci: [move], score: { type: "cp", value: (black ? -1 : 1) * (30 - i * 20) } }));
      for (const bot of BOTS) {
        const picks = Array.from({ length: 10 }, (_, seed) => chooseOpeningMove(chess, analysis, bot, () => seed / 10));
        expect(new Set(picks).size).toBeGreaterThan(1);
        expect(picks.every(move => moves.includes(move!))).toBe(true);
        if (bot.name === "Atlas") expect(picks).not.toContain(moves[2]);
      }
      analysis.lines[0].score = { type: "mate", moves: black ? -3 : 3 };
      expect(chooseOpeningMove(chess, analysis, BOTS[5])).toBeNull();
      analysis.lines = []; expect(chooseOpeningMove(chess, analysis, BOTS[0])).toBeNull();
    }
  });
  it("defines six increasing strengths and an unrestricted browser-budget master", () => {
    expect(BOTS.map((b) => [b.name, b.level, b.rating])).toEqual([["Ollie", "Beginner", 400], ["Mira", "Easy", 700], ["Nova", "Casual", 1000], ["Kairo", "Club", 1300], ["Orion", "Expert", 1700], ["Atlas", "Master", 2100]]);
    expect(BOTS[5].search).toEqual({ timeMs: 2000 });
  });
  it("selects explicit sides and splits random selection fairly", () => {
    expect(humanColor("white")).toBe("w"); expect(humanColor("black")).toBe("b");
    expect(humanColor("random", () => .49999)).toBe("w"); expect(humanColor("random", () => .5)).toBe("b");
  });
  it("weights weaker bots toward imperfect moves, while Atlas always picks the first legal line", () => {
    const chess = new Chess(), analysis = result(chess);
    expect(chooseBotMove(chess, analysis, BOTS[0], () => .99)).toBe(analysis.lines[4].pvUci[0]);
    expect(chooseBotMove(chess, analysis, BOTS[5], () => .99)).toBe(analysis.lines[0].pvUci[0]);
    const picks = BOTS.map((bot) => Array.from({ length: 100 }, (_, i) => chooseBotMove(chess, analysis, bot, () => i / 100)).filter((move) => move === analysis.lines[0].pvUci[0]).length);
    expect(picks).toEqual([...picks].sort((a, b) => a - b));
  });
  it.each(BOTS)("$name only selects legal moves, including special positions", (bot) => {
    for (const fen of [undefined, "7k/P7/8/8/8/8/8/7K w - - 0 1", "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1", "4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2"]) {
      const chess = new Chess(fen), analysis = result(chess);
      for (const sample of [0, .2, .5, .99]) expect(chess.moves({ verbose: true }).map((move) => move.lan)).toContain(chooseBotMove(chess, analysis, bot, () => sample));
      expect(() => chooseBotMove(chess, { ...analysis, bestMove: "a1a1", lines: [] }, bot)).toThrow("no legal move");
    }
  });
  it("defines immediate attacked human pieces, independent of PVs", () => {
    const chess = new Chess("4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1");
    expect(attackedHumanPieces(chess, "w")).toEqual(["e4"]);
    expect(attackedHumanPieces(chess, "b")).toEqual(["d5"]);
    chess.move("e5"); expect(attackedHumanPieces(chess, "w")).toEqual([]);
  });
  it("recognizes mate, stalemate, material, fifty moves, repetition, and resignation", () => {
    expect(computerResult(new Chess("7k/6Q1/6K1/8/8/8/8/8 b - - 0 1"))).toBe("1-0");
    for (const fen of ["7k/5Q2/6K1/8/8/8/8/8 b - - 0 1", "7k/8/6K1/8/8/8/8/8 w - - 0 1", "7k/8/6K1/8/8/8/8/R7 w - - 100 60"]) expect(computerResult(new Chess(fen))).toBe("1/2-1/2");
    const chess = new Chess(); for (const move of ["Nf3", "Nf6", "Ng1", "Ng8", "Nf3", "Nf6", "Ng1", "Ng8"]) chess.move(move);
    expect(computerResult(chess)).toBe("1/2-1/2"); expect(computerResult(new Chess(), "w")).toBe("0-1"); expect(computerResult(new Chess(), "b")).toBe("1-0");
  });
  it("inspects runtime UCI limits, clamps low Elo, and restores full strength for review", () => {
    const commands: string[] = [], session = new UciSession((command) => commands.push(command), () => {});
    session.command({ type: "initialize" });
    session.receive("option name UCI_LimitStrength type check default false\noption name UCI_Elo type spin default 1320 min 1320 max 3190\noption name Skill Level type spin default 20 min 0 max 20\nuciok\nreadyok");
    const request = { requestId: "bot", fen: new Chess().fen(), config: { preset: "quick" as const, multiPv: 5 }, bot: BOTS[0].search };
    session.command({ type: "search", request });
    expect(commands).toContain("setoption name UCI_LimitStrength value true"); expect(commands).toContain("setoption name UCI_Elo value 1320"); expect(commands.at(-1)).toBe("go movetime 60 depth 1");
    session.receive("bestmove e2e4\nreadyok"); session.command({ type: "search", request: { ...request, bot: undefined } });
    expect(commands.slice(-5)).toContain("setoption name UCI_LimitStrength value false"); session.dispose();
  });
});
