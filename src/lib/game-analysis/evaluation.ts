import type { EngineScore } from "@/lib/engine/domain";
import type { EvaluationChange, MateFact } from "./domain";

export function evaluationChange(before: EngineScore | null, after: EngineScore | null, mover: "w" | "b", bounded = false): EvaluationChange {
  if (!before || !after) return { type: "unavailable", reason: "The adjacent position has not been analyzed." };
  if (bounded) return { type: "unavailable", reason: "A score is a bound; exact loss is unavailable." };
  if (before.type === "cp" && after.type === "cp") return { type: "cp", whiteDelta: after.value - before.value, loss: Math.max(0, mover === "w" ? before.value - after.value : after.value - before.value) };
  // Mate 0 means the side to move is already mated. Before: mover is to move;
  // after: the opponent is to move. Distances are UCI moves, not centipawns.
  const winner = (score: EngineScore, turn: "w" | "b") => score.type !== "mate" ? null : score.moves === 0 ? (turn === "w" ? "b" : "w") : score.moves > 0 ? "w" : "b";
  const beforeWinner = winner(before, mover), afterWinner = winner(after, mover === "w" ? "b" : "w");
  const facts: MateFact[] = [];
  if (beforeWinner && beforeWinner === afterWinner) {
    const beforeDistance = before.type === "mate" ? Math.abs(before.moves) : 0;
    const afterDistance = after.type === "mate" ? Math.abs(after.moves) : 0;
    facts.push({ kind: "maintained-forced-mate", winner: beforeWinner, beforeDistance, afterDistance });
    if (afterDistance !== beforeDistance) facts.push({ kind: afterDistance < beforeDistance ? "shortened-mate" : "extended-mate", winner: beforeWinner, beforeDistance, afterDistance });
  } else {
    if (beforeWinner) facts.push({ kind: beforeWinner === mover ? "lost-forced-mate" : "escaped-forced-mate", winner: beforeWinner });
    if (afterWinner) facts.push({ kind: afterWinner === mover ? "found-forced-mate" : "allowed-forced-mate", winner: afterWinner });
  }
  return { type: "mate", facts };
}
export function changeDescription(change: EvaluationChange): string {
  if (change.type === "unavailable") return change.reason;
  if (change.type === "cp") return `Loss: ${(change.loss / 100).toFixed(2)} pawns (${change.loss} cp). White evaluation change: ${change.whiteDelta > 0 ? "+" : ""}${(change.whiteDelta / 100).toFixed(2)}.`;
  return change.facts.map((fact) => `${fact.kind.replaceAll("-", " ")} for ${fact.winner === "w" ? "White" : "Black"}${fact.afterDistance !== undefined ? ` (${fact.beforeDistance} → ${fact.afterDistance})` : ""}`).join("; ");
}
