import { useEffect, useRef, useState, useSyncExternalStore } from "react";
export const MOVE_ANIMATION_MS = 250;
const query = "(prefers-reduced-motion: reduce)";
function subscribe(listener: () => void) { const media = matchMedia(query); media.addEventListener("change", listener); return () => media.removeEventListener("change", listener); }
/** Coalesce rapid navigation until the library's current transition has settled.
 * Its promotion animation uses an internal completion timer; never overlap it
 * with another position or remount the board to cancel it. */
export function useBoardAnimation(fen: string, transition: "replace" | "navigate" | "move") {
  const reduced = useSyncExternalStore(subscribe, () => matchMedia(query).matches, () => true);
  const [display, setDisplay] = useState({ fen, animate: false, active: false });
  const availableAt = useRef(0);
  useEffect(() => {
    if (display.fen === fen) return;
    const timer = setTimeout(() => {
      const animate = transition === "navigate" && !reduced;
      availableAt.current = Date.now() + (animate ? MOVE_ANIMATION_MS + 20 : 0);
      setDisplay({ fen, animate, active: animate });
    }, Math.max(0, availableAt.current - Date.now()));
    return () => clearTimeout(timer);
  }, [fen, transition, reduced, display.fen]);
  useEffect(() => {
    if (!display.active) return;
    const timer = setTimeout(() => setDisplay((current) => current === display ? { ...current, active: false } : current), Math.max(0, availableAt.current - Date.now()));
    return () => clearTimeout(timer);
  }, [display]);
  return { ...display, duration: reduced ? 0 : MOVE_ANIMATION_MS, settling: display.fen !== fen || display.active };
}
