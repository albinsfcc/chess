import { Chess } from "chess.js";
import { expect, it } from "vitest";
import { castlingDropTarget } from "./castling-drop";

it("accepts overshooting either castle for both colours", () => {
  for (const side of ["w", "b"]) {
    const rank = side === "w" ? "1" : "8";
    for (const [drop, target] of [["h", "g"], ["b", "c"], ["a", "c"]]) {
      const chess = new Chess(`r3k2r/8/8/8/8/8/8/R3K2R ${side} KQkq - 0 1`);
      const to = castlingDropTarget(chess, `e${rank}`, `${drop}${rank}`);
      expect(to).toBe(`${target}${rank}`);
      expect(chess.move({ from: `e${rank}`, to })?.san).toMatch(/^O-O/);
    }
  }
});
it("does not bypass check, occupied paths, castling rights, or turn", () => {
  for (const fen of [
    "4k3/8/8/8/8/8/8/4KB1R w K - 0 1",
    "4kr2/8/8/8/8/8/8/4K2R w K - 0 1",
    "k3r3/8/8/8/8/8/8/4K2R w K - 0 1",
    "4k3/8/8/8/8/8/8/4K2R w - - 0 1",
    "4k3/8/8/8/8/8/8/4K2R b K - 0 1",
  ]) expect(castlingDropTarget(new Chess(fen), "e1", "h1")).toBe("h1");
});
it("leaves normal king moves, other pieces and different ranks unchanged", () => {
  const chess = new Chess("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
  for (const [from, to] of [["e1", "g1"], ["e1", "c1"], ["e1", "d1"], ["e1", "a2"], ["a1", "b1"]]) expect(castlingDropTarget(chess, from, to)).toBe(to);
});
