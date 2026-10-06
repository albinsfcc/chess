export const THEME_KEY = "chess-review:theme:v1";
export type Theme = "dark" | "light";
export const parseTheme = (value: string | null): Theme => value === "light" ? "light" : "dark";
// Applied before the first paint; restricted to two known values, with safe storage fallback.
export const THEME_BOOTSTRAP = `try{document.documentElement.dataset.theme=localStorage.getItem(${JSON.stringify(THEME_KEY)})==="light"?"light":"dark"}catch{document.documentElement.dataset.theme="dark"}`;

export const BLUR_KEY = "chess-review:glass-blur:v1";
export const DEFAULT_BLUR = 24;
export function parseBlur(value: string | null): number {
  if (value === null || value.trim() === "") return DEFAULT_BLUR;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(Math.min(40, Math.max(0, parsed))) : DEFAULT_BLUR;
}
export const BLUR_BOOTSTRAP = `try{let n=localStorage.getItem("${BLUR_KEY}");let v=n===null||n.trim()===""?24:Number(n);document.documentElement.style.setProperty("--surface-blur",(Number.isFinite(v)?Math.round(Math.min(40,Math.max(0,v))):24)+"px")}catch{}`;
