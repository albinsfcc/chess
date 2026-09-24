import { z } from "zod";
import { gamesDatabase, type GamesDatabase } from "@/lib/db/games";
import { ENGINE_BUILD, resultSchema, type AnalysisConfig, type EngineResult } from "./domain";
import { configurationHash } from "./configuration";

export const savedAnalysisSchema = z.object({ key: z.string(), configurationHash: z.string(), completedAt: z.string().datetime(), result: resultSchema });
export type SavedAnalysis = z.infer<typeof savedAnalysisSchema>;
let writeGeneration = 0;
export function invalidateAnalysisWrites() { writeGeneration++; }
export function analysisKey(fen: string, version: string, config: AnalysisConfig): string {
  return JSON.stringify([ENGINE_BUILD, version, fen, config.preset, config.multiPv]);
}
export class AnalysisRepository {
  constructor(private readonly db: GamesDatabase = gamesDatabase()) {}
  async get(fen: string, version: string, config: AnalysisConfig): Promise<EngineResult | null> {
    const hash = await configurationHash(config), key = JSON.stringify([ENGINE_BUILD, version, fen, hash]);
    const saved = await this.db.analyses.get(key);
    if (saved) {
      const parsed = savedAnalysisSchema.safeParse(saved);
      if (!parsed.success || parsed.data.configurationHash !== hash || parsed.data.result.fen !== fen || parsed.data.result.engineVersion !== version || await configurationHash(parsed.data.result.config) !== hash) {
        await this.db.analyses.delete(key); return null; // Recompute corrupt cache; session records remain untouched.
      }
      return parsed.data.result;
    }
    // Lazy migration of valid Phase 4 cache entries without altering game data.
    const legacy = await this.db.analyses.get(analysisKey(fen, version, config));
    if (!legacy) return null;
    const parsed = resultSchema.safeParse(legacy.result);
    if (!parsed.success || parsed.data.fen !== fen || parsed.data.engineVersion !== version || await configurationHash(parsed.data.config) !== hash) { await this.db.analyses.delete(legacy.key); return null; }
    const result = parsed.data;
    await this.save(result); await this.db.analyses.delete(legacy.key); return result;
  }
  async save(result: EngineResult) {
    const generation = writeGeneration;
    const hash = await configurationHash(result.config);
    const record = savedAnalysisSchema.parse({ key: JSON.stringify([ENGINE_BUILD, result.engineVersion, result.fen, hash]), configurationHash: hash, completedAt: new Date().toISOString(), result });
    await this.db.transaction("rw", this.db.analyses, async () => { if (generation === writeGeneration) await this.db.analyses.put(record); });
  }
}
