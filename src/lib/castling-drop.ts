import type { Chess, Square } from "chess.js";

/** Accept a king dropped beyond its castling destination on the same rank.
 * Resolve only a currently legal castle; the regular move path still validates it.
 */
export function castlingDropTarget(chess: Chess, from: string, to: string): string {
  if (!/^[a-h][1-8]$/.test(from) || !/^[a-h][1-8]$/.test(to)) return to;
  const king = chess.get(from as Square);
  if (king?.type !== "k" || king.color !== chess.turn() || from !== `e${king.color === "w" ? "1" : "8"}` || to[1] !== from[1]) return to;
  const destination = to[0] === "h" ? `g${from[1]}` : ["a", "b"].includes(to[0]) ? `c${from[1]}` : null;
  if (!destination) return to;
  return chess.moves({ square: from as Square, verbose: true }).some(move => move.to === destination && /[kq]/.test(move.flags)) ? destination : to;
}
