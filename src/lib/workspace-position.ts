import { treeNode } from "./pgn/position";
import { Chess, DEFAULT_POSITION, type Color, type PieceSymbol, type Square } from "chess.js";
import type { GameState } from "./game";
import type { GameDocument, GameNode, NodePath } from "./pgn/domain";

export const sideName = { w: "White", b: "Black" } as const;
export const captureOrder = ["q", "r", "b", "n", "p"] as const;
export type CapturedPiece = typeof captureOrder[number];
const values: Record<PieceSymbol, number> = { q: 9, r: 5, b: 3, n: 3, p: 1, k: 0 };
export type Clock = { seconds: number; fraction: string };
export function parseClock(text: string): Clock | null {
  const match = /^(\d+):([0-5]\d):([0-5]\d)(\.\d+)?$/.exec(text.trim());
  if (!match) return null;
  const seconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
  return Number.isSafeInteger(seconds) ? { seconds, fraction: match[4] ?? "" } : null;
}
export function formatClock(clock: Clock | null): string {
  if (!clock) return "—:—";
  const hours = Math.floor(clock.seconds / 3600), minutes = Math.floor(clock.seconds / 60) % 60;
  return `${hours ? `${hours}:` : ""}${hours ? String(minutes).padStart(2, "0") : minutes}:${String(clock.seconds % 60).padStart(2, "0")}${clock.fraction}`;
}
/** First stage only. Increments, stage bonuses and elapsed time are never guessed. */
export function initialClock(timeControl: string, initialFen: string): Clock | null {
  // A setup position may start mid-game; TimeControl cannot establish its clocks.
  if (initialFen !== DEFAULT_POSITION) return null;
  const match = /^(?:\d+\/)?(\d+)(\.\d+)?(?:\+\d+(?:\.\d+)?)?$/.exec(timeControl.split(":")[0]);
  if (!match || !Number.isSafeInteger(Number(match[1]))) return null;
  return { seconds: Number(match[1]), fraction: match[2] ?? "" };
}
function clockOn(node: GameNode): Clock | null {
  const annotation = node.annotations.clk;
  const values = typeof annotation === "string" ? [annotation] : annotation ?? [];
  // Legacy trees can contain a literal annotation in the comment instead.
  const comments = node.commentsAfter.flatMap((comment) => [...comment.matchAll(/\[%clk\s+([^\]]+)\]/g)].map((match) => match[1]));
  return [...values, ...comments].map(parseClock).filter((clock) => clock !== null).at(-1) ?? null;
}
export function clocksAt(document: GameDocument | null, paths: NodePath[], ply: number): Record<Color, Clock | null> {
  const initial = document ? initialClock(document.game.timeControl, document.tree.initialFen) : null;
  const clocks: Record<Color, Clock | null> = { w: initial, b: initial };
  if (document) for (const path of paths.slice(0, ply)) { const node = treeNode(document.tree, path); if (node) { const clock = clockOn(node); if (clock) clocks[node.turn] = clock; } }
  return clocks;
}
export function panelOrder(orientation: "white" | "black"): readonly [Color, Color] { return orientation === "white" ? ["b", "w"] : ["w", "b"]; }
export function legalDestinations(chess: Chess, square: string | null, enabled = true, allowDrawContinuation = false) {
  if (!enabled || !square || !/^[a-h][1-8]$/.test(square) || chess.get(square as Square)?.color !== chess.turn() || (!allowDrawContinuation && chess.isGameOver())) return [];
  return [...new Map(chess.moves({ square: square as Square, verbose: true }).map((move) => [move.to, { square: move.to, capture: !!move.captured }])).values()];
}
export function materialBalance(chess: Chess): number {
  return chess.board().flat().reduce((sum, piece) => sum + (piece ? values[piece.type] * (piece.color === "w" ? 1 : -1) : 0), 0);
}
export type PlayerState = { color: Color; name: string; rating: number | null; clock: Clock | null; captured: CapturedPiece[]; advantage: number; toMove: boolean };
export function workspacePosition(game: GameState, document: GameDocument | null, paths: NodePath[]) {
  const chess = new Chess(game.initialFen), captured: Record<Color, CapturedPiece[]> = { w: [], b: [] };
  for (const item of game.moves.slice(0, game.cursor)) { const move = chess.move(item); if (move.captured && move.captured !== "k") captured[move.color].push(move.captured); }
  const clocks = clocksAt(document, paths, game.cursor), balance = materialBalance(chess);
  const player = (color: Color): PlayerState => {
    const name = document?.game[color === "w" ? "white" : "black"];
    return { color, name: !name || name === "?" || /^Unknown (White|Black)$/.test(name) ? sideName[color] : name,
      rating: document?.game[color === "w" ? "whiteRating" : "blackRating"] ?? null, clock: clocks[color],
      captured: captured[color].sort((a, b) => captureOrder.indexOf(a) - captureOrder.indexOf(b)),
      advantage: Math.max(0, balance * (color === "w" ? 1 : -1)), toMove: chess.turn() === color };
  };
  return { chess, players: { w: player("w"), b: player("b") } };
}
