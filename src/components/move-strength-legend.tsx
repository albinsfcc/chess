import { MoveStrengthIcon } from "./move-strength-icon";
import type { MoveLabel } from "@/lib/game-analysis/move-quality";
const descriptions: Record<MoveLabel, string> = {
  Brilliant: "A sound material sacrifice in the engine’s principal line.",
  Great: "A critical best move with a large gap to the next alternative.",
  Best: "The engine’s top choice with minimal evaluation loss.",
  Excellent: "A very strong alternative with little evaluation loss.",
  Good: "A sound move with a small evaluation loss.",
  Inaccuracy: "A modest evaluation loss.", Mistake: "A substantial evaluation loss.", Blunder: "A large loss, or losing or allowing a forced mate.",
  Book: "A continuation listed in the local opening knowledge base.",
  Forced: "Exactly one legal move was available.",
  Miss: "An opponent-created winning opportunity was lost, returning to equal or worse.",
  "Missed Win": "A legal mate in one was available, but this move did not deliver checkmate.",
};
export function MoveStrengthLegend() {
  return <details className="rounded-md border p-3 text-sm"><summary className="cursor-pointer font-medium">Move strength icons</summary>
    <ul className="mt-3 grid gap-3" aria-label="Move strength legend">{(Object.keys(descriptions) as MoveLabel[]).map((label) => <li key={label} className="flex items-start gap-2"><MoveStrengthIcon label={label} className="size-7 shrink-0" /><div><strong>{label}</strong><p className="text-xs text-muted-foreground">{descriptions[label]}</p></div></li>)}</ul>
    <p className="mt-3 text-xs text-muted-foreground">Analyze the complete line to grade every move. Shallow evaluations receive provisional grades; incomplete positions stay Pending until resumed. Book and legal-move facts do not require Stockfish. These are transparent local rules, not proprietary platform formulas.</p>
  </details>;
}
