import { describe, expect, it } from "vitest";
import { DEFAULT_POSITION } from "chess.js";
import { checkedKing, chessAt, createGame, gameStatus, navigateTo, tryMove, type GameState, type PromotionPiece } from "./game";

function move(game: GameState, from: string, to: string, promotion?: PromotionPiece) {
  const result = tryMove(game, from, to, promotion);
  if (result.kind !== "moved") throw new Error(`Expected legal move: ${from}${to}`);
  return result.game;
}

describe("game state", () => {
  it("starts in the standard position with twenty legal moves", () => {
    const chess = chessAt(createGame());
    expect(chess.fen()).toBe(DEFAULT_POSITION);
    expect(chess.moves()).toHaveLength(20);
  });

  it("accepts legal moves without mutating the previous state", () => {
    const initial = createGame();
    const game = move(initial, "e2", "e4");
    expect(initial.cursor).toBe(0);
    expect(initial.moves).toEqual([]);
    expect(game.moves[0].san).toBe("e4");
    expect(chessAt(game).get("e4")).toMatchObject({ type: "p", color: "w" });
    expect(chessAt(game).turn()).toBe("b");
  });

  it("rejects illegal moves, wrong turns, and malformed squares", () => {
    for (const [from, to] of [["e2", "e5"], ["e7", "e5"], ["wat", "e4"], ["e2", "e2"]]) {
      expect(tryMove(createGame(), from, to).kind).toBe("illegal");
    }
  });

  it("undoes and redoes while retaining move history", () => {
    const game = move(move(createGame(), "e2", "e4"), "e7", "e5");
    const undo = navigateTo(game, 1);
    expect(chessAt(undo).get("e7")?.type).toBe("p");
    expect(undo.moves).toHaveLength(2);
    expect(chessAt(navigateTo(undo, 2)).fen()).toBe(chessAt(game).fen());
    expect(chessAt(navigateTo(game, -10)).fen()).toBe(DEFAULT_POSITION);
    expect(navigateTo(game, 50).cursor).toBe(2);
    expect(navigateTo(game, NaN)).toBe(game);
  });

  it("discards the redo line only after a new legal move", () => {
    const history = move(move(createGame(), "e2", "e4"), "e7", "e5");
    const rewound = navigateTo(history, 1);
    expect(tryMove(rewound, "c7", "c4").kind).toBe("illegal");
    expect(rewound.moves).toHaveLength(2);
    const branch = move(rewound, "c7", "c5");
    expect(branch.moves.map((entry) => entry.san)).toEqual(["e4", "c5"]);
  });

  it("requests promotion without changing position", () => {
    const game = createGame("7k/P7/8/8/8/8/8/7K w - - 0 1");
    expect(tryMove(game, "a7", "a8")).toEqual({ kind: "promotion", from: "a7", to: "a8" });
    expect(game.cursor).toBe(0);
  });

  it.each<PromotionPiece>(["q", "r", "b", "n"])("supports promotion to %s and redo", (piece) => {
    const game = move(createGame("7k/P7/8/8/8/8/8/7K w - - 0 1"), "a7", "a8", piece);
    expect(chessAt(game).get("a8")?.type).toBe(piece);
    expect(chessAt(navigateTo(navigateTo(game, 0), 1)).get("a8")?.type).toBe(piece);
  });

  it("supports capture promotion for Black", () => {
    const game = move(createGame("7k/8/8/8/8/8/p7/1R5K b - - 0 1"), "a2", "b1", "n");
    expect(chessAt(game).get("b1")).toMatchObject({ type: "n", color: "b" });
  });

  it("handles castling and restores both pieces on undo", () => {
    const game = move(createGame("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1"), "e1", "g1");
    expect(chessAt(game).get("f1")?.type).toBe("r");
    expect(game.moves[0].san).toBe("O-O");
    expect(chessAt(navigateTo(game, 0)).get("h1")?.type).toBe("r");
  });

  it("handles en passant including captured-pawn restoration", () => {
    const game = move(createGame("7k/8/8/3pP3/8/8/8/7K w - d6 0 1"), "e5", "d6");
    expect(chessAt(game).get("d5")).toBeUndefined();
    expect(chessAt(navigateTo(game, 0)).get("d5")?.color).toBe("b");
  });

  it("rejects exposing the king and identifies the checked king", () => {
    const pinned = createGame("4r2k/8/8/8/8/8/4R3/4K3 w - - 0 1");
    expect(tryMove(pinned, "e2", "d2").kind).toBe("illegal");
    const checked = chessAt(createGame("4r2k/8/8/8/8/8/8/4K3 w - - 0 1"));
    expect(checkedKing(checked)).toBe("e1");
    expect(gameStatus(checked)).toBe("White to move · check");
    expect(checkedKing(chessAt(createGame()))).toBeUndefined();
  });

  it("detects checkmate and prevents subsequent moves", () => {
    let game = createGame();
    for (const [from, to] of [["f2", "f3"], ["e7", "e5"], ["g2", "g4"], ["d8", "h4"]]) game = move(game, from, to);
    expect(gameStatus(chessAt(game))).toBe("Checkmate · Black wins");
    expect(checkedKing(chessAt(game))).toBe("e1");
    expect(tryMove(game, "a2", "a3").kind).toBe("illegal");
  });

  it("retains repetition detection through navigation", () => {
    let game = createGame();
    for (let cycle = 0; cycle < 2; cycle++) {
      for (const [from, to] of [["g1", "f3"], ["g8", "f6"], ["f3", "g1"], ["f6", "g8"]]) game = move(game, from, to);
    }
    expect(gameStatus(chessAt(navigateTo(navigateTo(game, 3), 8)))).toBe("Draw · threefold repetition");
  });

  it("reset creates a clean standard game", () => {
    const previous = move(createGame(), "e2", "e4");
    const reset = createGame();
    expect(reset.moves).toEqual([]);
    expect(chessAt(reset).fen()).toBe(DEFAULT_POSITION);
    expect(previous.cursor).toBe(1);
  });
});
