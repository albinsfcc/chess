import { create } from "zustand";
import { runDataTask } from "@/lib/data/client";
import type { ThreatResult } from "@/lib/engine/threats";
let controller: AbortController | null = null;
export const useThreats = create<{
  result: ThreatResult | null; loading: boolean; error: string | null;
  update: (fen: string | null) => Promise<void>;
}>((set) => ({
  result: null, loading: false, error: null,
  update: async (fen) => {
    controller?.abort(); const active = new AbortController(); controller = active;
    set({ result: null, error: null, loading: !!fen });
    if (!fen) return;
    try {
      const result = await runDataTask("threats", fen, active.signal);
      if (!active.signal.aborted && controller === active) set({ result, loading: false });
    } catch {
      if (!active.signal.aborted && controller === active) set({ error: "Threat detection is unavailable. Toggle Show threats to retry.", loading: false });
    }
  },
}));
