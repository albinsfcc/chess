import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { validatePgn } from "@/lib/pgn/import-service";
import { useWorkspace } from "./workspace";
import { useGameAnalysis } from "./game-analysis";
import { useReviewDialog } from "./game-review";

beforeEach(async () => {
  useGameAnalysis.setState({ busy: false, selected: null, sessions: [], positions: [] });
  useReviewDialog.getState().close();
  useWorkspace.getState().openGame((await validatePgn("1. e4 e5 *")).validGames[0]);
});
afterEach(() => { vi.restoreAllMocks(); useGameAnalysis.setState({ busy: false }); useReviewDialog.getState().close(); });

it.each([true, false])("background choice preserves pending startup; pause cancels it (background: %s)", async background => {
  let release!: () => void;
  vi.spyOn(useGameAnalysis.getState(), "load").mockImplementation(() => new Promise<void>(resolve => { release = resolve; }));
  const start = vi.spyOn(useGameAnalysis.getState(), "start").mockResolvedValue();
  const run = useReviewDialog.getState().opening();
  if (background) useReviewDialog.getState().continueInBackground(); else useReviewDialog.getState().close();
  release(); await run;
  expect(start).toHaveBeenCalledTimes(background ? 1 : 0);
  expect(useReviewDialog.getState().open).toBe(false);
  expect(useReviewDialog.getState().preparing).toBe(false);
});

it("reopens a running background queue without starting or pausing it", async () => {
  const pause = vi.spyOn(useGameAnalysis.getState(), "pause").mockResolvedValue();
  const start = vi.spyOn(useGameAnalysis.getState(), "start").mockResolvedValue();
  useReviewDialog.setState({ open: true, gameId: useWorkspace.getState().imported!.game.id });
  useGameAnalysis.setState({ busy: true });
  useReviewDialog.getState().continueInBackground();
  await useReviewDialog.getState().opening();
  expect(useReviewDialog.getState().open).toBe(true);
  expect(pause).not.toHaveBeenCalled(); expect(start).not.toHaveBeenCalled();
  useReviewDialog.getState().close();
  expect(pause).toHaveBeenCalledOnce();
});
