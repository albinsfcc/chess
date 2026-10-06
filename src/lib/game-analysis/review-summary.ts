import { Chess } from "chess.js";
import type { OpeningIndex } from "../openings";
import { assessmentMap, type MoveLabel } from "./move-quality";
import { ACCURACY_MODEL, scoreLoss } from "./move-loss";
import type { EngineResult } from "../engine/domain";
import type { GameAnalysis, PlannedPosition, PositionAnalysis } from "./domain";
export const ACCURACY_DECAY = ACCURACY_MODEL.decay;
export const REVIEW_LABELS: MoveLabel[] = ["Brilliant", "Great", "Best", "Excellent", "Good", "Book", "Forced", "Inaccuracy", "Mistake", "Blunder", "Miss", "Missed Win"];
export const REVIEW_PHASES = ["Open", "Mid", "End"] as const;
/** Display grouping: first 10 moves are opening; <=13 non-pawn material points is endgame. */
export function reviewPhase(fen: string, ply: number): typeof REVIEW_PHASES[number] {
  const values: Record<string, number> = { n: 3, b: 3, r: 5, q: 9 };
  const material = [...fen.split(" ")[0].toLowerCase()].reduce((sum, piece) => sum + (values[piece] ?? 0), 0);
  return material <= 13 ? "End" : ply < 20 ? "Open" : "Mid";
}
/** Local accuracy v2: mean 100*exp(-5*combined outcome/material loss). Not a platform score.
 * Mate transitions use explicit lost/allowed-mate facts, never synthetic centipawns. */
export function moveAccuracy(before: EngineResult, after: EngineResult, played: string, mover: "w" | "b"): number | null {
  const a = before.lines.find((line) => line.multiPv === 1), b = after.lines.find((line) => line.multiPv === 1);
  if (!a || !b || a.lowerBound || a.upperBound || b.lowerBound || b.upperBound || before.engineVersion !== after.engineVersion || before.engineBuild !== after.engineBuild || before.config.preset !== after.config.preset || before.config.multiPv !== after.config.multiPv) return null;
  if (before.bestMove === played) return 100;
  const candidate = before.lines.find((line) => line.pvUci[0] === played && line.depth >= a.depth && !line.lowerBound && !line.upperBound);
  const score = candidate?.score ?? b.score;
  return 100 * Math.exp(-ACCURACY_DECAY * scoreLoss(a.score, score, mover));
}
export function reviewSummary(plan: PlannedPosition[], records: PositionAnalysis[], gameId: string, openingIndex?: OpeningIndex) {
  const phaseScores = () => Object.fromEntries(REVIEW_PHASES.map(phase => [phase, { total: 0, scored: 0, sum: 0 }])) as Record<typeof REVIEW_PHASES[number], { total: number; scored: number; sum: number }>;
  const phases = { w: phaseScores(), b: phaseScores() };
  const players = { w: { total: 0, eligible: 0, graded: 0, scored: 0, sum: 0, counts: {} as Partial<Record<MoveLabel, number>> }, b: { total: 0, eligible: 0, graded: 0, scored: 0, sum: 0, counts: {} as Partial<Record<MoveLabel, number>> } };
  const rows = records.filter((row) => row.gameId === gameId), byPly = new Map(rows.map((row) => [row.ply, row]));
  const grades = assessmentMap(rows, gameId, undefined, openingIndex);
  for (const position of plan) {
    if (!position.playedMoveUci || !position.movePath) continue;
    const player = players[position.mover]; player.total++;
    const phase = phases[position.mover][reviewPhase(position.fen, position.ply)];
    const grade = grades.get(position.movePath.join("."));
    if (grade) { player.graded++; player.counts[grade.label] = (player.counts[grade.label] ?? 0) + 1; }
    // Forced moves remain in the move list but never inflate either accuracy mean.
    if (new Chess(position.fen).moves().length === 1) continue;
    player.eligible++; phase.total++;
    const before = byPly.get(position.ply), after = byPly.get(position.ply + 1);
    if (!before || !after || before.analysisId !== after.analysisId) continue;
    const value = moveAccuracy(before.result, after.result, position.playedMoveUci, position.mover);
    if (value !== null) { player.sum += value; player.scored++; phase.sum += value; phase.scored++; }
  }
  const finish = (player: typeof players.w) => ({ ...player, accuracy: player.eligible > 0 && player.scored === player.eligible ? player.sum / player.scored : null });
  return { w: { ...finish(players.w), phases: phases.w }, b: { ...finish(players.b), phases: phases.b } };
}
export function fullReview(session: GameAnalysis | null, gameId: string, moves: number) {
  return !!session && session.gameId === gameId && session.selectedTreePath === "main" && session.configuration.startPly === 0 && session.configuration.endPly === moves;
}
