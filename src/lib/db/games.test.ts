import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GamesDatabase, GamesRepository } from "./games";
import { validatePgn } from "@/lib/pgn/import-service";
import { annotatedPgn } from "@/lib/pgn/fixtures";

describe("IndexedDB games repository", () => {
  let db: GamesDatabase;
  let repository: GamesRepository;
  beforeEach(() => { db = new GamesDatabase(`test-${crypto.randomUUID()}`); repository = new GamesRepository(db); });
  afterEach(async () => { await db.delete(); });

  it("persists PGN and recursive trees across database reopen", async () => {
    const document = (await validatePgn(annotatedPgn)).validGames[0];
    expect(await repository.save([document])).toEqual({ imported: 1, duplicates: 0 });
    db.close(); await db.open();
    expect(await repository.get(document.game.id)).toEqual({ game: document.game, tree: document.tree });
    expect(await repository.identities()).toHaveLength(1);
  });

  it("deduplicates concurrent imports atomically", async () => {
    const a = (await validatePgn(annotatedPgn)).validGames[0];
    const b = (await validatePgn(annotatedPgn)).validGames[0];
    const results = await Promise.all([repository.save([a]), repository.save([b])]);
    expect(results.reduce((total, result) => total + result.imported, 0)).toBe(1);
    expect(results.reduce((total, result) => total + result.duplicates, 0)).toBe(1);
    expect(await db.trees.count()).toBe(1);
  });

  it("sorts newest played games first, with import time as a tie-breaker", async () => {
    const result = await validatePgn('[Date "2023.01.01"]\n1. e4 *\n[Date "2025.01.01"]\n1. d4 *\n1. c4 *');
    await repository.save(result.validGames);
    expect((await repository.list()).map((game) => game.playedAt)).toEqual(["2025-01-01", "2023-01-01", null]);
  });

  it("saves unsupported variants and removes both game and tree on delete", async () => {
    const document = (await validatePgn('[Variant "Atomic"]\n1. e5 *')).unsupportedGames[0];
    await repository.save([document]);
    expect((await repository.list())[0].analysisStatus).toBe("unsupported");
    await repository.delete(document.game.id);
    expect(await repository.list()).toEqual([]);
    expect(await db.trees.count()).toBe(0);
    await expect(repository.get(document.game.id)).rejects.toThrow("no longer");
  });

  it("rolls back the game write when saving its tree fails", async () => {
    const document = (await validatePgn(annotatedPgn)).validGames[0];
    await db.trees.add({ gameId: document.game.id, tree: document.tree });
    await expect(repository.save([document])).rejects.toThrow();
    expect(await db.games.count()).toBe(0);
  });
});
