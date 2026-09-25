import { Chess } from "chess.js";
import type { EngineResult, EngineScore } from "./domain";
export function usableResult(result: EngineResult): boolean {
  const primary = result.lines.find((line) => line.multiPv === 1);
  return !!primary && !primary.lowerBound && !primary.upperBound;
}
/** Terminal chess facts are exact even when Stockfish emits no info line. */
export function withTerminalScore(result: EngineResult): EngineResult {
  const chess = new Chess(result.fen);
  const score: EngineScore | null = chess.isCheckmate() ? { type: "mate", moves: 0 } : chess.isStalemate() || chess.isInsufficientMaterial() ? { type: "cp", value: 0 } : null;
  if (!score) return result;
  return { ...result, bestMove: null, bestMoveSan: null, lines: [{ multiPv: 1, depth: 0, score, lowerBound: false, upperBound: false, pvUci: [], pvSan: [], replayComplete: true }] };
}
