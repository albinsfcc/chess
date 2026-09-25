"use client";
import { useEffect, useMemo, useState } from "react";
import { useOpenings } from "@/store/openings";
import { useWorkspace } from "@/store/workspace";
import { openingHistory } from "@/lib/openings";
import { Button } from "./ui/button";
export function OpeningPanel() {
  const { index, loading, error, load } = useOpenings(), game = useWorkspace((state) => state.game);
  const playable = useWorkspace((state) => state.imported?.tree.playable !== false);
  const [query, setQuery] = useState(""), [page, setPage] = useState(0);
  useEffect(() => { void load(); }, [load]);
  const history = useMemo(() => index && playable ? openingHistory(game, index) : null, [game, index, playable]);
  const matches = useMemo(() => index?.entries.filter((entry) => `${entry.eco} ${entry.name}`.toLowerCase().includes(query.toLowerCase().trim())) ?? [], [index, query]);
  const name = history?.match?.name, colon = name?.indexOf(":") ?? -1;
  return <section className="min-w-0 space-y-2 rounded-xl border bg-card p-4" aria-label="Opening knowledge base">
    <h2 className="font-semibold">Opening & variation</h2>
    {loading && <p role="status" className="text-sm">Loading local opening knowledge…</p>}
    {error && <><p role="alert" className="text-sm">{error}</p><Button variant="outline" onClick={() => void load()}>Retry opening database</Button></>}
    {index && <>
      {history?.match ? <div aria-live="polite"><p className="text-sm font-medium" data-testid="opening-name">{history.match.eco} · {colon < 0 ? name : name!.slice(0, colon)}</p>{colon >= 0 && <p className="text-sm text-primary" data-testid="opening-variation">{name!.slice(colon + 1).trim()}</p>}<p className="text-xs text-muted-foreground">{history.current ? "Recognized position" : `Last recognized at ply ${history.matchedPly}; current position is outside the named line.`}</p>{!!history.aliases.length && <p className="text-xs text-muted-foreground">Also known as: {history.aliases.map((entry) => `${entry.eco} ${entry.name}`).join("; ")}</p>}</div> : <p className="text-sm text-muted-foreground">{!playable ? "Opening matching supports standard chess only." : game.cursor ? "No named opening found along this line." : "Play a move or open a game to identify its opening."}</p>}
      <details><summary className="cursor-pointer text-sm">Browse {index.entries.length.toLocaleString()} openings · ECO A00–E99</summary><label className="mt-3 block text-sm">Search openings<input type="search" aria-label="Search openings" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} className="mt-1 h-10 w-full rounded-md border bg-background px-2" placeholder="Sicilian, Najdorf, B90…" /></label>
        <p className="my-2 text-xs text-muted-foreground">{matches.length} matches · page {page + 1} of {Math.max(1, Math.ceil(matches.length / 20))}</p>
        <ul className="max-h-72 space-y-2 overflow-y-auto" aria-label="Opening search results">{matches.slice(page * 20, page * 20 + 20).map((entry) => <li key={`${entry.eco}:${entry.name}:${entry.pgn}`} className="rounded border p-2 text-sm"><strong>{entry.eco} · {entry.name}</strong><p className="mt-1 break-words font-mono text-xs text-muted-foreground">{entry.pgn}</p></li>)}</ul>
        {!matches.length && <p className="text-sm">No openings match your search.</p>}
        <div className="mt-2 flex gap-2"><Button variant="outline" disabled={!page} onClick={() => setPage(page - 1)}>Previous openings</Button><Button variant="outline" disabled={(page + 1) * 20 >= matches.length} onClick={() => setPage(page + 1)}>More openings</Button></div>
      </details>
      <p className="text-xs text-muted-foreground">Local CC0 opening names from Lichess. Book means a listed continuation, not a guarantee it is strongest.</p>
    </>}
  </section>;
}
