import { create } from "zustand";
import { parseTheme, THEME_KEY, BLUR_KEY, DEFAULT_BLUR, parseBlur, type Theme } from "@/lib/theme";
function applyBlur(blur: number) { document.documentElement.style.setProperty("--surface-blur", `${blur}px`); }
function apply(theme: Theme) { document.documentElement.dataset.theme = theme; }
export const useTheme = create<{ theme: Theme; blur: number; setBlur: (blur: number) => void; syncBlur: (value: string | null) => void; error: string | null; hydrate: () => void; setTheme: (theme: Theme) => void; sync: (value: string | null) => void }>((set) => ({
  theme: "dark", blur: DEFAULT_BLUR, error: null,
  hydrate: () => {
    try { const theme = parseTheme(localStorage.getItem(THEME_KEY)); const blur = parseBlur(localStorage.getItem(BLUR_KEY)); apply(theme); applyBlur(blur); set({ theme, blur }); }
    catch { apply("dark"); applyBlur(DEFAULT_BLUR); set({ error: "Appearance preferences could not be read. You can still switch themes for this session." }); }
  },
  setTheme: theme => {
    apply(theme); set({ theme, error: null });
    try { localStorage.setItem(THEME_KEY, theme); }
    catch { set({ error: "Your theme applies now but could not be saved for the next visit." }); }
  },
  setBlur: value => {
    const blur = parseBlur(String(value)); applyBlur(blur); set({ blur, error: null });
    try { localStorage.setItem(BLUR_KEY, String(blur)); }
    catch { set({ error: "Your blur applies now but could not be saved for the next visit." }); }
  },
  syncBlur: value => { const blur = parseBlur(value); applyBlur(blur); set({ blur }); },
  sync: value => { const theme = parseTheme(value); apply(theme); set({ theme, error: null }); },
}));
