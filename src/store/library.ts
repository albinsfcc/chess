import { create } from "zustand";
import { gamesRepository, storageErrorMessage } from "@/lib/db/games";
import type { GameRecord } from "@/lib/pgn/domain";
import { useReviewDialog } from "./game-review";
import { useWorkspace } from "./workspace";

import { useGameAnalysis } from "./game-analysis";
import { useAnalysis } from "./analysis";
import { platformStores } from "./platform-import";
import { withQueueLock } from "@/lib/game-analysis/queue";

type LibraryState = {
  games: GameRecord[];
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  busyId: string | null;
  page: number; total: number; setPage: (page: number) => Promise<void>;
  refresh: () => Promise<void>;
  open: (id: string) => Promise<void>;
  clearAll: () => Promise<boolean>;
  remove: (id: string) => Promise<boolean>;
};
let refreshVersion = 0;
export const useLibrary = create<LibraryState>((set, get) => ({
  games: [], status: "idle", error: null, busyId: null,
  page: 0, total: 0,
  clearAll: async () => {
    if (get().busyId) return false;
    set({ busyId: "all", error: null });
    try {
      if (useWorkspace.getState().computer) throw new Error("Finish or exit the computer game before clearing the library.");
      if (Object.values(platformStores).some(store => store.getState().busy)) throw new Error("Finish or cancel the active import before clearing the library.");
      useReviewDialog.getState().close();
      await useGameAnalysis.getState().pause();
      useAnalysis.getState().stop();
      await withQueueLock(() => gamesRepository().clearGames());
      useReviewDialog.setState({ gameId: null, automaticGameId: null, pendingGameId: null });
      if (useWorkspace.getState().imported) useWorkspace.getState().closeGame();
      useGameAnalysis.setState({ active: null });
      await useGameAnalysis.getState().load(null);
      set({ page: 0 });
      await get().refresh();
      return true;
    } catch (error) { set({ error: storageErrorMessage(error) }); return false; }
    finally { set({ busyId: null }); }
  },
  setPage: async (page) => { set({ page: Math.max(0, page) }); await get().refresh(); },
  refresh: async () => {
    const version = ++refreshVersion;
    set({ status: "loading", error: null });
    try {
      const result = await gamesRepository().page(get().page);
      if (version === refreshVersion) set({ ...result, status: "ready" });
    } catch (error) {
      if (version === refreshVersion) set({ status: "error", error: storageErrorMessage(error) });
    }
  },
  open: async (id) => {
    set({ busyId: id, error: null });
    try { useReviewDialog.setState({automaticGameId: null}); useWorkspace.getState().openGame(await gamesRepository().get(id)); }
    catch (error) { set({ error: storageErrorMessage(error) }); }
    finally { set({ busyId: null }); }
  },
  remove: async (id) => {
    set({ busyId: id, error: null });
    try {
      await gamesRepository().delete(id);
      if (useWorkspace.getState().imported?.game.id === id) useWorkspace.getState().closeGame();
      await get().refresh();
      return true;
    } catch (error) { set({ error: storageErrorMessage(error) }); return false; }
    finally { set({ busyId: null }); }
  },
}));
