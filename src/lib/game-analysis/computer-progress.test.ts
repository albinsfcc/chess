import "fake-indexeddb/auto";
import { afterEach, expect, it } from "vitest";
import { GamesDatabase, GamesRepository } from "../db/games";
import { validatePgn } from "../pgn/validate";
import { ComputerProgressRepository } from "./computer-progress";
import { generatePositions, validateAssociations } from "./positions";
import { GameAnalysisRepository } from "./repository";
import { ENGINE_BUILD, type EngineResult } from "../engine/domain";
import { Chess } from "chess.js";
import { reviewSummary } from "./review-summary";

const db = new GamesDatabase("computer-progress-tests");
afterEach(async () => { await db.delete(); });
it("persists position associations and materializes the existing review without any engine calls", async () => {
  const document = (await validatePgn('[White "Human"]\n[Black "Ollie"]\n[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1')).validGames[0];
  document.game.source = "computer"; await new GamesRepository(db).save([document]);
  const plan = generatePositions(document.tree, "main"), config = { preset: "standard", multiPv: 3 } as const, progress = new ComputerProgressRepository(db);
  for (const position of plan.slice(0, -1)) {
    const chess = new Chess(position.fen), move = chess.moves({ verbose: true })[0];
    const result: EngineResult = { requestId: "test", fen: position.fen, config, engineBuild: ENGINE_BUILD, engineVersion: "Test", bestMove: move?.lan ?? null, bestMoveSan: move?.san ?? null, lines: [{ multiPv: 1, depth: 15, score: chess.isCheckmate() ? { type: "mate", moves: 0 } : { type: "cp", value: 20 }, lowerBound: false, upperBound: false, pvUci: move ? [move.lan] : [], pvSan: move ? [move.san] : [], replayComplete: true }] };
    await progress.save(document.game.id, position.ply, result, false);
    await expect(progress.save(document.game.id, position.ply, { ...result, bot: { timeMs: 60 } } as EngineResult, false)).rejects.toThrow("unrestricted");
  }
  db.close(); await db.open();
  expect(await progress.positions(document.game.id)).toHaveLength(4);
  await progress.prepareReview(document, config);
  const repository = new GameAnalysisRepository(db), sessions = (await repository.list(document.game.id)).sessions;
  expect(sessions).toHaveLength(1); expect(sessions[0]).toMatchObject({ status: "completed", completedPositions: 5, configuration: config });
  const rows = await repository.positions(sessions[0].id); validateAssociations(sessions[0], plan, rows);
  expect(rows[0].scoreAfter).not.toBeNull(); expect(rows[0].playedMoveSan).toBe("f3");
  await progress.prepareReview(document, config); expect((await repository.list(document.game.id)).sessions).toHaveLength(1);
  const summary = reviewSummary(plan, rows, document.game.id);
  expect(summary.w.accuracy).not.toBeNull(); expect(summary.b.accuracy).not.toBeNull(); expect(summary.w.graded + summary.b.graded).toBe(4);
});
