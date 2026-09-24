import "fake-indexeddb/auto";
import { Dexie } from "dexie";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GamesDatabase, GamesRepository, ProfilesRepository } from "@/lib/db/games";
import { defaultFilters, filterGames, importDiscovered, normalizePlatformGame } from "./import-service";
import type { DiscoveryGame } from "./domain";
import { profileFixture, wireFixture } from "./fixtures";

let db: GamesDatabase;
let games: GamesRepository;
let profiles: ProfilesRepository;
beforeEach(async () => {
  db = new GamesDatabase(`platform-test-${crypto.randomUUID()}`);
  games = new GamesRepository(db); profiles = new ProfilesRepository(db);
  await profiles.save(profileFixture);
});
afterEach(async () => { vi.restoreAllMocks(); await db.delete(); });
async function row(id = "live:123"): Promise<DiscoveryGame> {
  return { key: id, document: await normalizePlatformGame({ ...wireFixture, externalId: id }), playedAtMs: wireFixture.playedAtMs!, alreadyImported: false };
}
const checkpoint = "2026-09-21T10:00:00.000Z";
function run(rows: DiscoveryGame[], signal = new AbortController().signal, progress = vi.fn()) {
  return importDiscovered(rows, profileFixture, checkpoint, signal, progress, games, profiles);
}

describe("platform game normalization and import", () => {
  it("reuses PGN metadata and tree, adding source, identifiers and discovery metadata", async () => {
    const document = await normalizePlatformGame({ ...wireFixture, white: "Fallback", whiteRating: 1 });
    expect(document.game).toMatchObject({ source: "chesscom", externalId: "live:123", white: "Alice", whiteRating: 1500, black: "Bob", rated: true, timeCategory: "blitz", playedAt: "2026-09-15T12:00:00.000Z", rawPgn: wireFixture.pgn });
    expect(document.tree.mainLine).toHaveLength(4);
    expect(document.game.normalizedPgnHash).toMatch(/^[a-f0-9]{64}$/);
  });
  it("preserves unsupported variants without standard-chess legality validation", async () => {
    const document = await normalizePlatformGame({ ...wireFixture, variant: "Atomic", pgn: '[White "Atomic player"]\n1. e5 *' });
    expect(document.game).toMatchObject({ variant: "Atomic", analysisStatus: "unsupported" });
    expect(document.game.rawPgn).toContain("1. e5");
    await games.save([document]);
    expect((await games.list())[0].analysisStatus).toBe("unsupported");
  });
  it("rejects illegal, malformed and multiple upstream PGNs", async () => {
    for (const pgn of ["not PGN", "1. e5 *", `${wireFixture.pgn}\n\n${wireFixture.pgn}`]) {
      await expect(normalizePlatformGame({ ...wireFixture, pgn })).rejects.toMatchObject({ code: "invalid_pgn" });
    }
  });
  it("deduplicates repeated refreshes by external ID and normalized PGN fallback", async () => {
    expect(await run([await row()])).toMatchObject({ imported: 1, duplicates: 0 });
    expect(await run([await row()])).toMatchObject({ imported: 0, duplicates: 1 });
    expect(await run([await row("live:456")])).toMatchObject({ imported: 0, duplicates: 1 });
    expect(await games.list()).toHaveLength(1);
    expect(await profiles.get("chesscom")).toMatchObject({ discoveryCheckpoint: checkpoint, latestImportedGameAt: wireFixture.playedAtMs });
  });
  it("keeps earlier successful games after a later save fails and does not advance coverage", async () => {
    const save = games.save.bind(games);
    vi.spyOn(games, "save").mockImplementationOnce(save).mockRejectedValueOnce(new Error("disk full"));
    expect(await run([await row(), await row("live:456")])).toMatchObject({ imported: 1, failed: 1 });
    expect(await games.list()).toHaveLength(1);
    expect((await profiles.get("chesscom"))?.discoveryCheckpoint).toBeUndefined();
  });
  it("cancellation preserves completed games without advancing the checkpoint", async () => {
    const controller = new AbortController();
    const result = await run([await row(), await row("live:456")], controller.signal, vi.fn(() => controller.abort()));
    expect(result).toMatchObject({ imported: 1, cancelled: true });
    expect(await games.list()).toHaveLength(1);
    expect((await profiles.get("chesscom"))?.discoveryCheckpoint).toBeUndefined();
  });
  it("cancellation during the final save still prevents advancing coverage", async () => {
    const controller = new AbortController();
    const result = await run([await row()], controller.signal, vi.fn(() => controller.abort()));
    expect(result).toMatchObject({ imported: 1, cancelled: true });
    expect((await profiles.get("chesscom"))?.discoveryCheckpoint).toBeUndefined();
  });
  it("combines result, date, category, rated and imported filters", async () => {
    const game = await row();
    expect(filterGames([game], { ...defaultFilters, since: "2026-09-01", until: "2026-09-30", rated: "rated", timeCategory: "blitz", result: "1-0", imported: "new" })).toEqual([game]);
    expect(filterGames([game], { ...defaultFilters, imported: "imported" })).toEqual([]);
    expect(filterGames([game], { ...defaultFilters, until: "2026-09-01" })).toEqual([]);
  });
});

describe("IndexedDB platform profiles", () => {
  it("keeps one profile per platform and removal never deletes games", async () => {
    await run([await row()]);
    const replacement = { ...profileFixture, id: crypto.randomUUID(), username: "Other", canonicalUsername: "other" };
    await profiles.save(replacement);
    await profiles.save({ ...profileFixture, id: crypto.randomUUID(), platform: "lichess" });
    expect(await db.profiles.count()).toBe(2);
    expect((await profiles.get("chesscom"))?.username).toBe("Other");
    expect(await profiles.updateSync(profileFixture, { discoveryCheckpoint: checkpoint })).toBeNull();
    await profiles.remove(replacement.id);
    expect(await profiles.get("chesscom")).toBeNull();
    expect(await games.list()).toHaveLength(1);
  });
  it("upgrades a Phase 2 database without losing games or annotation trees", async () => {
    const name = `migration-${crypto.randomUUID()}`;
    const old = new Dexie(name);
    old.version(1).stores({ games: "id,&[source+normalizedPgnHash],&[source+externalId],importedAt,playedAt", trees: "gameId" });
    const document = (await row()).document;
    await old.table("games").add(document.game);
    await old.table("trees").add({ gameId: document.game.id, tree: document.tree });
    old.close();
    const upgraded = new GamesDatabase(name);
    try {
      expect(await new GamesRepository(upgraded).get(document.game.id)).toEqual(document);
      await new ProfilesRepository(upgraded).save(profileFixture);
      expect(await upgraded.profiles.count()).toBe(1);
    } finally { await upgraded.delete(); }
  });
});
