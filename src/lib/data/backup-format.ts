import { z } from "zod";
import { BACKUP_VERSION } from "@/lib/app-info";
import { documentSchema } from "@/lib/pgn/domain";
import { profileSchema } from "@/lib/platforms/domain";
import { gameAnalysisSchema, positionAnalysisSchema } from "@/lib/game-analysis/domain";
import { savedAnalysisSchema } from "@/lib/engine/repository";
import { enginePreferencesSchema } from "@/lib/engine/domain";
import { preferencesSchema } from "@/lib/preferences";
export const BACKUP_MAX_BYTES = 50_000_000;
export const backupSchema = z.object({
  format: z.literal("chess-review-backup"), version: z.literal(BACKUP_VERSION), appVersion: z.string().max(30), createdAt: z.string().datetime(),
  documents: z.array(documentSchema).max(2000), profiles: z.array(profileSchema).max(2),
  sessions: z.array(gameAnalysisSchema).max(2000), positions: z.array(positionAnalysisSchema).max(20_000), cache: z.array(savedAnalysisSchema).max(20_000),
  preferences: z.object({ board: preferencesSchema, engine: enginePreferencesSchema }).optional(),
}).strict();
export type LocalBackup = z.infer<typeof backupSchema>;
