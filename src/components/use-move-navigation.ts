import { useEffect } from "react";
import { navigationPly } from "@/lib/navigation";
import { useWorkspace } from "@/store/workspace";

export function useMoveNavigation() {
  useEffect(() => {
    let held: string | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    const stop = () => { clearInterval(timer); timer = undefined; held = null; };
    const blocked = (target: EventTarget | null) => document.hidden || !!document.querySelector('[role="dialog"], [role="alertdialog"]') ||
      target instanceof HTMLElement && (target.isContentEditable || !!target.closest('input, textarea, select, [role="combobox"], [role="slider"]'));
    const step = (key: string) => {
      const { game, goTo } = useWorkspace.getState();
      const next = navigationPly(key, game.cursor, game.moves.length);
      if (next !== undefined && next !== game.cursor) goTo(next);
    };
    const down = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || blocked(event.target)) { stop(); return; }
      if (navigationPly(event.key, 0, 1) === undefined) return;
      event.preventDefault();
      if (event.repeat) return;
      stop(); step(event.key);
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        held = event.key;
        timer = setInterval(() => { if (blocked(document.activeElement)) stop(); else if (held) step(held); }, 250);
      }
    };
    const up = (event: KeyboardEvent) => { if (event.key === held) stop(); };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", stop);
    document.addEventListener("visibilitychange", stop);
    return () => {
      stop(); window.removeEventListener("keydown", down); window.removeEventListener("keyup", up);
      window.removeEventListener("blur", stop); document.removeEventListener("visibilitychange", stop);
    };
  }, []);
}
