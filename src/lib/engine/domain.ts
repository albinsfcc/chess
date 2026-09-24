import { z } from "zod";

export const ENGINE_BUILD = "stockfish-js-19.0.0-lite-single";
export const ENGINE_ASSET_ROOT = "/engines/stockfish-19.0.0";
export const ENGINE_SOURCE = "https://github.com/nmrugg/stockfish.js/tree/v19.0.0";
export const PRESETS = { quick: 250, standard: 750, deep: 2000 } as const;
export const configSchema = z.object({ preset: z.enum(["quick", "standard", "deep"]), multiPv: z.number().int().min(1).max(5) });
export type AnalysisConfig = z.infer<typeof configSchema>;
export const enginePreferencesSchema = configSchema.extend({ automatic: z.boolean(), showArrow: z.boolean(), showThreats: z.boolean().default(false) });
export type EnginePreferences = z.infer<typeof enginePreferencesSchema>;
export const defaultEnginePreferences: EnginePreferences = { preset: "standard", multiPv: 3, automatic: false, showArrow: true, showThreats: false };
export const ENGINE_PREFERENCES_KEY = "chess-review:engine-preferences:v1";
export const scoreSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("cp"), value: z.number().int() }),
  z.object({ type: z.literal("mate"), moves: z.number().int() }),
]);
export type EngineScore = z.infer<typeof scoreSchema>;
export const lineSchema = z.object({
  multiPv: z.number().int().positive(), depth: z.number().int().nonnegative(), selectiveDepth: z.number().int().nonnegative().optional(),
  nodes: z.number().nonnegative().optional(), nodesPerSecond: z.number().nonnegative().optional(), timeMs: z.number().nonnegative().optional(),
  score: scoreSchema, lowerBound: z.boolean(), upperBound: z.boolean(),
  pvUci: z.array(z.string()), pvSan: z.array(z.string()), replayComplete: z.boolean(),
});
// All normalized scores AND bounds are White-relative. Raw UCI scores are side-to-move-relative.
export type EngineLine = z.infer<typeof lineSchema>;
export const resultSchema = z.object({
  requestId: z.string(), fen: z.string(), engineVersion: z.string(), engineBuild: z.literal(ENGINE_BUILD),
  config: configSchema, lines: z.array(lineSchema).max(5), bestMove: z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/).nullable(), bestMoveSan: z.string().nullable(), ponderMove: z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/).optional(),
});
export type EngineResult = z.infer<typeof resultSchema>;
export type EngineStatus = "loading" | "ready" | "analyzing" | "stopped" | "error";
export const searchSchema = z.object({ requestId: z.string().min(1), fen: z.string().max(200), config: configSchema });
export type SearchRequest = z.infer<typeof searchSchema>;
export type WorkerCommand = { type: "initialize" } | { type: "search"; request: SearchRequest } | { type: "stop" } | { type: "new-game" };
export type WorkerEvent =
  | { type: "ready"; engineVersion: string }
  | { type: "result"; result: EngineResult; complete: boolean }
  | { type: "error"; message: string; requestId?: string };
export type EngineEvent = WorkerEvent | { type: "status"; status: EngineStatus };
