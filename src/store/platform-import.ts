import { create } from "zustand";
import { gamesRepository, ProfilesRepository } from "@/lib/db/games";
import { createAdapter } from "@/lib/platforms/client";
import { cancelled, publicError, usernameSchema, type DiscoveryGame, type DiscoveryOptions, type Platform, type PlatformProfile, type ProfileSummary } from "@/lib/platforms/domain";
import { importDiscovered } from "@/lib/platforms/import-service";
import { runDataTask } from "@/lib/data/client";
import { discoveryCheckpoint } from "@/lib/platforms/refresh";
import { useImportPreferences } from "./import-preferences";
import { useLibrary } from "./library";

type PlatformState = {
  profile: PlatformProfile | null; candidate: ProfileSummary | null; editing: boolean; loading: boolean;
  busy: "lookup" | "fetch" | "import" | "save" | null; months: string[]; rows: DiscoveryGame[];
  progress: string; error: string | null; warnings: string[]; success: string | null;
  checkpoint: string | undefined; recentLimit: number; hasMore: boolean; recentMode: boolean; loadMore: () => Promise<void>;
  initialize: () => Promise<void>; lookup: (username: string) => Promise<void>; saveProfile: () => Promise<void>;
  edit: () => void; back: () => void; removeProfile: () => Promise<void>; cancel: () => void;
  discover: (options: DiscoveryOptions, append?: boolean) => Promise<void>; importRows: (keys: string[]) => Promise<void>;
};

function platformStore(platform: Platform) {
  const adapter = createAdapter(platform);
  let controller: AbortController | null = null;
  return create<PlatformState>((set, get) => {
    function start(kind: PlatformState["busy"]) {
      controller?.abort(); controller = new AbortController();
      set({ busy: kind, error: null, success: null });
      return controller.signal;
    }
    function warn(message: string) { set((state) => ({ warnings: [...state.warnings.slice(-99), message] })); }
    return {
      profile: null, candidate: null, editing: true, loading: false, busy: null, months: [], rows: [], progress: "", error: null, warnings: [], success: null, checkpoint: undefined, recentLimit: 0, hasMore: false, recentMode: true,
      loadMore: async () => { const state = get(); if (state.busy || !state.hasMore) return; await state.discover({ recent: true, full: true, max: Math.min(1000, state.recentLimit + useImportPreferences.getState().moreCount) }, true); },
      initialize: async () => {
        controller?.abort(); useImportPreferences.getState().hydrate();
        const signal = start("fetch"); set({ loading: true, rows: [], warnings: [], progress: "", hasMore: false, recentLimit: 0 });
        try {
          const profile = await new ProfilesRepository().get(platform);
          signal.throwIfAborted(); set({ profile, editing: !profile, candidate: null });
        } catch (error) { if (controller?.signal === signal) set({ error: publicError(error) }); }
        finally { if (controller?.signal === signal) set({ loading: false, busy: null }); }
        if (!signal.aborted && get().profile && !get().error) await get().discover({ recent: true, full: true, max: useImportPreferences.getState().initialCount });
      },
      lookup: async (username) => {
        if (get().busy) return;
        const parsed = usernameSchema.safeParse(username);
        if (!parsed.success) { set({ error: "Enter a username of 2–30 letters, numbers, underscores or hyphens.", candidate: null }); return; }
        const signal = start("lookup"); set({ candidate: null });
        try { const candidate = await adapter.lookup(parsed.data, signal); signal.throwIfAborted(); set({ candidate }); }
        catch (error) { if (controller?.signal === signal) set({ error: publicError(error) }); }
        finally { if (controller?.signal === signal) set({ busy: null }); }
      },
      saveProfile: async () => {
        if (get().busy) return;
        const candidate = get().candidate; if (!candidate) return;
        const signal = start("save");
        try {
          const now = new Date().toISOString();
          const profile = await new ProfilesRepository().save({ ...candidate, id: crypto.randomUUID(), createdAt: now, updatedAt: now });
          signal.throwIfAborted();
          set({ profile, editing: false, candidate: null, rows: [], months: [], warnings: [], checkpoint: undefined, progress: "", success: "Profile saved on this device." });
        } catch (error) { if (controller?.signal === signal) set({ error: publicError(error) }); }
        finally { if (controller?.signal === signal) set({ busy: null }); }
        if (!signal.aborted && !get().error) await get().discover({ recent: true, full: true, max: useImportPreferences.getState().initialCount });
      },
      edit: () => set({ editing: true, candidate: null, error: null, success: null }),
      back: () => set({ editing: !get().profile, candidate: null, error: null }),
      removeProfile: async () => {
        if (get().busy) return;
        const profile = get().profile; if (!profile) return;
        const signal = start("save");
        try { await new ProfilesRepository().remove(profile.id); set({ profile: null, candidate: null, editing: true, rows: [], months: [], warnings: [], progress: "", checkpoint: undefined, success: "Profile removed. Imported games remain in your library." }); }
        catch (error) { if (controller?.signal === signal) set({ error: publicError(error) }); }
        finally { if (controller?.signal === signal) set({ busy: null }); }
      },
      cancel: () => controller?.abort(),
      discover: async (options, append = false) => {
        if (get().busy) return;
        const profile = get().profile; if (!profile) return;
        const signal = start("fetch");
        const startedAt = new Date().toISOString();
        const retained = append ? get().rows : [];
        set({ rows: retained, warnings: [], progress: "Starting discovery...", checkpoint: undefined, recentMode: !!options.recent });
        let received = 0;
        let complete = false, heldBytes = JSON.stringify(get().rows).length * 2, lastFlush = Date.now();
        let pendingRows: DiscoveryGame[] = [];
        const flush = () => { if (controller?.signal !== signal || signal.aborted) return; if (pendingRows.length) { const batch = pendingRows; pendingRows = []; set((state) => ({ rows: [...state.rows, ...batch].sort((a, b) => b.playedAtMs - a.playedAtMs) })); lastFlush = Date.now(); } };
        try {
          const seen = new Set(get().rows.map((row) => row.key));
          for await (const event of adapter.discover(profile, options, signal)) {
            signal.throwIfAborted();
            if (event.type === "archives") set({ months: event.months });
            else if (event.type === "progress") set({ progress: event.message });
            else if (event.type === "warning") warn(event.message);
            else if (event.type === "complete") complete = !event.limited;
            else {
              received++;
              if (get().rows.length + pendingRows.length >= 5000) { warn("Discovery stopped at 5,000 games. Narrow the date range to fetch more."); break; }
              try {
                const document = await runDataTask("platform", event.game, signal);
                signal.throwIfAborted();
                const key = `${platform}:${document.game.externalId ?? document.game.normalizedPgnHash}`;
                if (seen.has(key)) continue; seen.add(key);
                const row: DiscoveryGame = { key, document, playedAtMs: event.game.playedAtMs ?? (Date.parse(document.game.playedAt ?? "") || 0), alreadyImported: await gamesRepository().contains(document.game) };
                signal.throwIfAborted();
                heldBytes += JSON.stringify(document).length * 2;
                if (heldBytes > 25_000_000) { warn("Discovery reached its 25 MB memory budget. Narrow the range to discover more games."); complete = false; break; }
                pendingRows.push(row); if (pendingRows.length >= 20 || Date.now() - lastFlush >= 100) flush();
              } catch (error) { if (cancelled(error)) throw error; warn(publicError(error)); }
            }
          }
          flush();
          if (options.recent) set({recentLimit: options.max, hasMore: received >= options.max && options.max < 1000});
          if (!complete && !options.recent) warn("Discovery is partial or reached its limit. Use a narrower range or full refresh to find remaining games.");
          set({ progress: `${get().rows.length} games discovered.`, checkpoint: !options.recent && complete && !get().warnings.length ? discoveryCheckpoint(platform, startedAt, options) : undefined });
        } catch (error) { flush(); if (controller?.signal === signal) set({ error: publicError(error), progress: `${get().rows.length} discovered games kept.` }); }
        finally { if (controller?.signal === signal) set({ busy: null }); }
      },
      importRows: async (keys) => {
        if (get().busy) return;
        const profile = get().profile; if (!profile) return;
        const selected = new Set(keys); const rows = get().rows.filter((row) => selected.has(row.key));
        if (!rows.length) return;
        const signal = start("import");
        try {
          const report = await importDiscovered(rows, profile, get().checkpoint, signal, (count) => set({ progress: `Imported/checking ${count}/${rows.length} games…` }));
          if (controller?.signal !== signal) { await useLibrary.getState().refresh(); return; }
          const checked: DiscoveryGame[] = [];
          for (const row of get().rows) checked.push({ ...row, alreadyImported: await gamesRepository().contains(row.document.game) });
          if (controller?.signal !== signal) { await useLibrary.getState().refresh(); return; }
          set((state) => ({ profile: report.profile ?? state.profile, rows: checked,
            success: `${report.imported} imported · ${report.duplicates} duplicates · ${report.failed} failed${report.cancelled ? " · cancelled; saved games kept" : ""}`, warnings: [...state.warnings, ...report.errors] }));
          await useLibrary.getState().refresh();
        } catch (error) { if (controller?.signal === signal) set({ error: publicError(error) }); }
        finally { if (controller?.signal === signal) set({ busy: null }); }
      },
    };
  });
}
export const platformStores = { chesscom: platformStore("chesscom"), lichess: platformStore("lichess") };
