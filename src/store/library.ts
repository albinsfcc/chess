import { create } from "zustand";
import { gamesRepository, storageErrorMessage } from "@/lib/db/games";
import type { GameRecord } from "@/lib/pgn/domain";
import { useWorkspace } from "./workspace";

type LibraryState = {
  games: GameRecord[];
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  busyId: string | null;
  page: number; total: number; setPage: (page: number) => Promise<void>;
  refresh: () => Promise<void>;
  open: (id: string) => Promise<void>;
  remove: (id: string) => Promise<boolean>;
};
let refreshVersion = 0;
export const useLibrary = create<LibraryState>((set, get) => ({
  games: [], status: "idle", error: null, busyId: null,
  page: 0, total: 0,
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
    try { useWorkspace.getState().openGame(await gamesRepository().get(id)); }
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
