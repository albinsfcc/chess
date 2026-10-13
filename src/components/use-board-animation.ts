import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { promotionTransition } from "@/lib/board-animation";
export const MOVE_ANIMATION_MS = 180;
const query = "(prefers-reduced-motion: reduce)";
function subscribe(listener: () => void) { const media = matchMedia(query); media.addEventListener("change", listener); return () => media.removeEventListener("change", listener); }
/** Ordinary moves can interrupt the library's cancellable transform transition.
 * Only promotions have an uncancelled completion timer and must settle first. */
export function useBoardAnimation(fen: string, transition: "replace" | "navigate" | "move") {
  const reduced = useSyncExternalStore(subscribe, () => matchMedia(query).matches, () => true);
  const [display, setDisplay] = useState({ fen, animate: false, active: false });
  const availableAt = useRef(0);
  const protectedAnimation = useRef(false);
  useLayoutEffect(() => {
    if (display.fen === fen) return;
    const update = () => {
      const animate = transition === "navigate" && !reduced;
      protectedAnimation.current = animate && promotionTransition(display.fen, fen);
      availableAt.current = Date.now() + (animate ? MOVE_ANIMATION_MS + 16 : 0);
      setDisplay({ fen, animate, active: animate });
    };
    const delay = protectedAnimation.current || transition !== "navigate" || reduced ? Math.max(0, availableAt.current - Date.now()) : 0;
    if (!delay) { update(); return; }
    const timer = setTimeout(update, delay);
    return () => clearTimeout(timer);
  }, [fen, transition, reduced, display.fen]);
  useEffect(() => {
    if (!display.active) return;
    const timer = setTimeout(() => setDisplay((current) => current === display ? { ...current, active: false } : current), Math.max(0, availableAt.current - Date.now()));
    return () => clearTimeout(timer);
  }, [display]);
  return { ...display, duration: reduced ? 0 : MOVE_ANIMATION_MS, settling: display.fen !== fen || display.active };
}
