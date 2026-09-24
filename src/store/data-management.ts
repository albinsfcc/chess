import { create } from "zustand";
import { BackupRepository } from "@/lib/data/backup-repository";
import { BACKUP_MAX_BYTES, type LocalBackup } from "@/lib/data/backup-format";
import { runDataTask } from "@/lib/data/client";
import { downloadText } from "@/lib/data/download";
import { defaultPreferences, PREFERENCES_KEY } from "@/lib/preferences";
import { defaultEnginePreferences, ENGINE_PREFERENCES_KEY } from "@/lib/engine/domain";
import { engineClient } from "@/lib/engine/client";
import { invalidateAnalysisWrites } from "@/lib/engine/repository";
import { withQueueLock } from "@/lib/game-analysis/queue";
import { useWorkspace } from "./workspace";
import { useAnalysis } from "./analysis";
import { useGameAnalysis } from "./game-analysis";
import { useLibrary } from "./library";
import { platformStores } from "./platform-import";

type DataState = { busy: boolean; error: string | null; success: string | null; preview: LocalBackup | null;
  validate: (file: File) => Promise<void>; export: () => Promise<void>; restore: () => Promise<void>; clear: (all: boolean) => Promise<void> };
async function idle() {
  if (Object.values(platformStores).some((store) => store.getState().busy)) throw new Error("Finish or cancel the active platform import before managing local data.");
  await useGameAnalysis.getState().pause(); useAnalysis.getState().stop(); engineClient().terminate(); invalidateAnalysisWrites();
}
async function refresh() {
  useAnalysis.setState({ result: null, cached: false });
  useGameAnalysis.setState({ active: null }); await useGameAnalysis.getState().load(useWorkspace.getState().imported?.game.id ?? null);
  await useLibrary.getState().refresh();
}
export const useDataManagement = create<DataState>((set, get) => {
  async function perform(work: () => Promise<void>) {
    if (get().busy) return; set({ busy: true, error: null, success: null });
    try { await work(); } catch (error) { set({ error: error instanceof Error ? error.message : "Local data could not be updated. Check browser storage and retry." }); }
    finally { set({ busy: false }); }
  }
  return { busy: false, error: null, success: null, preview: null,
    validate: (file) => perform(async () => { set({ preview: null }); if (file.size > BACKUP_MAX_BYTES) throw new Error("Backup exceeds the 50 MB restore limit."); const preview = await runDataTask("backup", await file.text()); set({ preview, success: "Backup validated. Existing games and profiles will be preserved." }); }),
    export: () => perform(async () => { await idle(); const text = await withQueueLock(() => new BackupRepository().export({ board: useWorkspace.getState().preferences, engine: useAnalysis.getState().preferences })); downloadText(text, `chess-review-backup-${new Date().toISOString().slice(0, 10)}.json`); set({ success: "Backup exported. Keep this file private; it includes your saved profiles, games and analysis." }); }),
    restore: () => perform(async () => {
      const backup = get().preview; if (!backup) throw new Error("Choose and validate a backup first.");
      await idle(); const result = await withQueueLock(() => new BackupRepository().restore(backup));
      if (backup.preferences) { useWorkspace.getState().updatePreferences(backup.preferences.board); useAnalysis.getState().updatePreferences(backup.preferences.engine); }
      await refresh(); set({ preview: null, success: `Restored ${result.imported} games. ${result.duplicates} existing games preserved. Compatible new analysis and profiles were merged.` });
    }),
    clear: (all) => perform(async () => {
      await idle(); const repository = new BackupRepository();
      await withQueueLock(() => all ? repository.clearAll() : repository.clearAnalysis());
      if (all) {
        useWorkspace.getState().reset(); useWorkspace.setState({ preferences: { ...defaultPreferences } }); useAnalysis.setState({ preferences: { ...defaultEnginePreferences } });
        for (const store of Object.values(platformStores)) store.setState({ profile: null, candidate: null, rows: [], months: [], editing: true, error: null, success: null });
        try { localStorage.removeItem(PREFERENCES_KEY); localStorage.removeItem(ENGINE_PREFERENCES_KEY); } catch { set({ error: "Database cleared, but browser preference storage could not be cleared. Check browser permissions." }); }
      }
      await refresh(); set({ preview: null, success: all ? "All local games, profiles, analysis and preferences were cleared." : "Analysis results cleared. Your games and profiles are kept." });
    }),
  };
});
