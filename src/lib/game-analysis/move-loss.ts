import type { EngineScore } from "../engine/domain";
import { evaluationChange } from "./evaluation";

/** Original local model, not a calibrated win probability or a platform formula. */
export const ACCURACY_MODEL = { version: 2, decay: 5, cpScale: 400, practicalScale: 800, practicalWeight: .5, missedMateLoss: .1 } as const;
export function expectedPoints(cp: number) { return 1 / (1 + Math.exp(-Math.max(-10000, Math.min(10000, cp)) / ACCURACY_MODEL.cpScale)); }
/** Preserve outcome sensitivity near equality without erasing material errors at large scores. */
export function centipawnLoss(before: number, after: number) {
  const cp = Math.max(0, before - after);
  const outcome = Math.max(0, expectedPoints(before) - expectedPoints(after));
  const practical = ACCURACY_MODEL.practicalWeight * cp / (ACCURACY_MODEL.practicalScale + Math.abs(before));
  return Math.min(1, Math.max(outcome, practical));
}
export function scoreLoss(before: EngineScore, after: EngineScore, mover: "w" | "b") {
  const sign = mover === "w" ? 1 : -1;
  if (before.type === "cp" && after.type === "cp") return centipawnLoss(before.value * sign, after.value * sign);
  const change = evaluationChange(before, after, mover);
  if (change.type !== "mate") return 0;
  if (change.facts.some(fact => fact.kind === "allowed-forced-mate")) {
    return before.type === "cp" ? expectedPoints(before.value * sign) : 1;
  }
  if (change.facts.some(fact => fact.kind === "lost-forced-mate")) {
    return Math.max(ACCURACY_MODEL.missedMateLoss, after.type === "cp" ? 1 - expectedPoints(after.value * sign) : 1);
  }
  // Maintaining a forced win or escaping a forced loss incurs no outcome penalty.
  // Search-depth drift in mate distance alone is not sufficient error evidence.
  return 0;
}
