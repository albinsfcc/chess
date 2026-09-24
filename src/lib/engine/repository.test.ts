import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_POSITION } from "chess.js";
import { Dexie } from "dexie";
import { GamesDatabase } from "@/lib/db/games";
import { AnalysisRepository, analysisKey } from "./repository";
import { ENGINE_BUILD, type EngineResult } from "./domain";
import { profileFixture } from "@/lib/platforms/fixtures";

const databases: GamesDatabase[] = [];
afterEach(async () => { for (const db of databases) await db.delete(); databases.length = 0; });
const result: EngineResult = { requestId: "1", fen: DEFAULT_POSITION, engineVersion: "Stockfish 19 Lite WASM", engineBuild: ENGINE_BUILD,
  config: { preset: "quick", multiPv: 3 }, lines: [{ multiPv: 1, depth: 12, score: { type: "mate", moves: -3 }, lowerBound: false, upperBound: false, pvUci: ["e2e4"], pvSan: ["e4"], replayComplete: true }], bestMove: "e2e4", bestMoveSan: "e4" };
describe("completed position analysis cache", () => {
  it("persists typed scores and keys by FEN, version and every search setting", async () => {
    const db = new GamesDatabase(`analysis-${crypto.randomUUID()}`); databases.push(db); const repo = new AnalysisRepository(db);
    await repo.save(result); db.close(); await db.open();
    expect(await repo.get(result.fen, result.engineVersion, result.config)).toEqual(result);
    expect(await repo.get(result.fen, "another version", result.config)).toBeNull();
    expect(await repo.get(result.fen, result.engineVersion, { ...result.config, multiPv: 1 })).toBeNull();
    expect(await repo.get(result.fen, result.engineVersion, { ...result.config, preset: "deep" })).toBeNull();
    expect(await repo.get(result.fen.replace(" w ", " b "), result.engineVersion, result.config)).toBeNull();
    await repo.save({ ...result, requestId: "2" }); expect(await db.analyses.count()).toBe(1);
  });
  it("adds the analysis table without losing Phase 3 profiles", async () => {
    const name = `analysis-migration-${crypto.randomUUID()}`; const old = new Dexie(name);
    old.version(1).stores({ games: "id,&[source+normalizedPgnHash],&[source+externalId],importedAt,playedAt", trees: "gameId" });
    old.version(2).stores({ profiles: "id,&platform" });
    await old.table("profiles").add(profileFixture); old.close();
    const db = new GamesDatabase(name); databases.push(db);
    expect(await db.profiles.get(profileFixture.id)).toEqual(profileFixture);
    await new AnalysisRepository(db).save(result); expect(await db.analyses.count()).toBe(1);
  });
  it("upgrades Phase 4 storage and lazily migrates compatible cached results", async () => {
    const name = `queue-migration-${crypto.randomUUID()}`, old = new Dexie(name);
    old.version(3).stores({ games: "id,&[source+normalizedPgnHash],&[source+externalId],importedAt,playedAt", trees: "gameId", profiles: "id,&platform", analyses: "key,completedAt" });
    const key = analysisKey(result.fen, result.engineVersion, result.config);
    await old.table("analyses").add({ key, completedAt: new Date().toISOString(), result });
    await old.table("profiles").add(profileFixture); old.close();
    const db = new GamesDatabase(name); databases.push(db);
    expect(await new AnalysisRepository(db).get(result.fen, result.engineVersion, result.config)).toEqual(result);
    expect(await db.analyses.get(key)).toBeUndefined();
    expect((await db.analyses.toArray())[0].configurationHash).toHaveLength(64);
    expect(await db.profiles.get(profileFixture.id)).toEqual(profileFixture);
    expect(await db.gameAnalyses.count()).toBe(0); expect(await db.positionAnalyses.count()).toBe(0);
  });
});
