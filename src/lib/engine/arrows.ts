import { Chess } from "chess.js";
import type { EngineResult } from "./domain";
import { visibleLines } from "./alternatives";

export const TOP_MOVE_COLORS = ["#087cf0", "#3599f3", "#67b5f7", "#95cefa", "#c1e4fc"] as const;
export const THREAT_COLOR = "#ef4444";
export type BoardArrow = { startSquare: string; endSquare: string; color: string };
export function topMoveArrows(fen: string, result: EngineResult | null, count: number): BoardArrow[] {
  if (!result || result.fen !== fen) return [];
  const arrows: BoardArrow[] = [], seen = new Set<string>();
  const moves = visibleLines(result, count).map((line) => line.pvUci[0]);
  if (!moves.length && result.bestMove) moves.push(result.bestMove);
  for (const uci of moves.slice(0, Math.max(1, Math.min(5, count)))) {
    if (!uci || seen.has(uci.slice(0, 4))) continue;
    try {
      new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      seen.add(uci.slice(0, 4));
      arrows.push({ startSquare: uci.slice(0, 2), endSquare: uci.slice(2, 4), color: TOP_MOVE_COLORS[arrows.length] });
    } catch { /* Ignore incomplete or illegal engine lines. */ }
  }
  return arrows;
}
