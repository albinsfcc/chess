import { z } from "zod";
import { PlatformError, profileSummarySchema, wireGameSchema, type Platform, type ProfileSummary, type WireGame } from "../domain";

function safeAvatar(value: string | undefined): string | undefined {
  if (!value) return;
  try { const url = new URL(value); return url.protocol === "https:" ? url.href : undefined; } catch { return; }
}
export function normalizeProfile(platform: Platform, input: unknown): ProfileSummary {
  if (platform === "chesscom") {
    const data = z.object({ username: z.string(), player_id: z.number().optional(), name: z.string().optional(), avatar: z.string().optional(), status: z.string().optional() }).parse(input);
    if (data.status?.startsWith("closed")) throw new PlatformError("inaccessible", "Chess.com: this account is closed or inaccessible.", 410);
    return profileSummarySchema.parse({ platform, username: data.username, canonicalUsername: data.username.toLowerCase(), platformUserId: data.player_id?.toString(), displayName: data.name, avatarUrl: safeAvatar(data.avatar) });
  }
  const data = z.object({ id: z.string(), username: z.string(), disabled: z.boolean().optional(), profile: z.object({ realName: z.string().optional(), firstName: z.string().optional(), lastName: z.string().optional() }).optional() }).parse(input);
  if (data.disabled) throw new PlatformError("inaccessible", "Lichess: this account is closed or inaccessible.", 410);
  return profileSummarySchema.parse({ platform, username: data.username, canonicalUsername: data.username.toLowerCase(), platformUserId: data.id,
    displayName: data.profile?.realName || [data.profile?.firstName, data.profile?.lastName].filter(Boolean).join(" ") || undefined });
}

export function normalizeArchives(input: unknown, username: string): string[] {
  const { archives } = z.object({ archives: z.array(z.string()).max(2000) }).parse(input);
  return [...new Set(archives.map((address) => {
    const url = new URL(address);
    const parts = /^\/pub\/player\/([^/]+)\/games\/(\d{4})\/(0[1-9]|1[0-2])$/.exec(url.pathname);
    if (url.origin !== "https://api.chess.com" || !parts || parts[1].toLowerCase() !== username.toLowerCase() || url.search || url.hash) throw new Error("Invalid archive address");
    return `${parts[2]}-${parts[3]}`;
  }))].sort();
}

const chessPlayer = z.object({ username: z.string().optional(), rating: z.number().optional() });
const chessGame = z.object({ pgn: z.string(), url: z.string().optional(), uuid: z.string().optional(), end_time: z.number().optional(),
  white: chessPlayer.optional(), black: chessPlayer.optional(), rated: z.boolean().optional(), time_class: z.string().optional(), rules: z.string().optional() });
export function normalizeChessGame(input: unknown): WireGame {
  const data = chessGame.parse(input);
  let externalId: string | undefined, externalUrl: string | undefined;
  if (data.url) {
    const url = new URL(data.url);
    const match = /^\/game\/(live|daily)\/(\d+)\/?$/.exec(url.pathname);
    if (url.protocol === "https:" && ["www.chess.com", "chess.com"].includes(url.hostname) && match) {
      externalId = `${match[1]}:${match[2]}`; externalUrl = `https://www.chess.com/game/${match[1]}/${match[2]}`;
    }
  }
  return wireGameSchema.parse({ source: "chesscom", externalId: externalId ?? data.uuid, externalUrl, pgn: data.pgn,
    playedAtMs: data.end_time ? data.end_time * 1000 : undefined, white: data.white?.username, black: data.black?.username,
    whiteRating: data.white?.rating, blackRating: data.black?.rating, rated: data.rated, timeCategory: data.time_class ?? "unknown", variant: !data.rules || data.rules === "chess" ? "Standard" : data.rules });
}

const lichessPlayer = z.object({ user: z.object({ name: z.string().optional() }).optional(), rating: z.number().optional() });
export function normalizeLichessGame(input: unknown): WireGame {
  const data = z.object({ id: z.string().regex(/^[a-zA-Z0-9]{8}$/), pgn: z.string(), createdAt: z.number().optional(), rated: z.boolean().optional(), speed: z.string().optional(), variant: z.string().optional(),
    players: z.object({ white: lichessPlayer, black: lichessPlayer }).optional() }).parse(input);
  return wireGameSchema.parse({ source: "lichess", externalId: data.id, externalUrl: `https://lichess.org/${data.id}`, pgn: data.pgn,
    playedAtMs: data.createdAt, white: data.players?.white.user?.name, black: data.players?.black.user?.name,
    whiteRating: data.players?.white.rating, blackRating: data.players?.black.rating, rated: data.rated, timeCategory: data.speed ?? "unknown", variant: !data.variant || data.variant === "standard" ? "Standard" : data.variant });
}
