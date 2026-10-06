"use client";
import { useEffect, useMemo, useState } from "react";
import { defaultPieces, type PieceRenderObject } from "react-chessboard";
import { PIECE_CODES, pieceAsset } from "@/lib/board-appearance";
import type { BoardPreferences } from "@/lib/preferences";

type AssetSet = "carved" | "sculpted" | "soft-classic";
const preloads = new Map<AssetSet, Promise<Set<string>>>();
function preloadPieces(name: AssetSet) {
  let pending = preloads.get(name);
  if (!pending) {
    pending = Promise.all(PIECE_CODES.map(code => new Promise<string | null>(resolve => {
      const image = new Image(); image.onload = () => resolve(code); image.onerror = () => resolve(null); image.src = pieceAsset(code, name);
    }))).then(codes => new Set(codes.filter((code): code is string => code !== null)));
    preloads.set(name, pending);
  }
  return pending;
}
function AssetPiece({ code, name, ready }: { code: string; name: AssetSet; ready: boolean }) {
  const [failed, setFailed] = useState(false), Fallback = defaultPieces[code];
  if (!ready || failed) return <Fallback />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={pieceAsset(code, name)} alt="" draggable={false} className="h-full w-full select-none" onError={() => setFailed(true)} />;
}
export function usePieceSet(name: BoardPreferences["pieceSet"]): PieceRenderObject {
  const [loaded, setLoaded] = useState<{ name: AssetSet; codes: Set<string> } | null>(null);
  useEffect(() => {
    if (name === "classic") return;
    let mounted = true;
    void preloadPieces(name).then(codes => { if (mounted) setLoaded({ name, codes }); });
    return () => { mounted = false; };
  }, [name]);
  return useMemo(() => name === "classic" ? defaultPieces : Object.fromEntries(PIECE_CODES.map(code => [code, () => <AssetPiece key={name} name={name} code={code} ready={loaded?.name === name && loaded.codes.has(code)} />])), [name, loaded]);
}
