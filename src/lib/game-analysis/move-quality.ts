import { Chess } from "chess.js";
import type { EngineResult } from "../engine/domain";
import type { PositionAnalysis } from "./domain";
import { evaluationChange } from "./evaluation";
import { bookContinuation } from "../openings";

// Original, deliberately conservative heuristics; not a platform's proprietary grading.
export const MOVE_QUALITY = { minimumDepth: 12, excellent: 15, good: 40, inaccuracy: 100, mistake: 250, greatGap: 150, sacrifice: 3 } as const;
export type MoveLabel = "Brilliant" | "Great" | "Best" | "Excellent" | "Good" | "Inaccuracy" | "Mistake" | "Blunder" | "Book" | "Forced" | "Miss" | "Missed Win";
export type MoveAssessment = { label: MoveLabel; reason: string; provisional?: boolean };
export type GradingContext = { book?: string; previous?: EngineResult };
/** chess.js SAN marks actual mates with #; enumerate legal moves, not a guessed engine score. */
export function intrinsicAssessment(fen: string, played: string, book?: string): MoveAssessment | null {
  try {
    const chess = new Chess(fen), moves = chess.moves({ verbose: true });
    const chosen = moves.find((move) => `${move.from}${move.to}${move.promotion ?? ""}` === played);
    if (!chosen) return null;
    const mates = moves.filter((move) => move.san.endsWith("#"));
    if (mates.length && !chosen.san.endsWith("#")) return { label: "Missed Win", reason: `Missed mate in one: ${mates.map((move) => move.san).join(", ")} would have ended the game immediately.` };
    if (moves.length === 1) return { label: "Forced", reason: "Exactly one legal move was available in this position." };
    if (chosen.san.endsWith("#")) return { label: "Best", reason: "Delivers checkmate immediately." };
    if (book) return { label: "Book", reason: `Listed opening continuation: ${book}. Book membership is not a claim of engine optimality.` };
    return null;
  } catch { return null; }
}
const values = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
function material(chess: Chess, color: "w" | "b") {
  return chess.board().flat().reduce((sum, piece) => sum + (piece ? values[piece.type] * (piece.color === color ? 1 : -1) : 0), 0);
}
export function classifyMove(before: EngineResult, after: EngineResult, played: string, context: GradingContext = {}): MoveAssessment | null {
  const a = before.lines.find((line) => line.multiPv === 1), b = after.lines.find((line) => line.multiPv === 1);
  if (before.engineVersion !== after.engineVersion || before.engineBuild !== after.engineBuild || before.config.preset !== after.config.preset || before.config.multiPv !== after.config.multiPv) return null;
  try {
    const chess = new Chess(before.fen), mover = chess.turn(), alternatives = chess.moves().length, initialMaterial = material(chess, mover);
    chess.move({ from: played.slice(0, 2), to: played.slice(2, 4), promotion: played[4] });
    if (chess.fen() !== after.fen) return null;
    const intrinsic = intrinsicAssessment(before.fen, played, context.book); if (intrinsic) return intrinsic;
    if (!a || !b || a.lowerBound || a.upperBound || b.lowerBound || b.upperBound) return null;
    const provisional = Math.min(a.depth, b.depth) < MOVE_QUALITY.minimumDepth;
    const graded = (label: MoveLabel, reason: string): MoveAssessment => ({ label, reason: `${reason}${provisional ? ` Provisional: completed searches reached depths ${a.depth}/${b.depth}; deeper analysis may change this grade.` : ""}`, ...(provisional ? { provisional: true } : {}) });
    const best = before.bestMove === played, change = evaluationChange(a.score, b.score, mover);
    if (change.type === "mate") {
      if (change.facts.some((fact) => fact.kind === "lost-forced-mate" || fact.kind === "allowed-forced-mate")) return graded("Blunder", "Lost a forced mate or newly allowed the opponent a forced mate.");
      return graded(best ? "Best" : change.facts.some((fact) => fact.kind === "found-forced-mate" || (fact.kind === "maintained-forced-mate" && fact.winner === mover)) ? "Excellent" : "Good", "Mate transition assessed separately: a mating advantage is retained or found, or a forced loss is not newly introduced. No centipawn number is invented for mate.");
    }
    if (change.type !== "cp") return null;
    if (best && change.loss <= MOVE_QUALITY.excellent) {
      const reply = a.pvUci[0] === played ? a.pvUci[1] : undefined;
      if (!provisional && reply && alternatives > 1 && b.score.type === "cp" && b.score.value * (mover === "w" ? 1 : -1) >= 0) {
        try {
          chess.move({ from: reply.slice(0, 2), to: reply.slice(2, 4), promotion: reply[4] });
          if (initialMaterial - material(chess, mover) >= MOVE_QUALITY.sacrifice) return { label: "Brilliant", reason: "Engine-best move with at most 15 cp loss; its principal reply concedes at least 3 points of material while retaining a nonnegative evaluation. A heuristic, not a proof." };
        } catch { /* An incomplete PV cannot establish a sacrifice. */ }
      }
      const second = before.lines.find((line) => line.multiPv === 2);
      if (!provisional && alternatives > 1 && a.score.type === "cp" && second?.score.type === "cp" && second.depth >= a.depth && !second.lowerBound && !second.upperBound && (a.score.value - second.score.value) * (mover === "w" ? 1 : -1) >= MOVE_QUALITY.greatGap) return { label: "Great", reason: "Engine-best move with at most 15 cp loss and at least a 150 cp advantage over the second line at the same or greater depth." };
      return graded("Best", "Matches the engine's best move with at most 15 cp loss.");
    }
    const previous = context.previous, previousLine = previous?.lines.find((line) => line.multiPv === 1), sign = mover === "w" ? 1 : -1;
    if (previous && previous.engineVersion === before.engineVersion && previous.engineBuild === before.engineBuild && previous.config.preset === before.config.preset && previous.config.multiPv === before.config.multiPv && previousLine?.score.type === "cp" && !previousLine.lowerBound && !previousLine.upperBound && a.score.type === "cp" && b.score.type === "cp" && previousLine.score.value * sign <= 50 && a.score.value * sign >= 200 && b.score.value * sign >= -50 && b.score.value * sign <= 50 && change.loss >= 150) return graded("Miss", "The opponent's preceding move offered at least a +2.00 advantage; this move returned it to roughly equal (±0.50), losing at least 1.50 pawns of evaluation.");
    const label = change.loss <= MOVE_QUALITY.excellent ? "Excellent" : change.loss <= MOVE_QUALITY.good ? "Good" : change.loss <= MOVE_QUALITY.inaccuracy ? "Inaccuracy" : change.loss <= MOVE_QUALITY.mistake ? "Mistake" : "Blunder";
    return graded(label, `${change.loss} cp loss from the mover's perspective, using adjacent completed positions.`);
  } catch { return null; }
}
export function assessPosition(row: PositionAnalysis, records: PositionAnalysis[]): MoveAssessment | null {
  if (!row.playedMoveUci) return null;
  const after = records.find((candidate) => candidate.analysisId === row.analysisId && candidate.ply === row.ply + 1);
  const book = bookContinuation(row.fen, row.playedMoveUci)?.name;
  return after ? classifyMove(row.result, after.result, row.playedMoveUci, { book, previous: records.find((candidate) => candidate.analysisId === row.analysisId && candidate.ply === row.ply - 1)?.result }) : intrinsicAssessment(row.fen, row.playedMoveUci, book);
}
export function assessmentMap(records: PositionAnalysis[], gameId: string | undefined, visiblePaths?: ReadonlySet<string>) {
  const byPly = new Map(records.map((row) => [`${row.analysisId}:${row.ply}`, row]));
  const assessments = new Map<string, MoveAssessment>();
  for (const row of records) {
    if (row.gameId !== gameId || !row.movePath || !row.playedMoveUci || (visiblePaths && !visiblePaths.has(row.movePath.join(".")))) continue;
    const after = byPly.get(`${row.analysisId}:${row.ply + 1}`);
    const book = bookContinuation(row.fen, row.playedMoveUci)?.name;
    const assessment = after ? classifyMove(row.result, after.result, row.playedMoveUci, { book, previous: byPly.get(`${row.analysisId}:${row.ply - 1}`)?.result }) : intrinsicAssessment(row.fen, row.playedMoveUci, book);
    if (assessment) assessments.set(row.movePath.join("."), assessment);
  }
  return assessments;
}
