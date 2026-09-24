import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { validatePgn } from "./validate";
import { addUserMove, mainLineReturn, validateUserBranches } from "./user-variation";
import { reconstructPosition, USER_BRANCH } from "./position";
import type { GameTree, NodePath } from "./domain";
import { tryMove } from "@/lib/game";
import { Chess } from "chess.js";
import { GamesDatabase, GamesRepository } from "@/lib/db/games";
import { generatePositions } from "@/lib/game-analysis/positions";
import { workspacePosition, formatClock } from "@/lib/workspace-position";
import { BackupRepository } from "@/lib/data/backup-repository";
import { validateBackup } from "@/lib/data/validate-backup";
const pgn = '[TimeControl "300+2"]\n1. e4 {[%clk 0:04:59.25]} (1. d4 d5) e5 2. Nf3 *';
async function doc(text = pgn) { return (await validatePgn(text)).validGames[0]; }
function play(tree: GameTree, path: NodePath, san: string) {
  const chess = new Chess(reconstructPosition(tree, path).fen), move = chess.move(san);
  return addUserMove(tree, path, { from: move.from, to: move.to, san: move.san, promotion: move.promotion as "q" | "r" | "b" | "n" | undefined });
}
describe("locally authored variations", () => {
  it("advances matching PGN moves and existing RAVs without duplicating nodes", async () => {
    const document = await doc();
    expect(play(document.tree, [], "e4")).toEqual({ tree: document.tree, path: [0] });
    expect(play(document.tree, [], "d4")).toEqual({ tree: document.tree, path: [0, 0, 0] });
    expect(document.tree.userBranches).toBeUndefined();
    expect(mainLineReturn(document.tree, [0, 0, 1])).toEqual([1]);
  });
  it("creates and deduplicates branches while keeping imported PGN nodes immutable", async () => {
    const document = await doc(), original = JSON.stringify(document);
    const branch = play(document.tree, [0], "d5");
    expect(branch.path).toEqual([USER_BRANCH, 0, 0]);
    const repeated = play(branch.tree, [0], "d5");
    expect(repeated.tree).toBe(branch.tree); expect(repeated.path).toEqual(branch.path);
    expect(JSON.stringify(document)).toBe(original);
    expect(branch.tree.mainLine).toBe(document.tree.mainLine);
  });
  it("extends branches, nests alternatives, replays captures and returns with clocks intact", async () => {
    const document = await doc(); const first = play(document.tree, [0], "d5");
    const capture = play(first.tree, first.path, "exd5");
    const nested = play(capture.tree, first.path, "Nc3");
    expect(nested.tree.userBranches).toHaveLength(2);
    const position = reconstructPosition(nested.tree, capture.path);
    const view = workspacePosition(position.game, { ...document, tree: nested.tree }, position.navigationPaths);
    expect(view.players.w.captured).toEqual(["p"]); expect(formatClock(view.players.w.clock)).toBe("4:59.25");
    expect(mainLineReturn(nested.tree, nested.path)).toEqual([0]);
    const main = reconstructPosition(nested.tree, [0]); expect(main.fen).toBe(reconstructPosition(document.tree, [0]).fen);
    expect(generatePositions(nested.tree, nested.path.slice(0, -1)).at(-1)?.fen).toBe(reconstructPosition(nested.tree, nested.path).fen);
    validateUserBranches(nested.tree);
  });
  it("branches from the end, an imported variation and an empty setup game; promotes with capture", async () => {
    const document = await doc(); expect(play(document.tree, [2], "Nc6").tree.userBranches).toHaveLength(1);
    expect(play(document.tree, [0, 0, 1], "c4").tree.userBranches?.[0].root).toEqual([0, 0, 1]);
    const setup = await doc('[SetUp "1"]\n[FEN "r6k/1P6/8/8/8/8/8/7K w - - 0 1"]\n*');
    const branch = play(setup.tree, [], "bxa8=Q+");
    const position = reconstructPosition(branch.tree, branch.path);
    expect(new Chess(position.fen).get("a8")?.type).toBe("q");
    expect(workspacePosition(position.game, { ...setup, tree: branch.tree }, position.navigationPaths).players.w.captured).toEqual(["r"]);
  });
  it("allows legal exploration after a repetition draw without changing free-play rules", async () => {
    const document = await doc("1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 Ng8 *");
    const position = reconstructPosition(document.tree, [7]);
    expect(tryMove(position.game, "e2", "e4").kind).toBe("illegal");
    expect(tryMove(position.game, "e2", "e4", undefined, true).kind).toBe("moved");
    expect(play(document.tree, [7], "e4").path[0]).toBe(USER_BRANCH);
  });
  it("persists additions and backups without changing raw PGN; rejects concurrent overwrite", async () => {
    const document = await doc(), db = new GamesDatabase(`variation-${crypto.randomUUID()}`), repository = new GamesRepository(db);
    try {
      await repository.save([document]); const branch = play(document.tree, [0], "d5");
      await repository.saveUserTree(document.game.id, document.tree, branch.tree);
      await expect(repository.saveUserTree(document.game.id, document.tree, branch.tree)).rejects.toThrow("another tab");
      db.close(); await db.open();
      const saved = await repository.get(document.game.id);
      expect(saved.game.rawPgn).toBe(document.game.rawPgn); expect(saved.tree).toEqual(branch.tree);
      const backups = new BackupRepository(db), backup = await validateBackup(await backups.export());
      await backups.clearAll(); await backups.restore(backup); expect((await repository.get(document.game.id)).tree).toEqual(branch.tree);
      const corrupt = structuredClone(branch.tree); corrupt.userBranches![0].root = [USER_BRANCH, 0, 0];
      expect(() => validateUserBranches(corrupt)).toThrow("anchor");
    } finally { await db.delete(); }
  });
});
