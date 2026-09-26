import { z } from "zod";
import { gamesDatabase, type GamesDatabase } from "../db/games";
import { configurationHash } from "../engine/configuration";
import { ENGINE_BUILD, resultSchema, type AnalysisConfig, type EngineResult } from "../engine/domain";
import { usableResult, withTerminalScore } from "../engine/result-quality";
import { AnalysisRepository } from "../engine/repository";
import type { GameDocument } from "../pgn/domain";
import { generatePositions } from "./positions";
import { GameAnalysisRepository } from "./repository";

export const computerPositionSchema = z.object({ id: z.string(), gameId: z.string().uuid(), ply: z.number().int().nonnegative(), fen: z.string(), configurationHash: z.string(), result: resultSchema, fromCache: z.boolean(), createdAt: z.string().datetime() });
export type ComputerPosition = z.infer<typeof computerPositionSchema>;
/** A durable association journal, not another review or grading system. */
export class ComputerProgressRepository {
  constructor(private readonly db: GamesDatabase = gamesDatabase()) {}
  async save(gameId: string, ply: number, result: EngineResult, fromCache: boolean) {
    if ("bot" in result || !usableResult(result)) throw new Error("Only complete unrestricted analysis can be used for game review.");
    const row = computerPositionSchema.parse({ id: `${gameId}:${ply}`, gameId, ply, fen: result.fen, configurationHash: await configurationHash(result.config), result, fromCache, createdAt: new Date().toISOString() });
    await this.db.computerPositions.put(row); return row;
  }
  async positions(gameId: string) { return (await this.db.computerPositions.where("gameId").equals(gameId).sortBy("ply")).map(row => computerPositionSchema.parse(row)); }
  async prepareReview(document: GameDocument, config: AnalysisConfig) {
    const records = await this.positions(document.game.id);
    const hash = await configurationHash(config), version = records.find(row => row.configurationHash === hash)?.result.engineVersion;
    if (!version) return; // Normal review queue fills only the genuinely missing work.
    const repository = new GameAnalysisRepository(this.db), existing = await repository.list(document.game.id);
    if (existing.sessions.some(row => row.configurationHash === hash && row.engineVersion === version)) return;
    const plan = generatePositions(document.tree, "main"), now = new Date().toISOString();
    let session: import("./domain").GameAnalysis = { id: crypto.randomUUID(), gameId: document.game.id, selectedTreePath: "main", engineName: "Stockfish", engineVersion: version,
      configuration: { ...config, startPly: 0, endPly: plan.length - 1 }, configurationHash: hash, totalPositions: plan.length, completedPositions: 0,
      status: "running" as import("./domain").GameAnalysis["status"], startedAt: now, updatedAt: now, completedAt: null as string | null };
    await repository.create(session);
    const cache = new AnalysisRepository(this.db);
    for (const position of plan) {
      const journal = records.find(row => row.ply === position.ply && row.fen === position.fen && row.configurationHash === hash && row.result.engineVersion === version);
      let result = journal?.result ?? await cache.get(position.fen, version, config);
      if (!result) {
        const terminal = withTerminalScore({ requestId: `terminal:${document.game.id}`, fen: position.fen, config, engineBuild: ENGINE_BUILD, engineVersion: version, lines: [], bestMove: null, bestMoveSan: null });
        if (usableResult(terminal)) { result = terminal; await cache.save(result); }
      }
      if (result && usableResult(result)) session = await repository.commit(session, position, result, true);
    }
    if (session.status !== "completed") await repository.update(session.id, { status: "paused" });
  }
}
