import type { MoveAssessment, MoveLabel } from "./game-analysis/move-quality";
import { assessPosition } from "./game-analysis/move-quality";
import type { PositionAnalysis } from "./game-analysis/domain";

export const MOVE_BADGES: Record<MoveLabel, { symbol: string; color: string }> = {
  Brilliant: { symbol: "!!", color: "#5546a6" }, Great: { symbol: "!", color: "#245f91" },
  Best: { symbol: "★", color: "#27664b" }, Excellent: { symbol: "+", color: "#365f66" },
  Good: { symbol: "✓", color: "#52616b" }, Inaccuracy: { symbol: "?!", color: "#805f16" },
  Mistake: { symbol: "?", color: "#914827" }, Blunder: { symbol: "??", color: "#9b3153" },
};
export function badgeSquare(square: string, orientation: "white" | "black") {
  const file = square.charCodeAt(0) - 97, rank = Number(square[1]) - 1;
  return orientation === "white" ? { column: file, row: 7 - rank } : { column: 7 - file, row: rank };
}
export function savedMoveAssessment(fen: string, gameId: string | undefined, path: number[], records: PositionAnalysis[]): MoveAssessment | null {
  if (!gameId || !path.length) return null;
  const played = records.find((row) => row.gameId === gameId && row.movePath?.join(".") === path.join("."));
  if (!played || !records.some((row) => row.analysisId === played.analysisId && row.ply === played.ply + 1 && row.result.fen === fen)) return null;
  return assessPosition(played, records);
}
