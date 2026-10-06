import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useTheme } from "./theme";
import { THEME_KEY, BLUR_KEY, parseBlur, parseTheme } from "../lib/theme";
const dataset: Record<string, string> = {};
beforeEach(() => {
  vi.stubGlobal("document", { documentElement: { dataset, style: { setProperty: vi.fn() } } });
  vi.stubGlobal("localStorage", { getItem: vi.fn(() => null), setItem: vi.fn() });
  useTheme.setState({ theme: "dark", error: null });
});
afterEach(() => vi.unstubAllGlobals());
it("migrates missing and invalid choices to dark", () => {
  for (const value of [null, "", "invalid", "dark"]) expect(parseTheme(value)).toBe("dark");
  expect(parseTheme("light")).toBe("light");
});
it("switches immediately, persists and restores light mode", () => {
  useTheme.getState().setTheme("light");
  expect(dataset.theme).toBe("light"); expect(localStorage.setItem).toHaveBeenCalledWith(THEME_KEY, "light");
  vi.mocked(localStorage.getItem).mockReturnValue("light");
  useTheme.getState().hydrate(); expect(useTheme.getState().theme).toBe("light");
});
it("keeps theme switching usable when preference storage is blocked", () => {
  vi.mocked(localStorage.getItem).mockImplementation(() => { throw new Error("denied"); });
  vi.mocked(localStorage.setItem).mockImplementation(() => { throw new Error("denied"); });
  useTheme.getState().hydrate(); expect(dataset.theme).toBe("dark");
  useTheme.getState().setTheme("light"); expect(dataset.theme).toBe("light"); expect(useTheme.getState().error).toContain("could not be saved");
});
it("syncs other tabs and storage clearing without a write loop", () => {
  useTheme.getState().sync("light"); expect(dataset.theme).toBe("light");
  useTheme.getState().sync(null); expect(dataset.theme).toBe("dark"); expect(localStorage.setItem).not.toHaveBeenCalled();
});

it("clamps and restores glass blur independently of colour mode", () => {
  expect(parseBlur(null)).toBe(24); expect(parseBlur("bad")).toBe(24);
  expect(parseBlur("-2")).toBe(0); expect(parseBlur("90")).toBe(40);
  useTheme.getState().setBlur(12);
  expect(localStorage.setItem).toHaveBeenCalledWith(BLUR_KEY, "12");
  expect(document.documentElement.style.setProperty).toHaveBeenCalledWith("--surface-blur", "12px");
  useTheme.getState().setTheme("light"); expect(useTheme.getState().blur).toBe(12);
  vi.mocked(localStorage.getItem).mockImplementation(key => key === BLUR_KEY ? "12" : "light");
  useTheme.getState().hydrate(); expect(useTheme.getState().blur).toBe(12);
  useTheme.getState().syncBlur(null); expect(useTheme.getState().blur).toBe(24);
});
it("keeps blur usable if storage is denied", () => {
  vi.mocked(localStorage.setItem).mockImplementation(() => { throw new Error("denied"); });
  useTheme.getState().setBlur(0);
  expect(useTheme.getState().blur).toBe(0);
  expect(useTheme.getState().error).toContain("could not be saved");
});
