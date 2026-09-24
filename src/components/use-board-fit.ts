import { useEffect, useRef } from "react";

/** Fit the square into the space left after the real (zoom-aware) player/control heights. */
export function useBoardFit() {
  const host = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const media = matchMedia("(min-width: 900px) and (min-height: 600px)");
    let frame = 0;
    const observed = new Set<Element>();
    const measure = () => {
      frame = 0;
      const content = element.querySelector<HTMLElement>(".workspace-chess");
      if (!content) return;
      if (!media.matches) { content.style.removeProperty("--chess-area-width"); return; }
      let chrome = 0;
      element.querySelectorAll<HTMLElement>("[data-board-chrome]").forEach((item) => {
        if (!observed.has(item)) { observed.add(item); resize.observe(item); }
        const style = getComputedStyle(item);
        chrome += item.getBoundingClientRect().height + parseFloat(style.marginTop) + parseFloat(style.marginBottom);
      });
      const rail = element.querySelector<HTMLElement>(".evaluation-column");
      const board = element.querySelector<HTMLElement>(".board-with-evaluation");
      const extra = rail && board ? rail.getBoundingClientRect().width + parseFloat(getComputedStyle(board).columnGap) : 64;
      const width = Math.floor(Math.max(0, Math.min(element.clientWidth, element.clientHeight - chrome - 2 + extra)));
      if (content.style.getPropertyValue("--chess-area-width") !== `${width}px`) content.style.setProperty("--chess-area-width", `${width}px`);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    const resize = new ResizeObserver(schedule);
    const mutations = new MutationObserver(schedule);
    resize.observe(element); mutations.observe(element, { childList: true, subtree: true });
    media.addEventListener("change", schedule); schedule();
    return () => { cancelAnimationFrame(frame); resize.disconnect(); mutations.disconnect(); media.removeEventListener("change", schedule); };
  }, []);
  return host;
}
