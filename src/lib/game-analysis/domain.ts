import { z } from "zod";
import { configSchema, resultSchema, scoreSchema } from "@/lib/engine/domain";

export const pathSchema = z.array(z.number().int().nonnegative());
export const gameConfigSchema = configSchema.extend({ startPly: z.number().int().nonnegative(), endPly: z.number().int().nonnegative() }).refine((value) => value.startPly <= value.endPly, "Starting ply must not exceed ending ply.");
export type GameAnalysisConfig = z.infer<typeof gameConfigSchema>;
export const gameAnalysisSchema = z.object({
  id: z.string().uuid(), gameId: z.string().uuid(), selectedTreePath: z.union([z.literal("main"), pathSchema]),
  engineName: z.string(), engineVersion: z.string(), configuration: gameConfigSchema, configurationHash: z.string(),
  totalPositions: z.number().int().positive(), completedPositions: z.number().int().nonnegative(),
  status: z.enum(["queued", "running", "paused", "completed", "cancelled", "failed"]),
  startedAt: z.string().datetime(), updatedAt: z.string().datetime(), completedAt: z.string().datetime().nullable(), lastError: z.string().optional(),
  runId: z.string().optional(),
});
export type GameAnalysis = z.infer<typeof gameAnalysisSchema>;
export const mateFactSchema = z.object({
  kind: z.enum(["maintained-forced-mate", "lost-forced-mate", "allowed-forced-mate", "found-forced-mate", "escaped-forced-mate", "shortened-mate", "extended-mate"]),
  winner: z.enum(["w", "b"]), beforeDistance: z.number().optional(), afterDistance: z.number().optional(),
});
export type MateFact = z.infer<typeof mateFactSchema>;
export const changeSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("cp"), whiteDelta: z.number(), loss: z.number().nonnegative() }),
  z.object({ type: z.literal("mate"), facts: z.array(mateFactSchema) }),
  z.object({ type: z.literal("unavailable"), reason: z.string() }),
]);
export type EvaluationChange = z.infer<typeof changeSchema>;
export const plannedPositionSchema = z.object({
  ply: z.number().int().nonnegative(), treePath: pathSchema, movePath: pathSchema.nullable(), fen: z.string(),
  playedMoveUci: z.string().nullable(), playedMoveSan: z.string().nullable(), mover: z.enum(["w", "b"]), label: z.string(),
});
export type PlannedPosition = z.infer<typeof plannedPositionSchema>;
export const positionAnalysisSchema = plannedPositionSchema.extend({
  id: z.string(), analysisId: z.string().uuid(), gameId: z.string().uuid(), configurationHash: z.string(),
  scoreBefore: scoreSchema.nullable(), scoreAfter: scoreSchema.nullable(), evaluationChange: changeSchema,
  bestMoveUci: z.string().nullable(), bestMoveSan: z.string().nullable(), depth: z.number().int().nonnegative().nullable(), nodes: z.number().nonnegative().nullable(), elapsedMs: z.number().nonnegative().nullable(),
  result: resultSchema, fromCache: z.boolean(), createdAt: z.string().datetime(),
});
export type PositionAnalysis = z.infer<typeof positionAnalysisSchema>;
export const branchLabel = (path: GameAnalysis["selectedTreePath"]) => path === "main" ? "Main line" : `Variation ${path.join(".")}`;
