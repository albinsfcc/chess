import { create } from "zustand";
import { useGameAnalysis } from "./game-analysis";
import { useWorkspace } from "./workspace";
import { useAnalysis } from "./analysis";
import { fullReview } from "@/lib/game-analysis/review-summary";
import { usableResult } from "@/lib/engine/result-quality";
import { configSchema } from "@/lib/engine/domain";

type ReviewDialogState = { open: boolean; gameId: string | null; automaticGameId: string | null; pendingGameId: string | null; preparing: boolean; opening: (prepare?: () => Promise<void>) => Promise<void>; close: () => void; retry: () => Promise<void>; autoResume: () => void };
let generation = 0, resuming = false;
export const useReviewDialog = create<ReviewDialogState>((set, get) => ({
  open: false, gameId: null, automaticGameId: null, pendingGameId: null, preparing: false,
  opening: async (prepare) => {
    const document = useWorkspace.getState().imported;
    if (!document?.tree.playable || get().preparing || useGameAnalysis.getState().busy) return;
    const token = ++generation, current = () => token === generation && get().open && useWorkspace.getState().imported?.game.id === document.game.id;
    const stored = document.game.source === "computer" ? configSchema.safeParse({ preset: document.game.headers.ReviewPreset, multiPv: Number(document.game.headers.ReviewMultiPV) }) : null;
    const { preset, multiPv } = stored?.success ? stored.data : useAnalysis.getState().preferences;
    set({ open: true, gameId: document.game.id, preparing: true });
    if (prepare) {
      try { await prepare(); } catch (error) { useGameAnalysis.setState({ error: error instanceof Error ? error.message : "Saved progress could not be loaded." }); set({ preparing: false }); return; }
      if (!current()) return;
    }
    await useGameAnalysis.getState().load(document.game.id);
    if (!current()) return;
    const review = useGameAnalysis.getState();
    const saved = review.sessions.find((session) => fullReview(session, document.game.id, document.tree.mainLine.length) && session.configuration.preset === preset && session.configuration.multiPv === multiPv);
    if (saved) {
      await review.open(saved.id); if (!current()) return;
      if (useGameAnalysis.getState().selected?.id !== saved.id) { set({ preparing: false }); return; }
      if (saved.status !== "completed" || useGameAnalysis.getState().positions.some((row) => !usableResult(row.result))) {
        const run = review.resume(); set({ preparing: false }); await run;
      } else set({ preparing: false });
    } else {
      // Guard prevents an immediately closed modal from launching after persistence settles.
      const run = review.start("main", { preset, multiPv, startPly: 0, endPly: document.tree.mainLine.length }, current);
      await run; if (current()) set({ preparing: false });
    }
  },
  close: () => {
    const wasOpen = get().open;
    generation++; set({ open: false, preparing: false });
    if (wasOpen && useGameAnalysis.getState().busy) void useGameAnalysis.getState().pause();
  },
  retry: async () => {
    if (!get().open || useGameAnalysis.getState().busy) return;
    if (useGameAnalysis.getState().selected) { resuming = true; try { await useGameAnalysis.getState().resume(); } finally { resuming = false; } }
    else { set({ preparing: false }); await get().opening(); }
  },
  autoResume: () => {
    const review = useGameAnalysis.getState();
    if (!get().open || get().preparing || resuming || review.busy || review.error || globalThis.document?.visibilityState === "hidden") return;
    // A visibility pause during worker startup may occur before a session exists.
    if (!review.selected && (!review.active || review.active.gameId !== get().gameId)) { void get().opening(); return; }
    if (review.selected?.gameId !== get().gameId || review.selected?.status !== "paused") return;
    resuming = true; void review.resume().finally(() => { resuming = false; });
  },
}));
/** Subscribe once with the mounted modal; closed dialogs never resume a queue. */
export function connectReviewDialog() {
  const changed = () => useReviewDialog.getState().autoResume();
  const off = useGameAnalysis.subscribe(changed);
  const offDialog = useReviewDialog.subscribe(changed);
  document.addEventListener("visibilitychange", changed);
  return () => { off(); offDialog(); document.removeEventListener("visibilitychange", changed); useReviewDialog.getState().close(); };
}
