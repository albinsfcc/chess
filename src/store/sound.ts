import { create } from "zustand";
import { setSoundEnabled } from "@/lib/sound";
const KEY = "chess-review:sound:v1";
export const useSound = create<{ enabled: boolean; error: string | null; hydrate: () => void; update: (enabled: boolean) => void }>((set) => ({
  enabled: true, error: null,
  hydrate: () => { try { const enabled = localStorage.getItem(KEY) !== "false"; setSoundEnabled(enabled); set({ enabled }); } catch { /* Session defaults still work. */ } },
  update: (enabled) => {
    setSoundEnabled(enabled); set({ enabled, error: null });
    try { localStorage.setItem(KEY, String(enabled)); } catch { set({ error: "Sound preference could not be saved; it applies for this session." }); }
  },
}));
