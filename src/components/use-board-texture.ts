"use client";
import { useEffect, useState } from "react";
import { boardTexture } from "@/lib/board-textures";

const preloads = new Map<string, Promise<boolean>>();
export function preloadBoardTexture(asset: string) {
  let pending = preloads.get(asset);
  if (!pending) {
    pending = new Promise<boolean>(resolve => {
      const image = new Image();
      image.onload = () => { void image.decode().then(() => resolve(true), () => resolve(false)); };
      image.onerror = () => resolve(false);
      image.src = asset;
    });
    preloads.set(asset, pending);
  }
  return pending;
}
/** Decode before displaying; late loads cannot replace a newer selection. */
export function useBoardTexture(id: string) {
  const asset = boardTexture(id)?.asset;
  const [loaded, setLoaded] = useState<{ asset: string; ready: boolean } | null>(null);
  useEffect(() => {
    if (!asset) return;
    let active = true;
    void preloadBoardTexture(asset).then(ready => { if (active) setLoaded({ asset, ready }); });
    return () => { active = false; };
  }, [asset]);
  return { asset: loaded?.asset === asset && loaded?.ready ? asset : undefined, loading: !!asset && loaded?.asset !== asset, failed: !!asset && loaded?.asset === asset && !loaded.ready };
}
