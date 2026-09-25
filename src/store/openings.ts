import { create } from "zustand";
import { runDataTask } from "@/lib/data/client";
import { installOpeningIndex, type OpeningIndex } from "@/lib/openings";
export const useOpenings = create<{ index: OpeningIndex | null; loading: boolean; error: string | null; load: () => Promise<void> }>((set, get) => ({
  index: null, loading: false, error: null,
  load: async () => {
    if (get().index || get().loading) return;
    set({ loading: true, error: null });
    try { const index = await runDataTask("openings", null); installOpeningIndex(index); set({ index }); }
    catch { set({ error: "Opening knowledge base is unavailable. Retry when local application assets are reachable; engine analysis still works." }); }
    finally { set({ loading: false }); }
  },
}));
