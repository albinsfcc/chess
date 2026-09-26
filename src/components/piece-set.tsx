"use client";
import { useEffect, useMemo, useState } from "react";
import { defaultPieces, type PieceRenderObject } from "react-chessboard";
import { PIECE_CODES, pieceAsset } from "@/lib/board-appearance";

let preload: Promise<Set<string>> | undefined;
export function preloadCarvedPieces() {
  return preload ??= Promise.all(PIECE_CODES.map(code => new Promise<string | null>(resolve => {
    const image = new Image(); image.onload = () => resolve(code); image.onerror = () => resolve(null); image.src = pieceAsset(code);
  }))).then(codes => new Set(codes.filter((code): code is string => code !== null)));
}
function CarvedPiece({ code, ready }: { code: string; ready: boolean }) {
  const [failed, setFailed] = useState(false), Fallback = defaultPieces[code];
  if (!ready || failed) return <Fallback />;
  // Local preloaded SVGs; the bundled renderer remains available on any asset error.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={pieceAsset(code)} alt="" draggable={false} className="h-full w-full select-none" onError={() => setFailed(true)} />;
}
export function usePieceSet(name: "classic" | "carved"): PieceRenderObject {
  const [ready, setReady] = useState<Set<string>>(new Set());
  useEffect(() => { let mounted = true; void preloadCarvedPieces().then(codes => { if (mounted) setReady(codes); }); return () => { mounted = false; }; }, []);
  return useMemo(() => name === "classic" ? defaultPieces : Object.fromEntries(PIECE_CODES.map(code => [code, () => <CarvedPiece code={code} ready={ready.has(code)} />])), [name, ready]);
}
