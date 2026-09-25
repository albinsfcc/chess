import type { OpeningIndex } from "../openings";
import { assessmentMap, expectedPoints, type MoveLabel } from "./move-quality";
import { evaluationChange } from "./evaluation";
import type { EngineResult } from "../engine/domain";
import type { GameAnalysis, PlannedPosition, PositionAnalysis } from "./domain";
export const REVIEW_LABELS: MoveLabel[] = ["Brilliant", "Great", "Best", "Excellent", "Good", "Book", "Forced", "Inaccuracy", "Mistake", "Blunder", "Miss", "Missed Win"];
/** Local accuracy v1: mean 100*exp(-5*expected-points loss). Not a platform score.
 * Mate transitions use explicit lost/allowed-mate facts, never synthetic centipawns. */
export function moveAccuracy(before: EngineResult, after: EngineResult, played: string, mover: "w" | "b"): number | null {
  const a = before.lines.find((line) => line.multiPv === 1), b = after.lines.find((line) => line.multiPv === 1);
  if (!a || !b || a.lowerBound || a.upperBound || b.lowerBound || b.upperBound || before.engineVersion !== after.engineVersion || before.engineBuild !== after.engineBuild || before.config.preset !== after.config.preset || before.config.multiPv !== after.config.multiPv) return null;
  if (before.bestMove === played) return 100;
  const candidate = before.lines.find((line) => line.pvUci[0] === played && line.depth >= a.depth && !line.lowerBound && !line.upperBound);
  const score = candidate?.score ?? b.score;
  const change = evaluationChange(a.score, score, mover);
  if (change.type === "mate") return change.facts.some((fact) => fact.kind === "lost-forced-mate" || fact.kind === "allowed-forced-mate") ? 0 : 100;
  if (a.score.type !== "cp" || score.type !== "cp") return null;
  const sign = mover === "w" ? 1 : -1;
  const loss = Math.max(0, expectedPoints(a.score.value * sign) - expectedPoints(score.value * sign));
  return 100 * Math.exp(-5 * loss);
}
export function reviewSummary(plan: PlannedPosition[], records: PositionAnalysis[], gameId: string, openingIndex?: OpeningIndex) {
  const players = { w: { total: 0, graded: 0, scored: 0, sum: 0, counts: {} as Partial<Record<MoveLabel, number>> }, b: { total: 0, graded: 0, scored: 0, sum: 0, counts: {} as Partial<Record<MoveLabel, number>> } };
  const rows = records.filter((row) => row.gameId === gameId), byPly = new Map(rows.map((row) => [row.ply, row]));
  const grades = assessmentMap(rows, gameId, undefined, openingIndex);
  for (const position of plan) {
    if (!position.playedMoveUci || !position.movePath) continue;
    const player = players[position.mover]; player.total++;
    const grade = grades.get(position.movePath.join("."));
    if (grade) { player.graded++; player.counts[grade.label] = (player.counts[grade.label] ?? 0) + 1; }
    const before = byPly.get(position.ply), after = byPly.get(position.ply + 1);
    if (!before || !after || before.analysisId !== after.analysisId) continue;
    const value = moveAccuracy(before.result, after.result, position.playedMoveUci, position.mover);
    if (value !== null) { player.sum += value; player.scored++; }
  }
  const finish = (player: typeof players.w) => ({ ...player, accuracy: player.total > 0 && player.scored === player.total ? player.sum / player.scored : null });
  return { w: finish(players.w), b: finish(players.b) };
}
export function fullReview(session: GameAnalysis | null, gameId: string, moves: number) {
  return !!session && session.gameId === gameId && session.selectedTreePath === "main" && session.configuration.startPly === 0 && session.configuration.endPly === moves;
}
