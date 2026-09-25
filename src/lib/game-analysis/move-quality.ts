import { Chess } from "chess.js";
import type { EngineResult } from "../engine/domain";
import type { PositionAnalysis } from "./domain";
import { evaluationChange } from "./evaluation";
import { bookContinuation } from "../openings";

// Original, deliberately conservative heuristics; not a platform's proprietary grading.
export const MOVE_QUALITY = { minimumDepth: 12, excellent: 0.02, good: 0.05, inaccuracy: 0.10, mistake: 0.20, greatGap: 150, sacrifice: 2, sacrificePlies: 6, healthy: -50, winning: 600, greatPointsGap: 0.15, brilliantMaxCpLoss: 30 } as const;
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
/** Rating-neutral expected-points approximation, not Chess.com's unpublished model. */
export function expectedPoints(cp: number) { return 1 / (1 + Math.exp(-Math.max(-10000, Math.min(10000, cp)) / 400)); }
export function pointsLossLabel(loss: number): MoveLabel {
  return loss <= MOVE_QUALITY.excellent ? "Excellent" : loss <= MOVE_QUALITY.good ? "Good" : loss <= MOVE_QUALITY.inaccuracy ? "Inaccuracy" : loss <= MOVE_QUALITY.mistake ? "Mistake" : "Blunder";
}
/** Conservative evidence: the played piece itself is newly offered now, not
 * an unrelated piece lost later or a temporary deficit in an ordinary exchange. */
function sacrificeInLine(fen: string, played: string, continuation: string[]): boolean {
  const chess = new Chess(fen), mover = chess.turn(), initial = material(chess, mover);
  try {
    const offered = chess.move({ from: played.slice(0, 2), to: played.slice(2, 4), promotion: played[4] });
    if (offered.piece === "p" || offered.piece === "k" || offered.flags.includes("k") || offered.flags.includes("q")) return false;
    // A later tactic cannot retroactively make a quiet move a sacrifice.
    if (!chess.moves({ verbose: true }).some((move) => move.to === offered.to && move.captured === offered.piece)) return false;
    for (const uci of continuation.slice(0, MOVE_QUALITY.sacrificePlies)) {
      const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      // Moving it again creates a different offer, attributable to that later move.
      if (move.color === mover && move.from === offered.to) return false;
      if (move.color !== mover && move.to === offered.to && move.captured === offered.piece) {
        let remainingLoss = initial - material(chess, mover);
        for (const recapture of chess.moves({ verbose: true }).filter((reply) => reply.to === move.to && reply.captured)) {
          chess.move(recapture); remainingLoss = Math.min(remainingLoss, initial - material(chess, mover)); chess.undo();
        }
        return remainingLoss >= MOVE_QUALITY.sacrifice;
      }
    }
  } catch { /* Incomplete or illegal PV supplies no sacrifice evidence. */ }
  return false;
}
export function classifyMove(before: EngineResult, after: EngineResult, played: string, context: GradingContext = {}): MoveAssessment | null {
  const a = before.lines.find((line) => line.multiPv === 1), b = after.lines.find((line) => line.multiPv === 1);
  if (before.engineVersion !== after.engineVersion || before.engineBuild !== after.engineBuild || before.config.preset !== after.config.preset || before.config.multiPv !== after.config.multiPv) return null;
  try {
    const chess = new Chess(before.fen), mover = chess.turn(), sign = mover === "w" ? 1 : -1;
    chess.move({ from: played.slice(0, 2), to: played.slice(2, 4), promotion: played[4] });
    if (chess.fen() !== after.fen) return null;
    const intrinsic = intrinsicAssessment(before.fen, played, context.book); if (intrinsic) return intrinsic;
    if (!a || !b || a.lowerBound || a.upperBound || b.lowerBound || b.upperBound) return null;
    const provisional = Math.min(a.depth, b.depth) < MOVE_QUALITY.minimumDepth;
    const graded = (label: MoveLabel, reason: string): MoveAssessment => ({ label, reason: `${reason}${provisional ? ` Provisional: completed searches reached depths ${a.depth}/${b.depth}; deeper analysis may change this grade.` : ""}`, ...(provisional ? { provisional: true } : {}) });
    const best = before.bestMove === played;
    // Prefer a comparable same-position MultiPV score over a separate search's drift.
    const candidate = before.lines.find((line) => line.pvUci[0] === played && line.depth >= a.depth && !line.lowerBound && !line.upperBound);
    const playedScore = candidate?.score ?? b.score;
    const loss = a.score.type === "cp" && playedScore.type === "cp" ? Math.max(0, expectedPoints(a.score.value * sign) - expectedPoints(playedScore.value * sign)) : null;
    const sound = b.score.type === "cp" ? b.score.value * sign >= MOVE_QUALITY.healthy : b.score.moves * sign > 0;
    // An upper bound from the mover's perspective can establish that the alternative
    // is not winning; never mistake the winning top move itself for a winning fallback.
    const alternative = before.lines.find((line) => line.multiPv === 2 && line.depth >= a.depth - 1 && !(sign === 1 ? line.lowerBound : line.upperBound));
    const alreadyWinning = alternative ? alternative.score.type === "cp" ? alternative.score.value * sign >= MOVE_QUALITY.winning : alternative.score.moves * sign > 0 : a.score.type === "cp" ? a.score.value * sign >= MOVE_QUALITY.winning : a.score.moves * sign > 0;
    // A large expected-outcome separation is a critical move, even if a temporary
    // material offer appears in its forcing line. This takes precedence over Brilliant.
    if (best && !provisional && a.score.type === "cp" && alternative?.score.type === "cp" && a.score.value * sign >= MOVE_QUALITY.healthy && (a.score.value - alternative.score.value) * sign >= MOVE_QUALITY.greatGap && expectedPoints(a.score.value * sign) - expectedPoints(alternative.score.value * sign) >= MOVE_QUALITY.greatPointsGap) return graded("Great", "Critical engine-best move: at least a 150 cp gap and 15 percentage points of estimated outcome advantage over the next alternative, while retaining a healthy position.");
    const supportedNearBest = candidate && a.score.type === "cp" && candidate.score.type === "cp" && Math.max(0, (a.score.value - candidate.score.value) * sign) <= MOVE_QUALITY.brilliantMaxCpLoss && loss !== null && loss <= MOVE_QUALITY.excellent;
    if (!provisional && (best || supportedNearBest) && sound && !alreadyWinning) {
      const continuation = candidate?.pvUci.slice(1) ?? [];
      if (sacrificeInLine(before.fen, played, b.pvUci) || sacrificeInLine(before.fen, played, continuation)) return graded("Brilliant", "Best or same-position confirmed near-best move (within 30 cp): the moved piece is immediately legally capturable and is taken in the PV, with at least two points of material still conceded after an available immediate recapture. No clearly winning alternative was established. This is a heuristic, not proof.");
    }
    if (best) {
      return graded("Best", "Matches the engine's top move for the position before it was played. A separate search's evaluation drift does not downgrade this choice.");
    }
    const change = evaluationChange(a.score, playedScore, mover);
    if (change.type === "mate") {
      if (change.facts.some((fact) => fact.kind === "lost-forced-mate" || fact.kind === "allowed-forced-mate")) return graded("Blunder", "Lost a forced mate or newly allowed the opponent a forced mate.");
      return graded(change.facts.some((fact) => fact.kind === "found-forced-mate" || (fact.kind === "maintained-forced-mate" && fact.winner === mover)) ? "Excellent" : "Good", "Mate transition assessed separately; no centipawn number is invented for mate.");
    }
    if (change.type !== "cp" || loss === null) return null;
    const previous = context.previous, previousLine = previous?.lines.find((line) => line.multiPv === 1);
    if (previous && previous.engineVersion === before.engineVersion && previous.engineBuild === before.engineBuild && previous.config.preset === before.config.preset && previous.config.multiPv === before.config.multiPv && previousLine?.score.type === "cp" && !previousLine.lowerBound && !previousLine.upperBound && a.score.type === "cp" && playedScore.type === "cp" && previousLine.score.value * sign <= 50 && a.score.value * sign >= 200 && playedScore.value * sign <= 50 && change.loss >= 150) return graded("Miss", "The opponent's preceding move offered at least +2.00; this move lost that opportunity, returning to equal or worse (+0.50 or below).");
    return graded(pointsLossLabel(loss), `${(loss * 100).toFixed(1)} percentage points lost in our rating-neutral expected-points approximation${candidate ? "; uses the same-position MultiPV score" : "; uses adjacent position searches"}.`);
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
