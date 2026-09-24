import type { GameRecord, GameTree } from "./domain";

type IdentityFields = Pick<GameRecord, "site" | "playedAt" | "white" | "black" | "result" | "variant" | "initialFen">;
const clean = (value: string | null) => (value ?? "").normalize("NFC").trim().replace(/\s+/g, " ");

export async function hashGame(game: IdentityFields, tree: GameTree): Promise<string> {
  // Versioned identity excludes annotations and optional event/rating metadata.
  // FEN and variant distinguish studies with identical SAN but different positions.
  const identity = ["pgn-v1", clean(game.site), clean(game.playedAt), clean(game.white), clean(game.black),
    game.result, game.variant.toLowerCase(), game.initialFen, tree.mainLine.map((node) => node.san).join(" ")];
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(identity)));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export type GameIdentity = Pick<GameRecord, "source" | "externalId" | "normalizedPgnHash">;
export function identityKeys(game: GameIdentity): string[] {
  return [
    `${game.source}:hash:${game.normalizedPgnHash}`,
    ...(game.externalId ? [`${game.source}:id:${game.externalId}`] : []),
  ];
}
export function isDuplicate(game: GameIdentity, known: Set<string>): boolean {
  return identityKeys(game).some((key) => known.has(key));
}
