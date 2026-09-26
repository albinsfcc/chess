import { Dexie, type Table } from "dexie";
import { documentSchema, gameSchema, treeSchema, type GameDocument, type GameRecord, type GameTree } from "@/lib/pgn/domain";
import type { GameIdentity } from "@/lib/pgn/hash";
import { profileSchema, type PlatformProfile } from "@/lib/platforms/domain";
import type { SavedAnalysis } from "@/lib/engine/repository";
import type { GameAnalysis, PositionAnalysis } from "@/lib/game-analysis/domain";
import type { ComputerPosition } from "@/lib/game-analysis/computer-progress";

export class GamesDatabase extends Dexie {
  games!: Table<GameRecord, string>;
  trees!: Table<{ gameId: string; tree: GameTree }, string>;
  profiles!: Table<PlatformProfile, string>;
  analyses!: Table<SavedAnalysis, string>;
  gameAnalyses!: Table<GameAnalysis, string>;
  positionAnalyses!: Table<PositionAnalysis, string>;
  computerPositions!: Table<ComputerPosition, string>;
  constructor(name = "chess-review") {
    super(name);
    this.version(1).stores({
      games: "id,&[source+normalizedPgnHash],&[source+externalId],importedAt,playedAt",
      trees: "gameId",
    });
    this.version(2).stores({ profiles: "id,&platform" });
    this.version(3).stores({ analyses: "key,completedAt" });
    this.version(4).stores({ gameAnalyses: "id,gameId,status,updatedAt", positionAnalyses: "id,&[analysisId+ply],analysisId,gameId" });
    this.version(5).stores({ games: "id,&[source+normalizedPgnHash],&[source+externalId],importedAt,playedAt,[libraryDate+importedAt+id]" }).upgrade(async (transaction) => {
      await transaction.table("games").toCollection().modify((game: GameRecord & { libraryDate?: string }) => { game.libraryDate = game.playedAt ?? ""; });
    });
    this.version(6).stores({ computerPositions: "id,gameId,[gameId+ply],createdAt" });
  }
}

export class GamesRepository {
  constructor(private readonly db: GamesDatabase) {}

  async list(): Promise<GameRecord[]> {
    const games = (await this.db.games.toArray()).map((game) => gameSchema.parse(game));
    return games.sort((a, b) => (b.playedAt ?? "").localeCompare(a.playedAt ?? "") || b.importedAt.localeCompare(a.importedAt) || b.id.localeCompare(a.id));
  }

  async identities(): Promise<GameIdentity[]> {
    return (await this.db.games.toArray()).map(({ source, externalId, normalizedPgnHash }) => ({ source, externalId, normalizedPgnHash }));
  }

  async page(page = 0, size = 25) {
    if (!Number.isInteger(page) || page < 0 || !Number.isInteger(size) || size < 1 || size > 100) throw new Error("Invalid library page.");
    const total = await this.db.games.count(), currentPage = Math.min(page, Math.max(0, Math.ceil(total / size) - 1));
    const games = (await this.db.games.orderBy("[libraryDate+importedAt+id]").reverse().offset(currentPage * size).limit(size).toArray()).map((game) => gameSchema.parse(game));
    return { games, total, page: currentPage };
  }
  async findIdentity(game: GameIdentity): Promise<GameDocument | null> {
    const row = (game.externalId ? await this.db.games.where("[source+externalId]").equals([game.source, game.externalId]).first() : undefined) ?? await this.db.games.where("[source+normalizedPgnHash]").equals([game.source, game.normalizedPgnHash]).first();
    return row ? this.get(row.id) : null;
  }

  async contains(game: GameIdentity): Promise<boolean> {
    return !!(await this.db.games.where("[source+normalizedPgnHash]").equals([game.source, game.normalizedPgnHash]).primaryKeys()).length ||
      !!(game.externalId && (await this.db.games.where("[source+externalId]").equals([game.source, game.externalId]).primaryKeys()).length);
  }

  async get(id: string): Promise<GameDocument> {
    return this.db.transaction("r", this.db.games, this.db.trees, async () => {
      const game = await this.db.games.get(id);
      const savedTree = await this.db.trees.get(id);
      if (!game || !savedTree) throw new Error("This game is no longer in your library. Refresh the list and try again.");
      return documentSchema.parse({ game, tree: treeSchema.parse(savedTree.tree) });
    });
  }

  async save(documents: GameDocument[]): Promise<{ imported: number; duplicates: number }> {
    const validated = documents.map((document) => documentSchema.parse(document));
    // Check again inside one read/write transaction: concurrent tabs cannot race
    // between preview and import, or persist a game without its annotation tree.
    return this.db.transaction("rw", this.db.games, this.db.trees, async () => {
      let imported = 0;
      let duplicates = 0;
      for (const document of validated) {
        if (await this.contains(document.game)) { duplicates++; continue; }
        await this.db.games.add({ ...document.game, libraryDate: document.game.playedAt ?? "" } as GameRecord);
        await this.db.trees.add({ gameId: document.game.id, tree: document.tree });
        imported++;
      }
      return { imported, duplicates };
    });
  }

  async saveUserTree(id: string, previous: GameTree, next: GameTree): Promise<void> {
    const validated = treeSchema.parse(next);
    await this.db.transaction("rw", this.db.trees, async () => {
      const stored = await this.db.trees.get(id);
      if (!stored) throw new Error("The game is no longer saved locally.");
      if (JSON.stringify(stored.tree.userBranches ?? []) !== JSON.stringify(previous.userBranches ?? [])) throw new Error("Variations changed in another tab. Reopen the game before continuing.");
      // Never replace original PGN nodes, metadata, hashes or raw PGN.
      await this.db.trees.put({ gameId: id, tree: { ...stored.tree, userBranches: validated.userBranches } });
    });
  }

  async delete(id: string): Promise<void> {
    await this.db.transaction("rw", [this.db.games, this.db.trees, this.db.gameAnalyses, this.db.positionAnalyses, this.db.computerPositions], async () => {
      await this.db.games.delete(id);
      await this.db.trees.delete(id);
      await this.db.gameAnalyses.where("gameId").equals(id).delete();
      await this.db.positionAnalyses.where("gameId").equals(id).delete();
      await this.db.computerPositions.where("gameId").equals(id).delete();
    });
  }
}

let repository: GamesRepository | undefined;
let database: GamesDatabase | undefined;
export function gamesDatabase(): GamesDatabase { return database ??= new GamesDatabase(); }
export function gamesRepository(): GamesRepository {
  // Lazy construction: IndexedDB is never touched during Next.js server rendering.
  return repository ??= new GamesRepository(gamesDatabase());
}

export class ProfilesRepository {
  constructor(private readonly db: GamesDatabase = gamesDatabase()) {}
  async get(platform: PlatformProfile["platform"]) {
    const value = await this.db.profiles.where("platform").equals(platform).first();
    return value ? profileSchema.parse(value) : null;
  }
  async save(profile: PlatformProfile) {
    const value = profileSchema.parse(profile);
    await this.db.transaction("rw", this.db.profiles, async () => {
      await this.db.profiles.where("platform").equals(value.platform).delete();
      await this.db.profiles.add(value);
    });
    return value;
  }
  async updateSync(profile: PlatformProfile, patch: Partial<PlatformProfile>) {
    return this.db.transaction("rw", this.db.profiles, async () => {
      const current = await this.db.profiles.get(profile.id);
      // Do not resurrect a profile removed/replaced in another tab during import.
      if (!current) return null;
      const next = profileSchema.parse({ ...current, ...patch });
      await this.db.profiles.put(next);
      return next;
    });
  }
  async remove(id: string) { await this.db.profiles.delete(id); }
}

export function storageErrorMessage(error: unknown): string {
  const detail = error instanceof Error ? error.message : "Browser storage is unavailable.";
  return `Could not access the local game library. Check browser storage permissions or available space, then retry. ${detail}`;
}
