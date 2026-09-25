"use client";
import { APP_VERSION } from "@/lib/app-info";
import { ENGINE_ASSET_ROOT, ENGINE_SOURCE } from "@/lib/engine/domain";
export function Licenses() {
  return <details className="rounded-md border p-3 text-sm"><summary className="cursor-pointer font-medium">About / Licenses</summary><div className="mt-3 space-y-3 break-words text-xs leading-relaxed text-muted-foreground">
    <p>Chess Review {APP_VERSION}. Local-first chess analysis. No accounts, analytics or cloud storage.</p>
    <p>Opening names and continuations: lichess-org/chess-openings, CC0-1.0. Pinned commit c67912be581f0793dbaa776be5ccf111e01f88d9. <a className="text-primary underline" href="https://github.com/lichess-org/chess-openings/tree/c67912be581f0793dbaa776be5ccf111e01f88d9" target="_blank" rel="noreferrer">Corresponding opening source</a> · <a className="text-primary underline" href="/openings/COPYING.txt">CC0 license</a> · <a className="text-primary underline" href="/openings/manifest.json">Dataset provenance and hashes</a></p>
    <p>Stockfish 19 · Stockfish.js 19.0.0 · lite single-threaded WASM · GNU GPLv3. Stockfish by the Stockfish developers; Stockfish.js © 2026 Chess.com, LLC, Nathan Rugg and contributors. Engine files are self-hosted and unmodified.</p>
    <p className="flex flex-wrap gap-3"><a className="text-primary underline" href={ENGINE_SOURCE} target="_blank" rel="noreferrer">Corresponding Stockfish source</a><a className="text-primary underline" href={`${ENGINE_ASSET_ROOT}/COPYING.txt`} target="_blank" rel="noreferrer">GPLv3 license</a><a className="text-primary underline" href={`${ENGINE_ASSET_ROOT}/NOTICE.txt`} target="_blank" rel="noreferrer">Stockfish.js notice & build reference</a><a className="text-primary underline" href={`${ENGINE_ASSET_ROOT}/manifest.json`} target="_blank" rel="noreferrer">Engine file hashes</a></p>
    <ul className="list-inside list-disc space-y-1"><li>chess.js 1.4.0 — BSD-2-Clause</li><li>react-chessboard 5.12.1 — MIT</li><li>@mliebelt/pgn-parser 1.4.19 — Apache-2.0</li><li>Dexie — Apache-2.0; React, Next.js, Zustand, Zod and Radix UI — MIT</li></ul>
    <p><a className="text-primary underline" href="/licenses/THIRD-PARTY-NOTICES.txt" target="_blank" rel="noreferrer">Full third-party licenses, copyright notices and attributions</a></p><p><a className="text-primary underline" href="/licenses/manifest.json" target="_blank" rel="noreferrer">Installed versions and license inventory</a></p>
  </div></details>;
}
