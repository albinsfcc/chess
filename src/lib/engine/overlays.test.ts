import { Chess, DEFAULT_POSITION } from "chess.js";
import { describe, expect, it } from "vitest";
import { ENGINE_BUILD, enginePreferencesSchema, defaultEnginePreferences, type EngineResult } from "./domain";
import { topMoveArrows, TOP_MOVE_COLORS } from "./arrows";
import { immediateThreats } from "./threats";
import { navigationPly } from "../navigation";
import { classifyMove } from "../game-analysis/move-quality";

function result(fen = DEFAULT_POSITION, score = 100, moves = ["e2e4", "d2d4", "g1f3", "b1c3", "c2c4"]): EngineResult {
  return { requestId: "test", fen, engineBuild: ENGINE_BUILD, engineVersion: "Stockfish 19", config: { preset: "standard", multiPv: 5 }, bestMove: moves[0], bestMoveSan: null,
    lines: moves.map((move, index) => ({ multiPv: index + 1, depth: 16, score: { type: "cp", value: score - index * 10 }, lowerBound: false, upperBound: false, pvUci: [move], pvSan: [], replayComplete: true })) };
}
function pair(loss: number, played = "d2d4", fen = DEFAULT_POSITION) {
  const before = result(fen), chess = new Chess(fen), color = chess.turn();
  chess.move({ from: played.slice(0, 2), to: played.slice(2, 4), promotion: played[4] });
  const after = result(chess.fen(), 100 + loss * (color === "w" ? -1 : 1));
  return { before, after, played };
}
describe("analysis overlays", () => {
  it("shows one to five legal ranked arrows in distinct blue shades and rejects stale FENs", () => {
    const data = result();
    expect(topMoveArrows(DEFAULT_POSITION, data, 5).map((arrow) => arrow.color)).toEqual(TOP_MOVE_COLORS);
    expect(topMoveArrows(DEFAULT_POSITION, data, 1)).toHaveLength(1);
    expect(topMoveArrows(DEFAULT_POSITION, data, 9)).toHaveLength(5);
    expect(topMoveArrows(new Chess().fen().replace(" w ", " b "), data, 3)).toEqual([]);
    data.lines[1].pvUci = ["e2e4"]; data.lines[2].pvUci = ["a1a8"];
    expect(topMoveArrows(DEFAULT_POSITION, data, 3)).toHaveLength(1);
  });
  it("validates preferences and migrates older settings with threats off", () => {
    const old = { ...defaultEnginePreferences, showThreats: undefined };
    expect(enginePreferencesSchema.parse(old).showThreats).toBe(false);
    expect(enginePreferencesSchema.safeParse({ ...old, multiPv: 6 }).success).toBe(false);
  });
  it("maps arrow navigation with bounded indices", () => {
    expect(["ArrowUp", "ArrowLeft", "ArrowRight", "ArrowDown"].map((key) => navigationPly(key, 2, 5))).toEqual([0, 1, 3, 5]);
    expect(navigationPly("ArrowLeft", 0, 5)).toBe(0);
    expect(navigationPly("ArrowRight", 5, 5)).toBe(5);
    expect(navigationPly("Enter", 2, 5)).toBeUndefined();
  });
});
describe("opponent immediate threats", () => {
  it("has no threats in the starting position", () => expect(immediateThreats(DEFAULT_POSITION).threats).toEqual([]));
  it("finds opponent winning captures rather than side-to-move opportunities", () => {
    expect(immediateThreats("r3k3/8/8/8/8/Q7/8/4K3 w - - 0 1").threats).toContainEqual({ from: "a8", to: "a3", san: "Rxa3", kind: "capture", gain: 9 });
  });
  it("excludes equal trades and accounts for legal recaptures", () => {
    expect(immediateThreats("4k3/8/8/3p4/4P3/5P2/8/4K3 w - - 0 1").threats).toEqual([]);
  });
  it("shows a current check without making an illegal pass", () => {
    expect(immediateThreats("4k3/8/8/8/8/4r3/8/4K3 w - - 0 1").threats).toEqual([{ from: "e3", to: "e1", san: "e3-e1", kind: "check" }]);
  });
  it("finds mate in one if ignored", () => {
    expect(immediateThreats("8/8/8/8/5q2/8/P4k2/7K w - - 0 1").threats.some((threat) => threat.kind === "mate")).toBe(true);
  });
  it("handles promotion captures and invalid positions", () => {
    expect(immediateThreats("7k/8/8/8/8/8/1p6/R6K w - - 0 1").threats).toContainEqual({ from: "b2", to: "a1", san: "bxa1=Q+", kind: "capture", gain: 13 });
    expect(() => immediateThreats("invalid")).toThrow();
  });
});
describe("transparent move labels", () => {
  it.each([[0, "Excellent"], [15, "Excellent"], [16, "Good"], [40, "Good"], [41, "Inaccuracy"], [100, "Inaccuracy"], [101, "Mistake"], [250, "Mistake"], [251, "Blunder"]])("grades loss %s as %s", (loss, label) => {
    const { before, after, played } = pair(Number(loss)); expect(classifyMove(before, after, played)?.label).toBe(label);
  });
  it("uses Black's perspective", () => {
    const chess = new Chess(); chess.move("e4");
    const { before, after, played } = pair(251, "e7e5", chess.fen()); expect(classifyMove(before, after, played)?.label).toBe("Blunder");
  });
  it("distinguishes Best from Great with a measured alternative gap", () => {
    const { before, after, played } = pair(0, "e2e4");
    expect(classifyMove(before, after, played)?.label).toBe("Best");
    before.lines[1].score = { type: "cp", value: -50 };
    expect(classifyMove(before, after, played)?.label).toBe("Great");
  });
  it("requires a material sacrifice, not just a positive score, for Brilliant", () => {
    const { before, after, played } = pair(0, "a1a7", "r3k3/8/8/8/8/8/8/R3K3 w - - 0 1");
    before.bestMove = played; before.lines[0].pvUci = [played, "a8a7"];
    expect(classifyMove(before, after, played)?.label).toBe("Brilliant");
    before.lines[0].pvUci = [played]; expect(classifyMove(before, after, played)?.label).toBe("Best");
  });
  it("grades shallow results provisionally but rejects bounded, stale or incompatible scores", () => {
    const { before, after, played } = pair(0);
    expect(classifyMove(before, { ...after, engineVersion: "other" }, played)).toBeNull();
    expect(classifyMove(before, { ...after, fen: DEFAULT_POSITION }, played)).toBeNull();
    expect(classifyMove(before, { ...after, config: { ...after.config, multiPv: 1 } }, played)).toBeNull();
    before.lines[0].depth = 2; expect(classifyMove(before, after, played)).toMatchObject({ label: "Excellent", provisional: true });
    before.lines[0].depth = 16; before.lines[0].lowerBound = true; expect(classifyMove(before, after, played)).toBeNull();
  });
  it("handles forced mate separately without invented cp values", () => {
    const { before, after, played } = pair(0);
    after.lines[0].score = { type: "mate", moves: -2 };
    expect(classifyMove(before, after, played)?.label).toBe("Blunder");
    after.lines[0].score = { type: "cp", value: 100 }; before.lines[0].score = { type: "mate", moves: 3 };
    expect(classifyMove(before, after, played)?.label).toBe("Blunder");
  });
});
