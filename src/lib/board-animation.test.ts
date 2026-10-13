import { expect, it } from "vitest";
import { Chess } from "chess.js";
import { promotionTransition } from "./board-animation";
import { chessAt, positionFen, type GameState } from "./game";

it("preserves exact positions when revisiting cached plies and branching", () => {
  const chess = new Chess(); chess.loadPgn("1. e4 a6 2. e5 d5 3. exd6 exd6 4. Nf3 Nf6 5. Bc4 Be7 6. O-O O-O");
  const game: GameState = { initialFen: new Chess().fen(), moves: chess.history({ verbose: true }).map(({ from, to, san }) => ({ from, to, san })), cursor: 12 };
  for (const cursor of [12, 3, 0, 8, 5, 12]) {
    expect(positionFen({ ...game, cursor })).toBe(chessAt({ ...game, cursor }).fen());
  }
  const alternate = new Chess(positionFen({ ...game, cursor: 1 }));
  const move = alternate.move("c5");
  expect(positionFen({ ...game, cursor: 2, moves: [game.moves[0], { from: move.from, to: move.to, san: move.san }] })).toBe(alternate.fen());
  expect(positionFen(game)).toBe(chess.fen());
});

it("does not share mutable chess state with position consumers", () => {
  const game: GameState = { initialFen: new Chess().fen(), moves: [], cursor: 0 };
  const fen = positionFen(game);
  chessAt(game).move("e4");
  expect(positionFen(game)).toBe(fen);
});

it("protects promotion and reversal, including underpromotion and capture", () => {
  for (const san of ["bxa8=Q+", "bxa8=N", "b8=R"]) {
    const chess = new Chess("r6k/1P6/8/8/8/8/8/7K w - - 0 1"), before = chess.fen();
    chess.move(san);
    expect(promotionTransition(before, chess.fen())).toBe(true);
    expect(promotionTransition(chess.fen(), before)).toBe(true);
  }
  const chess = new Chess(), before = chess.fen(); chess.move("e4");
  expect(promotionTransition(before, chess.fen())).toBe(false);
});
