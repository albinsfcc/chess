import { z } from "zod";
import type { GameDocument } from "@/lib/pgn/domain";

export const platformSchema = z.enum(["chesscom", "lichess"]);
export type Platform = z.infer<typeof platformSchema>;
export const platformName: Record<Platform | "pgn" | "computer", string> = { chesscom: "Chess.com", lichess: "Lichess", pgn: "PGN", computer: "Computer" };
// Accept legacy usernames, but never path separators, URL syntax or whitespace.
export const usernameSchema = z.string().trim().min(2).max(30).regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/);
export const profileSummarySchema = z.object({
  platform: platformSchema, username: usernameSchema, canonicalUsername: usernameSchema,
  platformUserId: z.string().optional(), displayName: z.string().optional(), avatarUrl: z.string().url().optional(),
});
export const profileSchema = profileSummarySchema.extend({
  id: z.string().uuid(), lastSyncedAt: z.string().datetime().optional(),
  latestImportedGameAt: z.number().int().nonnegative().optional(),
  createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
  // Last fully covered Chess.com discovery window, distinct from the last import action.
  discoveryCheckpoint: z.string().datetime().optional(),
});
export type ProfileSummary = z.infer<typeof profileSummarySchema>;
export type PlatformProfile = z.infer<typeof profileSchema>;
export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
export const wireGameSchema = z.object({
  source: platformSchema, externalId: z.string().optional(), externalUrl: z.string().url().optional(),
  pgn: z.string().min(1).max(500_000), playedAtMs: z.number().nonnegative().optional(),
  white: z.string().optional(), black: z.string().optional(), whiteRating: z.number().int().nonnegative().optional(), blackRating: z.number().int().nonnegative().optional(),
  variant: z.string(), timeCategory: z.string(), rated: z.boolean().optional(),
});
export type WireGame = z.infer<typeof wireGameSchema>;
export const streamEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("game"), game: wireGameSchema }),
  z.object({ type: z.literal("warning"), message: z.string() }),
  z.object({ type: z.literal("complete"), count: z.number(), limited: z.boolean() }),
]);
export type StreamEvent = z.infer<typeof streamEventSchema>;
export type DiscoveryGame = { key: string; document: GameDocument; playedAtMs: number; alreadyImported: boolean };
export type DiscoveryOptions = { since?: number; until?: number; max: number; full: boolean; recent?: boolean; fromMonth?: string; toMonth?: string };
export type DiscoveryEvent =
  | { type: "archives"; months: string[] }
  | { type: "game"; game: WireGame }
  | { type: "warning"; message: string }
  | { type: "progress"; message: string }
  | { type: "complete"; limited: boolean };
export interface PlatformAdapter {
  platform: Platform;
  lookup(username: string, signal: AbortSignal): Promise<ProfileSummary>;
  months(username: string, signal: AbortSignal): Promise<string[]>;
  discover(profile: PlatformProfile, options: DiscoveryOptions, signal: AbortSignal): AsyncGenerator<DiscoveryEvent>;
}
export class PlatformError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 502, public readonly retryAfterSeconds?: number) { super(message); this.name = "PlatformError"; }
}
export function cancelled(error: unknown): boolean { return error instanceof Error && error.name === "AbortError"; }
export function publicError(error: unknown): string {
  if (cancelled(error)) return "Cancelled. Games already discovered or imported have been kept.";
  return error instanceof PlatformError ? error.message : "The request could not be completed. Check your connection or local storage, then retry.";
}
