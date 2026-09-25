import { create } from "zustand";
import { z } from "zod";
export const importPreferencesSchema = z.object({ initialCount: z.number().int().min(1).max(50).default(5), moreCount: z.number().int().min(1).max(50).default(5) });
const key = "chess-review:import-preferences:v1";
export const useImportPreferences = create<{ initialCount: number; moreCount: number; hydrated: boolean; error: string | null; hydrate: () => void; update: (patch: Partial<{initialCount: number; moreCount: number}>) => void }>((set, get) => ({
  initialCount: 5, moreCount: 5, hydrated: false, error: null,
  hydrate: () => { if (get().hydrated) return; set({ hydrated: true }); try { const raw = localStorage.getItem(key); if (raw) set(importPreferencesSchema.parse(JSON.parse(raw))); } catch { set({error: "Import preferences could not be read. Defaults remain available."}); } },
  update: (patch) => { const parsed = importPreferencesSchema.safeParse({...get(), ...patch}); if (!parsed.success) return; set({...parsed.data,error:null}); try { localStorage.setItem(key,JSON.stringify(parsed.data)); } catch {set({error:"Import preferences apply now but could not be saved."});} },
}));
