import { documentSchema, type GameDocument } from "@/lib/pgn/domain";
import { parsePgnEntries } from "@/lib/pgn/parse";
import { normalizeGame } from "@/lib/pgn/normalize";
import { hashGame } from "@/lib/pgn/hash";
import { PlatformError, type WireGame } from "./domain";

export async function normalizePlatformGame(wire: WireGame): Promise<GameDocument> {
  const parsed = parsePgnEntries(wire.pgn);
  if (parsed.errors.length || parsed.entries.length !== 1) throw new PlatformError("invalid_pgn", `Invalid upstream PGN${wire.externalId ? ` (${wire.externalId})` : ""}; skipped.`);
  const entry = parsed.entries[0];
  // The platform's variant must be applied before chess.js legality validation.
  // Original PGN is still saved verbatim; the existing normalizer owns the tree.
  if (wire.variant.toLowerCase() !== "standard") {
    entry.parsed.tags = { ...entry.parsed.tags, Variant: wire.variant } as NonNullable<typeof entry.parsed.tags>;
  }
  let document: GameDocument;
  try { document = await normalizeGame(wire.pgn, entry.parsed); }
  catch { throw new PlatformError("invalid_pgn", `Invalid upstream PGN${wire.externalId ? ` (${wire.externalId})` : ""}: illegal move sequence or invalid starting position; skipped.`); }
  const record = document.game;
  const game = {
    ...record, source: wire.source, externalId: wire.externalId, externalUrl: wire.externalUrl,
    white: record.headers.White && record.headers.White !== "?" ? record.white : wire.white ?? record.white,
    black: record.headers.Black && record.headers.Black !== "?" ? record.black : wire.black ?? record.black,
    whiteRating: record.whiteRating ?? wire.whiteRating ?? null, blackRating: record.blackRating ?? wire.blackRating ?? null,
    playedAt: wire.playedAtMs ? new Date(wire.playedAtMs).toISOString() : record.playedAt,
    rated: wire.rated, timeCategory: wire.timeCategory,
  };
  game.normalizedPgnHash = await hashGame(game, document.tree);
  return documentSchema.parse({ game, tree: document.tree });
}

