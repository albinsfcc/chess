import { gamesDatabase, type GamesDatabase } from "@/lib/db/games";
import { configurationHash } from "@/lib/engine/configuration";
import type { EngineResult } from "@/lib/engine/domain";
import { usableResult } from "@/lib/engine/result-quality";
import { evaluationChange } from "./evaluation";
import { gameAnalysisSchema, positionAnalysisSchema, type GameAnalysis, type PlannedPosition, type PositionAnalysis } from "./domain";

export class GameAnalysisRepository {
  constructor(private readonly db: GamesDatabase = gamesDatabase()) {}
  async recent() {
    const rows = await this.db.gameAnalyses.orderBy("updatedAt").reverse().limit(30).toArray();
    return rows.flatMap((row) => { const parsed = gameAnalysisSchema.safeParse(row); return parsed.success ? [parsed.data] : []; });
  }
  async list(gameId: string) {
    const values = await this.db.gameAnalyses.where("gameId").equals(gameId).toArray();
    const sessions: GameAnalysis[] = []; let corrupt = 0;
    for (const value of values) { const parsed = gameAnalysisSchema.safeParse(value); if (parsed.success) sessions.push(parsed.data); else corrupt++; }
    return { sessions: sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), corrupt };
  }
  async get(id: string): Promise<GameAnalysis> {
    const value = await this.db.gameAnalyses.get(id);
    const parsed = gameAnalysisSchema.safeParse(value);
    if (!parsed.success) throw new Error("Saved analysis is missing or corrupt. Start a new session; existing games and cached results are preserved.");
    return parsed.data;
  }
  async positions(id: string): Promise<PositionAnalysis[]> {
    const rows = await this.db.positionAnalyses.where("analysisId").equals(id).toArray();
    return rows.map((row) => {
      const parsed = positionAnalysisSchema.safeParse(row);
      if (!parsed.success) throw new Error("A saved position is corrupt. Start a new analysis to reuse intact cached positions.");
      return parsed.data;
    }).sort((a, b) => a.ply - b.ply);
  }
  async create(session: GameAnalysis) { await this.db.gameAnalyses.add(gameAnalysisSchema.parse(session)); }
  async update(id: string, patch: Partial<GameAnalysis>) {
    return this.db.transaction("rw", this.db.gameAnalyses, async () => {
      const next = gameAnalysisSchema.parse({ ...await this.get(id), ...patch, updatedAt: new Date().toISOString() });
      await this.db.gameAnalyses.put(next); return next;
    });
  }
  async recover() {
    const rows = await this.db.gameAnalyses.where("status").anyOf("running", "queued").toArray();
    for (const row of rows) if (gameAnalysisSchema.safeParse(row).success) await this.update(row.id, { status: "paused", runId: undefined, lastError: "The previous tab session ended. Resume from the first unfinished position." });
  }
  async commit(session: GameAnalysis, position: PlannedPosition, result: EngineResult, fromCache: boolean) {
    if (result.engineVersion !== session.engineVersion || result.fen !== position.fen || await configurationHash(result.config) !== session.configurationHash) throw new Error("Engine result does not match this session's position, version or settings.");
    const primary = result.lines.find((line) => line.multiPv === 1);
    const record = positionAnalysisSchema.parse({ ...position, id: `${session.id}:${position.ply}`, analysisId: session.id, gameId: session.gameId, configurationHash: session.configurationHash,
      scoreBefore: primary?.score ?? null, scoreAfter: null, evaluationChange: evaluationChange(primary?.score ?? null, null, position.mover), bestMoveUci: result.bestMove, bestMoveSan: result.bestMoveSan,
      depth: primary?.depth ?? null, nodes: primary?.nodes ?? null, elapsedMs: primary?.timeMs ?? null, result, fromCache, createdAt: new Date().toISOString() });
    return this.db.transaction("rw", [this.db.games, this.db.trees, this.db.gameAnalyses, this.db.positionAnalyses], async () => {
      const current = await this.get(session.id);
      const game = await this.db.games.get(session.gameId);
      if (!game) throw new Error("This game was deleted. The analysis has stopped.");
      if (current.runId !== session.runId || current.status !== "running") throw new Error("This analysis request is no longer active.");
      const existing = await this.db.positionAnalyses.get(record.id);
      if (!existing || !usableResult(existing.result)) {
        const after = await this.db.positionAnalyses.get(`${session.id}:${position.ply + 1}`);
        if (after && record.movePath?.join(".") === after.treePath.join(".")) {
          const afterLine = after.result.lines.find((line) => line.multiPv === 1);
          record.scoreAfter = after.scoreBefore;
          record.evaluationChange = evaluationChange(record.scoreBefore, record.scoreAfter, record.mover, !!(primary?.lowerBound || primary?.upperBound || afterLine?.lowerBound || afterLine?.upperBound));
        }
        await this.db.positionAnalyses.put(record);
      }
      const before = await this.db.positionAnalyses.get(`${session.id}:${position.ply - 1}`);
      if (before && before.movePath?.join(".") === position.treePath.join(".")) {
        const beforeLine = before.result.lines.find((line) => line.multiPv === 1);
        before.scoreAfter = primary?.score ?? null;
        before.evaluationChange = evaluationChange(before.scoreBefore, before.scoreAfter, before.mover, !!(beforeLine?.lowerBound || beforeLine?.upperBound || primary?.lowerBound || primary?.upperBound));
        await this.db.positionAnalyses.put(positionAnalysisSchema.parse(before));
      }
      // launch/resume recounts usable records once; each atomic commit increments once.
      const count = current.completedPositions + (!existing || !usableResult(existing.result) ? 1 : 0);
      const completed = count === current.totalPositions;
      const next = gameAnalysisSchema.parse({ ...current, completedPositions: count, status: completed ? "completed" : "running", updatedAt: new Date().toISOString(), completedAt: completed ? new Date().toISOString() : null });
      await this.db.gameAnalyses.put(next);
      const tree = await this.db.trees.get(session.gameId);
      const fullMainLine = completed && session.selectedTreePath === "main" && session.configuration.startPly === 0 && session.configuration.endPly === tree?.tree.mainLine.length;
      if (game.analysisStatus !== "analyzed" || fullMainLine) await this.db.games.update(game.id, { analysisStatus: fullMainLine ? "analyzed" : "partial" });
      return next;
    });
  }
}
