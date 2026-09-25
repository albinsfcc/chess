import type { MoveAssessment, MoveLabel } from "./game-analysis/move-quality";
import { assessPosition } from "./game-analysis/move-quality";
import type { PositionAnalysis } from "./game-analysis/domain";

export const MOVE_BADGES: Record<MoveLabel, { symbol: string; color: string }> = {
  Brilliant: { symbol: "!!", color: "#21b6a5" }, Great: { symbol: "!", color: "#6f98bc" },
  Best: { symbol: "★", color: "#6fa24a" }, Excellent: { symbol: "👍", color: "#72a449" },
  Good: { symbol: "✓", color: "#88b26e" }, Inaccuracy: { symbol: "?!", color: "#ddba35" },
  Mistake: { symbol: "?", color: "#ed9950" }, Blunder: { symbol: "??", color: "#ed5146" },
  Book: { symbol: "▣", color: "#c9986f" }, Forced: { symbol: "→", color: "#90a882" },
  Miss: { symbol: "×", color: "#ed7770" }, "Missed Win": { symbol: "−", color: "#c8a514" },
};
export function moveHighlight(assessment: MoveAssessment | null) {
  const color = assessment ? `${MOVE_BADGES[assessment.label].color}80` : "#eed57166";
  return `linear-gradient(${color}, ${color})`;
}
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
