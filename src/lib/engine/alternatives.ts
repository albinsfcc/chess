import type { EngineResult } from "./domain";
import { toPlayerScore } from "./normalize";

export const MAX_ALTERNATIVE_LOSS_CP = 75;
/** Display policy only: preserve all raw lines for grading and cache compatibility. */
export function visibleLines(result: EngineResult, count = 5) {
  const lines = [...result.lines].sort((a, b) => a.multiPv - b.multiPv), top = lines[0];
  if (!top) return [];
  const player = result.fen.split(" ")[1] === "b" ? "b" : "w";
  const best = toPlayerScore(top.score, player);
  return [top, ...lines.slice(1).filter(line => {
    if (top.lowerBound || top.upperBound || line.lowerBound || line.upperBound) return false;
    const score = toPlayerScore(line.score, player);
    if (best.type === "mate") return score.type === "mate" && best.moves !== 0 && Math.sign(score.moves) === Math.sign(best.moves);
    if (score.type === "mate") return score.moves > 0;
    return best.value - score.value <= MAX_ALTERNATIVE_LOSS_CP;
  })].slice(0, Math.max(1, count));
}
