import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Dexie } from "dexie";
import { GamesDatabase, GamesRepository } from "@/lib/db/games";
import { validatePgn } from "@/lib/pgn/validate";
import { annotatedPgn } from "@/lib/pgn/fixtures";
import { profileFixture } from "@/lib/platforms/fixtures";
import { BackupRepository } from "./backup-repository";
import { validateBackup } from "./validate-backup";
import { defaultPreferences } from "@/lib/preferences";
import { defaultEnginePreferences, ENGINE_BUILD } from "@/lib/engine/domain";
import { AnalysisRepository, invalidateAnalysisWrites } from "@/lib/engine/repository";
import type { GameDocument } from "@/lib/pgn/domain";
let db: GamesDatabase, repository: BackupRepository, games: GamesRepository, document: GameDocument;
beforeEach(async () => { db = new GamesDatabase(`backup-${crypto.randomUUID()}`); games = new GamesRepository(db); repository = new BackupRepository(db); document = (await validatePgn(annotatedPgn)).validGames[0]; await games.save([document]); await db.profiles.add(profileFixture); });
afterEach(async () => { await db.delete(); });
describe("versioned local backups", () => {
  it("round-trips PGNs, comments, recursive variations, profiles and preferences", async () => {
    const text = await repository.export({ board: defaultPreferences, engine: defaultEnginePreferences });
    const backup = await validateBackup(text); await repository.clearAll(); await repository.restore(backup);
    expect((await games.get(document.game.id)).tree).toEqual(document.tree);
    expect((await games.get(document.game.id)).game.rawPgn).toBe(document.game.rawPgn);
    expect(await db.profiles.count()).toBe(1); expect(backup.preferences?.board).toEqual(defaultPreferences);
  });
  it("merges duplicates without overwriting valid local metadata or profiles", async () => {
    const backup = await validateBackup(await repository.export());
    await db.games.update(document.game.id, { event: "Local edit" });
    expect(await repository.restore(backup)).toEqual({ imported: 0, duplicates: 1 });
    expect((await games.get(document.game.id)).game.event).toBe("Local edit"); expect(await db.games.count()).toBe(1);
  });
  it("rejects wrong versions, corrupt trees, and unsafe nesting before any write", async () => {
    const original = await repository.export(), value = JSON.parse(original);
    await expect(validateBackup(JSON.stringify({ ...value, version: 900 }))).rejects.toThrow("version");
    value.documents[0].tree.mainLine[0].san = "e5";
    await expect(validateBackup(JSON.stringify(value))).rejects.toThrow("does not match");
    await expect(validateBackup("[".repeat(129))).rejects.toThrow("nesting");
    await expect(validateBackup("not a backup")).rejects.toThrow("JSON");
    expect(await repository.export()).toContain(document.game.rawPgn.replaceAll('"', '\\"').slice(0, 15)); expect(await db.games.count()).toBe(1);
  });
  it("preserves unsupported variants as unplayable", async () => {
    const unsupported = (await validatePgn('[Variant "Atomic"]\n1. e5 *')).unsupportedGames[0]; await games.save([unsupported]);
    const backup = await validateBackup(await repository.export()); expect(backup.documents.find((doc) => doc.game.id === unsupported.game.id)?.tree.playable).toBe(false);
  });
  it("clears analysis separately and invalidates in-flight cache saves", async () => {
    const cache = new AnalysisRepository(db); const result = { requestId: "a", fen: document.tree.initialFen, engineVersion: "Test", engineBuild: ENGINE_BUILD, config: { preset: "quick", multiPv: 3 }, lines: [], bestMove: null, bestMoveSan: null } as const;
    const pending = cache.save({ ...result, lines: [] }); invalidateAnalysisWrites(); await pending; expect(await db.analyses.count()).toBe(0);
    await cache.save({ ...result, lines: [] }); await repository.clearAnalysis(); expect(await db.analyses.count()).toBe(0); expect(await db.games.count()).toBe(1); expect(await db.profiles.count()).toBe(1);
  });
  it("rolls back a failed restore transaction", async () => {
    const backup = await validateBackup(await repository.export()); await repository.clearAll();
    // Inject a storage failure after game insertion: no partial restore may survive.
    db.profiles.hook("creating", () => { throw new Error("Storage denied"); });
    await expect(repository.restore(backup)).rejects.toThrow("Storage denied"); expect(await db.games.count()).toBe(0);
  });
});
describe("indexed library pagination", () => {
  it("loads bounded pages with deterministic newest-first ordering", async () => {
    const batch = Array.from({ length: 60 }, (_, i) => ({ ...document, game: { ...document.game, id: crypto.randomUUID(), normalizedPgnHash: i.toString(16).padStart(64, "0"), playedAt: `2026-09-${String(i % 28 + 1).padStart(2, "0")}` } }));
    await games.save(batch); const first = await games.page(0), second = await games.page(1);
    expect(first.games).toHaveLength(25); expect(first.total).toBe(61); expect(second.games).toHaveLength(25);
    expect(new Set([...first.games, ...second.games].map((game) => game.id)).size).toBe(50);
    expect((await games.page(999)).games).toHaveLength(11); await expect(games.page(0, 1000)).rejects.toThrow("Invalid");
  });
  it("migrates version 4 records into the ordered index without losing data", async () => {
    const name = `old-${crypto.randomUUID()}`, old = new Dexie(name);
    old.version(4).stores({ games: "id,&[source+normalizedPgnHash],&[source+externalId],importedAt,playedAt", trees: "gameId", profiles: "id,&platform", analyses: "key,completedAt", gameAnalyses: "id,gameId,status,updatedAt", positionAnalyses: "id,&[analysisId+ply],analysisId,gameId" });
    await old.table("games").put(document.game); await old.table("trees").put({ gameId: document.game.id, tree: document.tree }); old.close();
    const upgraded = new GamesDatabase(name);
    try { expect((await new GamesRepository(upgraded).page()).games[0].id).toBe(document.game.id); } finally { await upgraded.delete(); }
  });
});
