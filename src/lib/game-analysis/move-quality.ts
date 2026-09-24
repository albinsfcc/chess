import { Chess } from "chess.js";
import type { EngineResult } from "../engine/domain";
import type { PositionAnalysis } from "./domain";
import { evaluationChange } from "./evaluation";

// Original, deliberately conservative heuristics; not a platform's proprietary grading.
export const MOVE_QUALITY = { minimumDepth: 12, excellent: 15, good: 40, inaccuracy: 100, mistake: 250, greatGap: 150, sacrifice: 3 } as const;
export type MoveLabel = "Brilliant" | "Great" | "Best" | "Excellent" | "Good" | "Inaccuracy" | "Mistake" | "Blunder";
export type MoveAssessment = { label: MoveLabel; reason: string };
const values = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
function material(chess: Chess, color: "w" | "b") {
  return chess.board().flat().reduce((sum, piece) => sum + (piece ? values[piece.type] * (piece.color === color ? 1 : -1) : 0), 0);
}
export function classifyMove(before: EngineResult, after: EngineResult, played: string): MoveAssessment | null {
  const a = before.lines.find((line) => line.multiPv === 1), b = after.lines.find((line) => line.multiPv === 1);
  if (!a || !b || a.depth < MOVE_QUALITY.minimumDepth || b.depth < MOVE_QUALITY.minimumDepth || a.lowerBound || a.upperBound || b.lowerBound || b.upperBound || before.engineVersion !== after.engineVersion || before.engineBuild !== after.engineBuild || before.config.preset !== after.config.preset || before.config.multiPv !== after.config.multiPv) return null;
  try {
    const chess = new Chess(before.fen), mover = chess.turn(), alternatives = chess.moves().length, initialMaterial = material(chess, mover);
    chess.move({ from: played.slice(0, 2), to: played.slice(2, 4), promotion: played[4] });
    if (chess.fen() !== after.fen) return null;
    const best = before.bestMove === played, change = evaluationChange(a.score, b.score, mover);
    if (change.type === "mate") {
      if (change.facts.some((fact) => fact.kind === "lost-forced-mate" || fact.kind === "allowed-forced-mate")) return { label: "Blunder", reason: "Lost a forced mate or newly allowed the opponent a forced mate." };
      return best ? { label: "Best", reason: "Matches the engine's best move in a mate sequence; no centipawn loss is assigned." } : null;
    }
    if (change.type !== "cp") return null;
    if (best && change.loss <= MOVE_QUALITY.excellent) {
      const reply = a.pvUci[0] === played ? a.pvUci[1] : undefined;
      if (reply && alternatives > 1 && b.score.type === "cp" && b.score.value * (mover === "w" ? 1 : -1) >= 0) {
        try {
          chess.move({ from: reply.slice(0, 2), to: reply.slice(2, 4), promotion: reply[4] });
          if (initialMaterial - material(chess, mover) >= MOVE_QUALITY.sacrifice) return { label: "Brilliant", reason: "Engine-best move with at most 15 cp loss; its principal reply concedes at least 3 points of material while retaining a nonnegative evaluation. A heuristic, not a proof." };
        } catch { /* An incomplete PV cannot establish a sacrifice. */ }
      }
      const second = before.lines.find((line) => line.multiPv === 2);
      if (alternatives > 1 && a.score.type === "cp" && second?.score.type === "cp" && second.depth >= a.depth && !second.lowerBound && !second.upperBound && (a.score.value - second.score.value) * (mover === "w" ? 1 : -1) >= MOVE_QUALITY.greatGap) return { label: "Great", reason: "Engine-best move with at most 15 cp loss and at least a 150 cp advantage over the second line at the same or greater depth." };
      return { label: "Best", reason: "Matches the engine's best move with at most 15 cp loss." };
    }
    const label = change.loss <= MOVE_QUALITY.excellent ? "Excellent" : change.loss <= MOVE_QUALITY.good ? "Good" : change.loss <= MOVE_QUALITY.inaccuracy ? "Inaccuracy" : change.loss <= MOVE_QUALITY.mistake ? "Mistake" : "Blunder";
    return { label, reason: `${change.loss} cp loss from the mover's perspective, using adjacent completed positions.` };
  } catch { return null; }
}
export function assessPosition(row: PositionAnalysis, records: PositionAnalysis[]): MoveAssessment | null {
  if (!row.playedMoveUci) return null;
  const after = records.find((candidate) => candidate.analysisId === row.analysisId && candidate.ply === row.ply + 1);
  return after ? classifyMove(row.result, after.result, row.playedMoveUci) : null;
}
export function assessmentMap(records: PositionAnalysis[], gameId: string | undefined, visiblePaths?: ReadonlySet<string>) {
  const byPly = new Map(records.map((row) => [`${row.analysisId}:${row.ply}`, row]));
  const assessments = new Map<string, MoveAssessment>();
  for (const row of records) {
    if (row.gameId !== gameId || !row.movePath || !row.playedMoveUci || (visiblePaths && !visiblePaths.has(row.movePath.join(".")))) continue;
    const after = byPly.get(`${row.analysisId}:${row.ply + 1}`);
    const assessment = after ? classifyMove(row.result, after.result, row.playedMoveUci) : null;
    if (assessment) assessments.set(row.movePath.join("."), assessment);
  }
  return assessments;
}
