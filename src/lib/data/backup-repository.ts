import { GamesDatabase, GamesRepository, gamesDatabase } from "@/lib/db/games";
import { APP_VERSION, BACKUP_VERSION } from "@/lib/app-info";
import { BACKUP_MAX_BYTES, type LocalBackup } from "./backup-format";
import { configurationHash } from "@/lib/engine/configuration";
import { ENGINE_BUILD, resultSchema } from "@/lib/engine/domain";
import { savedAnalysisSchema } from "@/lib/engine/repository";
import { documentSchema } from "@/lib/pgn/domain";
import { profileSchema } from "@/lib/platforms/domain";
import { gameAnalysisSchema, positionAnalysisSchema } from "@/lib/game-analysis/domain";

export class BackupRepository {
  constructor(private readonly db: GamesDatabase = gamesDatabase()) {}
  private tables() { return [this.db.games, this.db.trees, this.db.profiles, this.db.analyses, this.db.gameAnalyses, this.db.positionAnalyses, this.db.computerPositions]; }
  async export(preferences?: LocalBackup["preferences"]): Promise<string> {
    const snapshot = await this.db.transaction("r", this.tables(), async () => {
      const backup: LocalBackup = { format: "chess-review-backup", version: BACKUP_VERSION, appVersion: APP_VERSION, createdAt: new Date().toISOString(), documents: [], profiles: [], sessions: [], positions: [], cache: [], ...(preferences ? { preferences } : {}) };
      let bytes = 0, moves = 0;
      const account = (value: unknown) => { bytes += new TextEncoder().encode(JSON.stringify(value)).length; if (bytes > BACKUP_MAX_BYTES - 100_000) throw new Error("Backup exceeds 50 MB. Export individual PGNs or clear analysis caches before retrying."); };
      if (await this.db.games.count() > 2000 || await this.db.gameAnalyses.count() > 2000 || await this.db.positionAnalyses.count() > 20_000 || await this.db.analyses.count() > 20_000) throw new Error("Backup exceeds the supported record count. Export individual PGNs or clear analysis before retrying.");
      for (const id of await this.db.games.toCollection().primaryKeys()) {
        const tree = await this.db.trees.get(id); const document = documentSchema.parse({ game: await this.db.games.get(id), tree: tree?.tree });
        const pending = [...document.tree.mainLine, ...(document.tree.userBranches ?? []).flatMap((branch) => branch.moves)];
        while (pending.length) { const node = pending.pop()!; if (++moves > 200_000) throw new Error("Backup exceeds 200,000 total moves. Export individual PGNs for a larger collection."); for (const branch of node.variations) pending.push(...branch); }
        account(document); backup.documents.push(document);
      }
      for (const profile of await this.db.profiles.toArray()) { account(profile); backup.profiles.push(profileSchema.parse(profile)); }
      for (const id of await this.db.gameAnalyses.toCollection().primaryKeys()) { const session = gameAnalysisSchema.parse(await this.db.gameAnalyses.get(id)); account(session); backup.sessions.push(session); }
      for (const id of await this.db.positionAnalyses.toCollection().primaryKeys()) { const row = positionAnalysisSchema.parse(await this.db.positionAnalyses.get(id)); account(row); backup.positions.push(row); }
      // Legacy cache conversion needs crypto outside the IndexedDB transaction.
      const cache = [];
      for (const id of await this.db.analyses.toCollection().primaryKeys()) { const row = await this.db.analyses.get(id); account(row); if (row) cache.push(row); }
      return { backup, cache };
    });
    const cache = new Map<string, LocalBackup["cache"][number]>();
    for (const row of snapshot.cache) { const result = resultSchema.parse(row.result), hash = await configurationHash(result.config), key = JSON.stringify([ENGINE_BUILD, result.engineVersion, result.fen, hash]); cache.set(key, savedAnalysisSchema.parse({ key, configurationHash: hash, result, completedAt: row.completedAt })); }
    snapshot.backup.cache = [...cache.values()];
    const text = JSON.stringify(snapshot.backup); if (new TextEncoder().encode(text).length > BACKUP_MAX_BYTES) throw new Error("Backup exceeds 50 MB."); return text;
  }
  /** Caller supplies the complete, semantically validated worker result. Merge never overwrites local records. */
  async restore(backup: LocalBackup) {
    const games = new GamesRepository(this.db);
    return this.db.transaction("rw", this.tables(), async () => {
      const ids = new Map<string, string>(); let imported = 0, duplicates = 0;
      for (const document of backup.documents) {
        const game = document.game;
        const existing = await this.db.games.where("[source+normalizedPgnHash]").equals([game.source, game.normalizedPgnHash]).first() ?? (game.externalId ? await this.db.games.where("[source+externalId]").equals([game.source, game.externalId]).first() : undefined);
        if (existing) { ids.set(game.id, existing.id); duplicates++; continue; }
        const id = await this.db.games.get(game.id) ? crypto.randomUUID() : game.id;
        await games.save([{ ...document, game: { ...game, id } }]); ids.set(game.id, id); imported++;
      }
      for (const profile of backup.profiles) if (!await this.db.profiles.where("platform").equals(profile.platform).count()) await this.db.profiles.add({ ...profile, id: crypto.randomUUID() });
      const accepted = new Set<string>();
      for (const session of backup.sessions) {
        if (await this.db.gameAnalyses.get(session.id)) continue;
        // A duplicate game may have different comments/RAVs. Preserve local trees, and only attach compatible sessions.
        const localTree = (await this.db.trees.get(ids.get(session.gameId)!))?.tree;
        const originalTree = backup.documents.find((doc) => doc.game.id === session.gameId)?.tree;
        if (JSON.stringify(localTree) !== JSON.stringify(originalTree)) continue;
        await this.db.gameAnalyses.add({ ...session, gameId: ids.get(session.gameId)!, runId: undefined, ...(["queued", "running"].includes(session.status) ? { status: "paused" as const, lastError: "Restored interrupted session. Resume to continue." } : {}) }); accepted.add(session.id);
      }
      for (const row of backup.positions) if (accepted.has(row.analysisId)) await this.db.positionAnalyses.add({ ...row, gameId: ids.get(row.gameId)! });
      for (const row of backup.cache) if (!await this.db.analyses.get(row.key)) await this.db.analyses.add(row);
      return { imported, duplicates };
    });
  }
  async clearAnalysis() {
    await this.db.transaction("rw", this.tables(), async () => {
      await this.db.analyses.clear(); await this.db.gameAnalyses.clear(); await this.db.positionAnalyses.clear();
      await this.db.computerPositions.clear();
      await this.db.games.toCollection().modify((game) => { if (game.analysisStatus !== "unsupported") game.analysisStatus = "not-analyzed"; });
    });
  }
  async clearAll() { await this.db.transaction("rw", this.tables(), async () => { for (const table of this.tables()) await table.clear(); }); }
}
