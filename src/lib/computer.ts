import { Chess, type Color } from "chess.js";
import type { BotSearch, EngineResult } from "./engine/domain";

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
