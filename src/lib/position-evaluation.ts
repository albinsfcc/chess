import type { EngineResult, EngineScore } from "./engine/domain";
import type { GameAnalysis, PositionAnalysis } from "./game-analysis/domain";
import type { NodePath } from "./pgn/domain";
import { formatScore } from "./engine/normalize";

export function displayedAnalysis(fen: string, gameId: string | undefined, path: NodePath, live: EngineResult | null, liveFen: string | null, review: GameAnalysis | null, positions: PositionAnalysis[]): EngineResult | null {
  if (live?.fen === fen && liveFen === fen) return live;
  if (!gameId || review?.gameId !== gameId) return null;
  return positions.find((row) => row.analysisId === review.id && row.gameId === gameId && row.fen === fen && row.result.fen === fen && row.treePath.join(".") === path.join("."))?.result ?? null;
}
export function evaluationBar(score: EngineScore | null, turn: "w" | "b") {
  if (!score) return { whitePercentage: 50, label: "—", description: "Position not analyzed" };
  if (score.type === "mate") {
    const whiteWins = score.moves === 0 ? turn === "b" : score.moves > 0;
    return { whitePercentage: whiteWins ? 100 : 0, label: `${whiteWins ? "" : "-"}M${Math.abs(score.moves)}`, description: score.moves === 0 ? `${whiteWins ? "White" : "Black"} has delivered checkmate` : `${whiteWins ? "White" : "Black"} has mate in ${Math.abs(score.moves)}` };
  }
  const cp = Math.max(-2000, Math.min(2000, score.value));
  return { whitePercentage: 100 / (1 + Math.exp(-cp / 400)), label: formatScore(score), description: `White evaluation ${formatScore(score)} pawns` };
}
