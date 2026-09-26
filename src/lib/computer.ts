import { Chess, type Color } from "chess.js";
import type { BotSearch, EngineResult } from "./engine/domain";
import { bookContinuation } from "./openings";
import { toPlayerScore } from "./engine/normalize";

export type BotProfile = { name: string; level: string; rating: number; multiPv: number; randomness: number; search: BotSearch };
// Browser-safe budget: at most two seconds, single-thread Stockfish.
export const BOTS: readonly BotProfile[] = [
  { name: "Ollie", level: "Beginner", rating: 400, multiPv: 5, randomness: 1, search: { timeMs: 60, depth: 1, elo: 400 } },
  { name: "Mira", level: "Easy", rating: 700, multiPv: 5, randomness: .8, search: { timeMs: 100, depth: 2, elo: 700 } },
  { name: "Nova", level: "Casual", rating: 1000, multiPv: 5, randomness: .55, search: { timeMs: 180, depth: 4, elo: 1000 } },
  { name: "Kairo", level: "Club", rating: 1300, multiPv: 4, randomness: .3, search: { timeMs: 350, depth: 7, elo: 1300 } },
  { name: "Orion", level: "Expert", rating: 1700, multiPv: 3, randomness: .1, search: { timeMs: 750, depth: 12, elo: 1700 } },
  { name: "Atlas", level: "Master", rating: 2100, multiPv: 1, randomness: 0, search: { timeMs: 2000 } },
];
export type Side = "white" | "random" | "black";
export const BOT_DELAY_MIN_MS = 1000, BOT_DELAY_MAX_MS = 10000;
export const FEEDBACK_HOLD_MS = 1000;
export const OPENING_VARIETY_PLIES = 12, OPENING_MULTI_PV = 5;
/** Opening variety stays within a small, strength-dependent evaluation budget. */
export function chooseOpeningMove(chess: Chess, result: EngineResult, bot: BotProfile, random = Math.random): string | null {
  const lines = [...result.lines].sort((a, b) => a.multiPv - b.multiPv), top = lines[0];
  if (!top || top.lowerBound || top.upperBound) return null;
  const best = toPlayerScore(top.score, chess.turn());
  if (best.type !== "cp") return null; // Leave forced mates to normal engine selection.
  const legal = new Set(chess.moves({ verbose: true }).map(move => move.lan));
  const candidates = lines.filter(line => {
    const score = toPlayerScore(line.score, chess.turn()), move = line.pvUci[0];
    return !line.lowerBound && !line.upperBound && score.type === "cp" &&
      best.value - score.value <= 25 + 50 * bot.randomness && legal.has(move) && !!bookContinuation(chess.fen(), move);
  });
  if (candidates.length < 2) return null;
  const weights = candidates.map(line => {
    const score = toPlayerScore(line.score, chess.turn());
    return Math.exp(-Math.max(0, best.value - (score.type === "cp" ? score.value : best.value)) / (15 + 60 * bot.randomness));
  });
  let sample = Math.max(0, Math.min(1, random())) * weights.reduce((a, b) => a + b, 0);
  return (candidates.find((_, i) => (sample -= weights[i]) < 0) ?? candidates[candidates.length - 1]).pvUci[0];
}
export function botDelayMs(random = Math.random) { return BOT_DELAY_MIN_MS + Math.floor(Math.max(0, Math.min(1, random())) * (BOT_DELAY_MAX_MS - BOT_DELAY_MIN_MS)); }
export function cancellableDelay(ms: number) {
  let cancel!: () => void;
  const promise = new Promise<void>(resolve => { const timer = setTimeout(resolve, ms); cancel = () => { clearTimeout(timer); resolve(); }; });
  return { promise, cancel: () => cancel() };
}
export function humanColor(side: Side, random = Math.random): Color { return side === "random" ? (random() < .5 ? "w" : "b") : side === "white" ? "w" : "b"; }
export function chooseBotMove(chess: Chess, result: EngineResult, bot: BotProfile, random = Math.random): string {
  const legal = new Set(chess.moves({ verbose: true }).map((m) => `${m.from}${m.to}${m.promotion ?? ""}`));
  const moves = [...new Set([result.bestMove, ...result.lines.map((line) => line.pvUci[0])])].filter((m): m is string => !!m && legal.has(m));
  if (!moves.length) throw new Error("Stockfish returned no legal move. Retry the engine.");
  if (!bot.randomness) return moves[0];
  const weights = moves.map((_, i) => Math.exp(-i * (1.05 - bot.randomness) * 5));
  let sample = random() * weights.reduce((a, b) => a + b, 0);
  return moves.find((_, i) => (sample -= weights[i]) < 0) ?? moves[moves.length - 1];
}
/** Immediate geometric attacks (including pinned attackers), never speculative PV threats. */
export function attackedHumanPieces(chess: Chess, human: Color) {
  return chess.board().flat().filter((piece) => piece?.color === human && chess.isAttacked(piece.square, human === "w" ? "b" : "w")).map((piece) => piece!.square);
}
export function computerResult(chess: Chess, resigned?: Color): "1-0" | "0-1" | "1/2-1/2" | null {
  if (resigned) return resigned === "w" ? "0-1" : "1-0";
  if (chess.isCheckmate()) return chess.turn() === "w" ? "0-1" : "1-0";
  return chess.isDraw() ? "1/2-1/2" : null;
}
