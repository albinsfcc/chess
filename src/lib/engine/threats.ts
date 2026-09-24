import { Chess, type Move, type PieceSymbol, type Square } from "chess.js";
import { validatePosition } from "./normalize";

const value: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
export type Threat = { from: string; to: string; san: string; kind: "check" | "mate" | "capture"; gain?: number };
export type ThreatResult = { fen: string; threats: Threat[]; limited: boolean };
const gain = (move: Move) => (move.captured ? value[move.captured] : 0) + (move.promotion ? value[move.promotion] - 1 : 0);

/** Optional legal recaptures on one square; bounded and conservative on exhaustion. */
function recaptures(chess: Chess, square: Square, budget: { left: number }, depth = 0): number | null {
  if (--budget.left < 0 || depth > 12) return null;
  let best = 0;
  for (const move of chess.moves({ verbose: true }).filter((move) => move.to === square && move.captured)) {
    chess.move(move);
    const reply = recaptures(chess, square, budget, depth + 1);
    chess.undo();
    if (reply === null) return null;
    best = Math.max(best, gain(move) - reply);
  }
  return best;
}

/** Opponent's immediate tactics IF ignored. No null move is sent to Stockfish.
 * This is not a full tactical proof: deeper combinations and quiet threats are omitted.
 * Runs in the existing data worker, never as a second engine or a main-thread search.
 */
export function immediateThreats(fen: string): ThreatResult {
  const current = validatePosition(fen), opponent = current.turn() === "w" ? "b" : "w";
  if (current.isCheck()) {
    const king = current.board().flat().find((piece) => piece?.type === "k" && piece.color === current.turn())!;
    return { fen, limited: false, threats: current.attackers(king.square, opponent).map((from) => ({ from, to: king.square, san: `${from}-${king.square}`, kind: "check" })) };
  }
  if (current.isStalemate()) return { fen, threats: [], limited: false };
  const fields = fen.split(" "); fields[1] = opponent; fields[3] = "-";
  const chess = new Chess(fields.join(" ")), threats: Threat[] = [], budget = { left: 2500 };
  let limited = false;
  for (const move of chess.moves({ verbose: true })) {
    chess.move(move);
    if (chess.isCheckmate()) threats.push({ from: move.from, to: move.to, san: move.san, kind: "mate" });
    else if (move.captured) {
      const reply = recaptures(chess, move.to, budget);
      if (reply === null) limited = true;
      else if (gain(move) - reply >= 1) threats.push({ from: move.from, to: move.to, san: move.san, kind: "capture", gain: gain(move) - reply });
    }
    chess.undo();
    if (budget.left < 0) break;
  }
  threats.sort((a, b) => Number(b.kind === "mate") - Number(a.kind === "mate") || (b.gain ?? 0) - (a.gain ?? 0));
  return { fen, threats: threats.slice(0, 5), limited: limited || threats.length > 5 };
}
