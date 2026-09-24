import type { PlatformProfile, WireGame } from "./domain";

export const platformPgn = '[Event "Public game"]\n[White "Alice"]\n[Black "Bob"]\n[WhiteElo "1500"]\n[BlackElo "1450"]\n[TimeControl "300+0"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 1-0';
export const profileFixture: PlatformProfile = { id: "bb41ea35-c105-4aa4-a6b7-994c3a4fc4c4", platform: "chesscom", username: "Alice", canonicalUsername: "alice", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
export const wireFixture: WireGame = { source: "chesscom", externalId: "live:123", externalUrl: "https://www.chess.com/game/live/123", pgn: platformPgn, playedAtMs: Date.parse("2026-09-15T12:00:00Z"), variant: "Standard", timeCategory: "blitz", rated: true };
export function bytes(text: string, sizes = [7, 3, 17]): ReadableStream<Uint8Array> {
  const data = new TextEncoder().encode(text);
  let offset = 0, n = 0;
  return new ReadableStream({ pull(controller) {
    if (offset >= data.length) { controller.close(); return; }
    const end = Math.min(data.length, offset + sizes[n++ % sizes.length]);
    controller.enqueue(data.slice(offset, end)); offset = end;
  } });
}
