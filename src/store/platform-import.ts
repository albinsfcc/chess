import { create } from "zustand";
import { gamesRepository, ProfilesRepository } from "@/lib/db/games";
import { createAdapter } from "@/lib/platforms/client";
import { cancelled, publicError, usernameSchema, type DiscoveryGame, type DiscoveryOptions, type Platform, type PlatformProfile, type ProfileSummary } from "@/lib/platforms/domain";
import { importDiscovered } from "@/lib/platforms/import-service";
import { runDataTask } from "@/lib/data/client";
import { discoveryCheckpoint } from "@/lib/platforms/refresh";
import { useLibrary } from "./library";

type PlatformState = {
  profile: PlatformProfile | null; candidate: ProfileSummary | null; editing: boolean; loading: boolean;
  busy: "lookup" | "fetch" | "import" | "save" | null; months: string[]; rows: DiscoveryGame[];
  progress: string; error: string | null; warnings: string[]; success: string | null;
  checkpoint: string | undefined;
  initialize: () => Promise<void>; lookup: (username: string) => Promise<void>; saveProfile: () => Promise<void>;
  edit: () => void; back: () => void; removeProfile: () => Promise<void>; cancel: () => void;
  discover: (options: DiscoveryOptions) => Promise<void>; importRows: (keys: string[]) => Promise<void>;
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
      profile: null, candidate: null, editing: true, loading: false, busy: null, months: [], rows: [], progress: "", error: null, warnings: [], success: null, checkpoint: undefined,
      initialize: async () => {
        controller?.abort();
        const signal = start("fetch"); set({ loading: true, rows: [], warnings: [], progress: "" });
        try {
          const profile = await new ProfilesRepository().get(platform);
          signal.throwIfAborted(); set({ profile, editing: !profile, candidate: null });
        } catch (error) { if (controller?.signal === signal) set({ error: publicError(error) }); }
        finally { if (controller?.signal === signal) set({ loading: false, busy: null }); }
        if (!signal.aborted && get().profile && !get().error) await get().discover({ recent: true, full: true, max: 5 });
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
        if (!signal.aborted && !get().error) await get().discover({ recent: true, full: true, max: 5 });
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
      discover: async (options) => {
        if (get().busy) return;
        const profile = get().profile; if (!profile) return;
        const signal = start("fetch");
        const startedAt = new Date().toISOString();
        set({ rows: [], warnings: [], progress: "Starting discovery…", checkpoint: undefined });
        let complete = false, heldBytes = 0, lastFlush = Date.now();
        let pendingRows: DiscoveryGame[] = [];
        const flush = () => { if (controller?.signal !== signal || signal.aborted) return; if (pendingRows.length) { const batch = pendingRows; pendingRows = []; set((state) => ({ rows: [...state.rows, ...batch].sort((a, b) => b.playedAtMs - a.playedAtMs) })); lastFlush = Date.now(); } };
        try {
          const seen = new Set<string>();
          for await (const event of adapter.discover(profile, options, signal)) {
            signal.throwIfAborted();
            if (event.type === "archives") set({ months: event.months });
            else if (event.type === "progress") set({ progress: event.message });
            else if (event.type === "warning") warn(event.message);
            else if (event.type === "complete") complete = !event.limited;
            else {
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
