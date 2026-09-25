"use client";

import { useEffect, useState } from "react";
import { RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { GameRecord } from "@/lib/pgn/domain";
import { useLibrary } from "@/store/library";
import { useWorkspace } from "@/store/workspace";
import { platformName } from "@/lib/platforms/domain";

export function GameLibrary({ onOpen }: { onOpen?: () => void }) {
  const { games, status, error, busyId, refresh, open, remove, page, total, setPage } = useLibrary();
  const activeId = useWorkspace((state) => state.imported?.game.id);
  const [deleting, setDeleting] = useState<GameRecord | null>(null);
  useEffect(() => { void refresh(); }, [refresh]);

  return <section className="min-w-0 rounded-xl border bg-card" aria-labelledby="games-heading">
    <div className="flex items-center justify-between border-b px-5 py-4"><h2 id="games-heading" className="font-semibold">Game library</h2>
      <Button variant="ghost" size="icon" aria-label="Refresh library" disabled={status === "loading" || !!busyId} onClick={() => void refresh()}><RefreshCw size={16} /></Button>
    </div>
    <p className="px-5 pt-3 text-xs text-muted-foreground">Most recent played first · saved on this device</p>
    {(status === "idle" || status === "loading") && <p role="status" className="px-5 py-6 text-sm text-muted-foreground">Loading your games…</p>}
    {status === "ready" && !games.length && <p className="px-5 py-6 text-sm text-muted-foreground">No saved games yet. Use Paste PGN to start your library.</p>}
    {error && <p role="alert" className="break-words px-5 py-3 text-sm text-destructive">{error}</p>}
    <ul className="max-h-[460px] space-y-2 overflow-y-auto p-3" aria-label="Saved games">
      {games.map((game) => <li key={game.id} className={`rounded-lg border p-3 ${activeId === game.id ? "border-primary/40 bg-primary/5" : "bg-background/30"}`}>
        <p className="break-words text-sm font-medium">{game.white}{game.whiteRating !== null && ` (${game.whiteRating})`} vs {game.black}{game.blackRating !== null && ` (${game.blackRating})`}</p>
        <p className="mt-1 text-xs text-muted-foreground">{game.result} · {game.playedAt?.slice(0, 10) ?? "Date unknown"} · {platformName[game.source]}</p>
        <p className={`mt-2 text-xs ${game.analysisStatus === "unsupported" ? "text-amber-200" : "text-muted-foreground"}`}>{game.analysisStatus === "unsupported" ? `${game.variant} is unsupported. Saved for reference; standard board unavailable.` : game.analysisStatus === "analyzed" ? "Main line analyzed" : game.analysisStatus === "partial" ? "Analysis available · partial or selected branch" : "Not analyzed"}</p>
        <div className="mt-3 flex items-center justify-between gap-2">
          <Button variant="secondary" size="sm" disabled={!!busyId || game.analysisStatus === "unsupported"} aria-label={`Open ${game.white} vs ${game.black}`} onClick={async () => { await open(game.id); if (!useLibrary.getState().error) onOpen?.(); }}>{busyId === game.id ? "Working…" : activeId === game.id ? "Open from start" : "Open game"}</Button>
          <Button variant="ghost" size="icon" disabled={!!busyId} aria-label={`Delete ${game.white} vs ${game.black}`} onClick={() => setDeleting(game)}><Trash2 size={16} /></Button>
        </div>
      </li>)}
    </ul>
    {total > 25 && <nav aria-label="Game library pages" className="flex flex-wrap items-center justify-between gap-2 border-t p-3">
      <Button variant="outline" disabled={page === 0 || status === "loading"} onClick={() => void setPage(page - 1)}>Previous games</Button>
      <span role="status" className="text-xs">Page {page + 1} of {Math.ceil(total / 25)} · {total} games</span>
      <Button variant="outline" disabled={(page + 1) * 25 >= total || status === "loading"} onClick={() => void setPage(page + 1)}>Next games</Button>
    </nav>}
    <Dialog open={!!deleting} onOpenChange={(value) => { if (!value && !busyId) setDeleting(null); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Delete this game?</DialogTitle><DialogDescription>{deleting?.white} vs {deleting?.black} will be removed from this device, including its saved PGN, variations and game analysis sessions.</DialogDescription></DialogHeader>
        {error && <p role="alert" className="break-words text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2"><Button variant="outline" disabled={!!busyId} onClick={() => setDeleting(null)}>Cancel</Button><Button variant="destructive" disabled={!!busyId} onClick={async () => { if (deleting && await remove(deleting.id)) setDeleting(null); }}>Delete game</Button></div>
      </DialogContent>
    </Dialog>
  </section>;
}
