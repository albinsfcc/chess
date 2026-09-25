import { Chess } from "chess.js";
import { z } from "zod";
import type { GameState } from "../game";
const entrySchema = z.object({ eco: z.string().regex(/^[A-E]\d{2}$/), name: z.string().max(300), pgn: z.string().max(3000), ply: z.number().int().min(1).max(100) });
export const openingIndexSchema = z.object({ version: z.literal(1), repository: z.string(), commit: z.string().regex(/^[a-f0-9]{40}$/), license: z.literal("CC0-1.0"), maxPly: z.number().int().max(100), entries: z.array(entrySchema).max(10000), named: z.record(z.string(), z.array(z.number().int().nonnegative())), edges: z.record(z.string(), z.record(z.string(), z.number().int().nonnegative())) });
export type OpeningIndex = z.infer<typeof openingIndexSchema>;
export type OpeningEntry = z.infer<typeof entrySchema>;
let installed: OpeningIndex | null = null;
export function installOpeningIndex(index: OpeningIndex) { installed = index; }
export const openingKey = (fen: string) => fen.split(" ").slice(0, 4).join(" ");
export function bookContinuation(fen: string, uci: string, index = installed): OpeningEntry | null {
  const id = index?.edges[openingKey(fen)]?.[uci];
  return id === undefined ? null : index!.entries[id] ?? null;
}
export function namedOpenings(fen: string, index: OpeningIndex): OpeningEntry[] {
  return (index.named[openingKey(fen)] ?? []).map((id) => index.entries[id]).filter(Boolean).sort((a, b) => a.ply - b.ply || a.name.localeCompare(b.name));
}
export function openingHistory(game: GameState, index: OpeningIndex) {
  const chess = new Chess(game.initialFen);
  let matches = namedOpenings(chess.fen(), index), matchedPly = 0;
  for (let ply = 0; ply < Math.min(game.cursor, game.moves.length, index.maxPly); ply++) {
    chess.move(game.moves[ply]);
    const found = namedOpenings(chess.fen(), index);
    if (found.length) { matches = found; matchedPly = ply + 1; }
  }
  const match = matches[0];
  return { match: match ?? null, aliases: matches.slice(1), matchedPly, current: !!match && matchedPly === game.cursor };
}
export function openingBookMoves(initialFen: string, moves: GameState["moves"], index: OpeningIndex) {
  const chess = new Chess(initialFen), matches = new Map<number, OpeningEntry>();
  for (let ply = 0; ply < Math.min(moves.length, index.maxPly); ply++) {
    const move = moves[ply], match = bookContinuation(chess.fen(), `${move.from}${move.to}${move.promotion ?? ""}`, index);
    if (match) matches.set(ply, match);
    chess.move(move);
  }
  return matches;
}
export async function loadOpeningIndex(): Promise<OpeningIndex> {
  const response = await fetch("/openings/index.json", { cache: "force-cache", signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error("Opening knowledge base could not load. Local games and engine analysis remain available.");
  const raw = await response.text(); if (raw.length > 3_000_000) throw new Error("Opening data exceeds the supported size.");
  const index = openingIndexSchema.parse(JSON.parse(raw));
  for (const ids of Object.values(index.named)) if (ids.some((id) => id >= index.entries.length)) throw new Error("Invalid named opening reference.");
  for (const edges of Object.values(index.edges)) if (Object.values(edges).some((id) => id >= index.entries.length)) throw new Error("Invalid book move reference.");
  return index;
}
