"use client";
import { useEffect, useRef, useState } from "react";

export function useFocusMode() {
  const [focused, setFocused] = useState(false);
  const ownsFullscreen = useRef(false);
  const generation = useRef(0);
  const exit = () => {
    generation.current++;
    setFocused(false);
    if (ownsFullscreen.current && document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    ownsFullscreen.current = false;
  };
  const enter = async () => {
    const ticket = ++generation.current;
    setFocused(true);
    // Fullscreen the document so promotion and review portals remain visible.
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      try {
        await document.documentElement.requestFullscreen();
        if (ticket !== generation.current) { if (document.fullscreenElement) await document.exitFullscreen(); return; }
        ownsFullscreen.current = true;
      } catch { /* The in-page focus layout also works when fullscreen is unavailable. */ }
    }
  };
  useEffect(() => {
    const changed = () => { if (!document.fullscreenElement && ownsFullscreen.current) { ownsFullscreen.current = false; setFocused(false); } };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || document.querySelector('[role="dialog"], [role="listbox"]')) return;
      generation.current++; setFocused(false);
      if (ownsFullscreen.current && document.fullscreenElement) void document.exitFullscreen().catch(() => {});
      ownsFullscreen.current = false;
    };
    document.addEventListener("fullscreenchange", changed);
    window.addEventListener("keydown", escape);
    return () => {
      // Invalidate the latest asynchronous fullscreen request, not the mount-time value.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++;
      document.removeEventListener("fullscreenchange", changed);
      window.removeEventListener("keydown", escape);
      if (ownsFullscreen.current && document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    };
  }, []);
  return { focused, toggle: () => focused ? exit() : void enter() };
}
