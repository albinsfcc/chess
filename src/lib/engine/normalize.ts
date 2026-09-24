import { Chess } from "chess.js";
import type { EngineLine, EngineScore } from "./domain";
import { uciMove, type UciInfo } from "./uci";

function negate(score: EngineScore): EngineScore {
  return score.type === "cp" ? { type: "cp", value: -score.value || 0 } : { type: "mate", moves: -score.moves || 0 };
}
export function toWhiteScore(score: EngineScore, turn: "w" | "b"): EngineScore { return turn === "w" ? score : negate(score); }
export function toPlayerScore(whiteScore: EngineScore, player: "w" | "b"): EngineScore { return player === "w" ? whiteScore : negate(whiteScore); }
export function formatScore(score: EngineScore): string {
  if (score.type === "mate") return score.moves === 0 ? "Mate" : `M${score.moves > 0 ? "+" : ""}${score.moves}`;
  return `${score.value > 0 ? "+" : ""}${(score.value / 100).toFixed(2)}`;
}
export function validatePosition(fen: string): Chess {
  let chess: Chess;
  try { chess = new Chess(fen); } catch { throw new Error("Invalid position: check the FEN, kings and side to move."); }
  // chess.js validates FEN syntax; also reject impossible king placement and a
  // non-moving king left in check before submitting arbitrary imported positions.
  const board = chess.board().flat().filter((piece) => piece !== null);
  const kings = board.filter((piece) => piece.type === "k");
  const moving = kings.find((piece) => piece.color === chess.turn());
  const other = kings.find((piece) => piece.color !== chess.turn());
  if (!moving || !other || chess.isAttacked(other.square, chess.turn())) throw new Error("Invalid position: the side that just moved has left its king in check.");
  return chess;
}
export function pvToSan(fen: string, moves: string[]): { san: string[]; complete: boolean } {
  const san: string[] = [];
  try {
    const chess = new Chess(fen);
    for (const move of moves) {
      if (!uciMove.test(move)) return { san, complete: false };
      const played = chess.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] });
      san.push(played.san);
    }
    return { san, complete: true };
  } catch { return { san, complete: false }; }
}
export function normalizeInfo(fen: string, info: UciInfo): EngineLine {
  const black = fen.split(" ")[1] === "b";
  const replay = pvToSan(fen, info.pvUci);
  return { multiPv: info.multiPv, depth: info.depth, selectiveDepth: info.selectiveDepth, nodes: info.nodes, nodesPerSecond: info.nodesPerSecond, timeMs: info.timeMs,
    score: toWhiteScore(info.score, black ? "b" : "w"), lowerBound: black ? info.upperBound : info.lowerBound, upperBound: black ? info.lowerBound : info.upperBound,
    pvUci: info.pvUci, pvSan: replay.san, replayComplete: replay.complete };
}
