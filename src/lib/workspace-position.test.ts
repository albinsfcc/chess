import { describe, expect, it } from "vitest";
import { Chess, DEFAULT_POSITION } from "chess.js";
import { validatePgn } from "./pgn/validate";
import { reconstructPosition } from "./pgn/position";
import { createGame, navigateTo } from "./game";
import { clocksAt, formatClock, initialClock, legalDestinations, materialBalance, panelOrder, parseClock, workspacePosition } from "./workspace-position";

async function position(pgn: string, path: number[]) {
  const imported = (await validatePgn(pgn)).validGames[0];
  if (!imported) throw new Error("Invalid fixture PGN");
  const state = reconstructPosition(imported.tree, path);
  return { imported, state, info: workspacePosition(state.game, imported, state.navigationPaths) };
}
describe("player panels and historical clocks", () => {
  it("swaps complete sides and uses names, ratings, turn and fallback metadata", async () => {
    expect(panelOrder("white")).toEqual(["b", "w"]); expect(panelOrder("black")).toEqual(["w", "b"]);
    const { info } = await position('[White "Alice"]\n[BlackElo "1500"]\n1. e4 *', [0]);
    expect(info.players.w).toMatchObject({ name: "Alice", rating: null, toMove: false });
    expect(info.players.b).toMatchObject({ name: "Black", rating: 1500, toMove: true });
    expect(workspacePosition(createGame(), null, []).players.w.name).toBe("White");
  });
  it("preserves fractional clock precision and rejects malformed clocks", () => {
    expect(formatClock(parseClock("0:05:21.250"))).toBe("5:21.250");
    expect(formatClock(parseClock("2:03:04.0012"))).toBe("2:03:04.0012");
    expect(formatClock(parseClock("0:00:00.0"))).toBe("0:00.0");
    for (const raw of ["?", "0:99:00", "-1:00:00", "321", "0:01:60"]) expect(parseClock(raw)).toBeNull();
    expect(formatClock(null)).toBe("—:—");
  });
  it("uses only an unambiguous initial TimeControl and never guesses setup clocks", () => {
    for (const tc of ["300", "300+2", "40/300:60+2"]) expect(formatClock(initialClock(tc, DEFAULT_POSITION))).toBe("5:00");
    for (const tc of ["?", "-", "*60", "invalid"]) expect(initialClock(tc, DEFAULT_POSITION)).toBeNull();
    expect(initialClock("300+2", "7k/8/8/8/8/8/8/7K w - - 0 1")).toBeNull();
  });
  it("reconstructs both clocks backwards, on recursive branches and on return to main line", async () => {
    const pgn = '[TimeControl "300+2"]\n1. e4 {[%clk 0:04:59.250]} (1. d4 {[%clk 0:04:58.1]} d5 {[%clk 0:04:57.99]} (1... Nf6 {[%clk 0:04:56.125]})) e5 {[%clk 0:04:55]} 2. Nf3 *';
    const main = await position(pgn, [2]);
    expect(formatClock(main.info.players.w.clock)).toBe("4:59.250"); expect(formatClock(main.info.players.b.clock)).toBe("4:55");
    const initial = clocksAt(main.imported, main.state.navigationPaths, 0); expect(formatClock(initial.w)).toBe("5:00");
    const back = clocksAt(main.imported, main.state.navigationPaths, 1); expect(formatClock(back.b)).toBe("5:00");
    const branch = await position(pgn, [0, 0, 1, 0, 0]);
    expect(formatClock(branch.info.players.w.clock)).toBe("4:58.1"); expect(formatClock(branch.info.players.b.clock)).toBe("4:56.125");
    expect(formatClock((await position(pgn, [1])).info.players.b.clock)).toBe("4:55");
    expect((await position('1. e4 {[%clk 0:00:04.8]} e5 *', [1])).info.players.b.clock).toBeNull();
  });
});
describe("captured pieces and material", () => {
  it("replays normal and en passant captures, undo, variations and reset", async () => {
    const main = await position('1. e4 a6 2. e5 d5 3. exd6 (3. Nf3) exd6 *', [5]);
    expect(main.info.players.w.captured).toEqual(["p"]); expect(main.info.players.b.captured).toEqual(["p"]);
    expect(main.info.players.w.advantage).toBe(0);
    const back = workspacePosition(navigateTo(main.state.game, 4), main.imported, main.state.navigationPaths);
    expect(back.players.w.captured).toEqual([]);
    const variation = reconstructPosition(main.imported.tree, [4, 0, 0]);
    expect(workspacePosition(variation.game, main.imported, variation.navigationPaths).players.w.captured).toEqual([]);
    expect(workspacePosition(createGame(), null, []).players.b.captured).toEqual([]);
  });
  it("handles promotion captures and capture of a promoted piece without inventory guesses", async () => {
    const first = await position('[SetUp "1"]\n[FEN "r6k/1P6/8/8/8/8/8/7K w - - 0 1"]\n1. bxa8=Q+ *', [0]);
    expect(first.info.players.w.captured).toEqual(["r"]); expect(first.info.players.w.advantage).toBe(9);
    expect(workspacePosition(navigateTo(first.state.game, 0), first.imported, first.state.navigationPaths).players.w.captured).toEqual([]);
    const second = await position('[SetUp "1"]\n[FEN "r6k/2P5/8/8/8/8/8/7K w - - 0 1"]\n1. c8=Q+ Rxc8 *', [1]);
    expect(second.info.players.b.captured).toEqual(["q"]); expect(second.info.players.b.advantage).toBe(5);
  });
  it("values the current board including multiple promoted queens", () => {
    expect(materialBalance(new Chess("7k/8/8/8/8/8/QQ6/K7 w - - 0 1"))).toBe(18);
    expect(materialBalance(new Chess())).toBe(0);
  });
  it("orders captures by queen, rook, bishop, knight, pawn rather than capture time", async () => {
    const { info } = await position('[SetUp "1"]\n[FEN "7k/8/n7/q7/r7/b7/p7/R6K w - - 0 1"]\n1. Rxa2 Kg8 2. Rxa3 Kh8 3. Rxa4 Kg8 4. Rxa5 Kh8 5. Rxa6 *', [8]);
    expect(info.players.w.captured).toEqual(["q", "r", "b", "n", "p"]);
  });
});
describe("shared legal destination selection", () => {
  it("excludes the wrong side and disabled boards and deduplicates promotions", () => {
    const chess = new Chess();
    expect(legalDestinations(chess, "e2")).toEqual([{ square: "e3", capture: false }, { square: "e4", capture: false }]);
    expect(legalDestinations(chess, "e7")).toEqual([]); expect(legalDestinations(chess, "e2", false)).toEqual([]); expect(legalDestinations(chess, "bad")).toEqual([]);
    expect(legalDestinations(new Chess("r6k/1P6/8/8/8/8/8/7K w - - 0 1"), "b7").filter((move) => move.square === "a8")).toEqual([{ square: "a8", capture: true }]);
    for (const san of ["e4", "a6", "e5", "d5"]) chess.move(san);
    expect(legalDestinations(chess, "e5")).toContainEqual({ square: "d6", capture: true });
  });
});
