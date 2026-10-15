import { create } from "zustand";
import { z } from "zod";

export const COACH_KEY = "chess-review:coach:v1";
const schema = z.object({ enabled: z.boolean().default(true), avatar: z.enum(["maia", "iris", "vera"]).default("maia"), spoken: z.boolean().default(false), voices: z.object({ maia: z.string(), iris: z.string(), vera: z.string() }).default({ maia: "", iris: "", vera: "" }) });
export type CoachPreferences = z.infer<typeof schema>;
export const defaultCoachPreferences: CoachPreferences = schema.parse({});
export function parseCoachPreferences(raw: string | null): CoachPreferences {
  try { const parsed = schema.safeParse(JSON.parse(raw ?? "{}")); return parsed.success ? parsed.data : schema.parse({}); } catch { return schema.parse({}); }
}
export const useCoach = create<{
  preferences: CoachPreferences; hydrated: boolean; error: string | null;
  hydrate: () => void; update: (patch: Partial<CoachPreferences>) => void;
}>((set, get) => ({
  preferences: defaultCoachPreferences, hydrated: false, error: null,
  hydrate: () => {
    if (get().hydrated) return;
    try { set({ preferences: parseCoachPreferences(localStorage.getItem(COACH_KEY)), hydrated: true }); }
    catch { set({ hydrated: true, error: "Coach settings are available for this session only." }); }
  },
  update: patch => {
    const parsed = schema.safeParse({ ...get().preferences, ...patch }); if (!parsed.success) return;
    set({ preferences: parsed.data, error: null });
    try { localStorage.setItem(COACH_KEY, JSON.stringify(parsed.data)); } catch { set({ error: "Coach settings could not be saved. They apply for this session." }); }
  },
}));
