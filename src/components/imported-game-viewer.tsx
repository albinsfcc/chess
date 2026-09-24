"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { MoveList } from "./move-list";
import type { GameNode } from "@/lib/pgn/domain";
import { useWorkspace } from "@/store/workspace";
import { platformName } from "@/lib/platforms/domain";

export function ImportedGameViewer() {
  const imported = useWorkspace((state) => state.imported);
  const game = useWorkspace((state) => state.game);
  const selectedPath = useWorkspace((state) => state.selectedPath);
  const select = useWorkspace((state) => state.selectNode);
  const goTo = useWorkspace((state) => state.goTo);
  useEffect(() => {
    function navigate(event: KeyboardEvent) {
      const target = event.target;
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || document.querySelector('[role="dialog"]')) return;
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest("input, textarea, select"))) return;
      const cursor = useWorkspace.getState().game.cursor;
      const length = useWorkspace.getState().game.moves.length;
      const position = { ArrowLeft: cursor - 1, ArrowRight: cursor + 1, Home: 0, End: length }[event.key];
      if (position !== undefined) { event.preventDefault(); goTo(position); }
    }
    window.addEventListener("keydown", navigate);
    return () => window.removeEventListener("keydown", navigate);
  }, [goTo]);
  if (!imported) return null;
  const record = imported.game;
  let line = imported.tree.mainLine;
  let active: GameNode | undefined;
  for (let index = 0; index < selectedPath.length; index += 2) {
    active = line[selectedPath[index]];
    if (index + 1 < selectedPath.length) line = active.variations[selectedPath[index + 1]];
  }
  const comments = active ? [...active.commentsBefore, ...active.commentsAfter] : imported.tree.comments;
  const annotations = Object.entries(active?.annotations ?? imported.tree.annotations).filter(([key]) => key !== "comment");
  return <>
    <section className="rounded-xl border bg-card p-5" aria-label="Game headers">
      <h2 className="break-words font-semibold">{record.white}{record.whiteRating !== null ? ` (${record.whiteRating})` : ""} vs {record.black}{record.blackRating !== null ? ` (${record.blackRating})` : ""}</h2>
      <p className="mt-2 text-sm text-primary">{record.result} · {record.playedAt ?? "Date unknown"}</p>
      <p className="mt-2 break-words text-sm text-muted-foreground">{record.event} · {record.site} · Round {record.round}</p>
      <p className="mt-1 text-xs text-muted-foreground">{record.variant} · Time control {record.timeControl} · {platformName[record.source]}</p>
      <details className="mt-3 text-sm"><summary className="cursor-pointer text-muted-foreground">All PGN headers</summary><dl className="mt-2 space-y-1">{Object.entries(record.headers).map(([key, value]) => <div key={key} className="break-words"><dt className="inline font-medium">{key}: </dt><dd className="inline text-muted-foreground">{value}</dd></div>)}</dl></details>
    </section>
    <section className="overflow-hidden rounded-xl border bg-card" aria-labelledby="moves-heading">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-4"><h2 id="moves-heading" className="font-semibold">Moves & variations</h2><span className="text-xs text-muted-foreground">Ply {game.cursor} / {game.moves.length}</span></div>
      <div className="max-h-[360px] overflow-auto p-3">
        {imported.tree.mainLine.length ? <MoveList nodes={imported.tree.mainLine} /> : <p className="p-2 text-sm text-muted-foreground">This game contains a starting position and no moves.</p>}
      </div>
      <div className="space-y-2 border-t px-5 py-3">
        <Button variant="secondary" size="sm" onClick={() => select(game.cursor && imported.tree.mainLine.length ? [Math.min(game.cursor, imported.tree.mainLine.length) - 1] : [])}>Return to main line</Button>
        <p className="text-xs text-muted-foreground">← / → Previous / Next · Home / End First / Last</p>
      </div>
      <div className="space-y-2 border-t p-5" aria-label="Position comments" aria-live="polite">
        <h3 className="text-sm font-medium">{active ? `After ${active.moveNumber}${active.turn === "w" ? "." : "..."} ${active.san}` : "Starting position"}</h3>
        {comments.length ? comments.map((comment, index) => <p key={index} className="whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">{comment}</p>) : <p className="text-sm text-muted-foreground">No comments for this position.</p>}
        {!!active?.nags.length && <p className="font-mono text-sm text-primary">NAGs: {active.nags.join(" ")}</p>}
        {annotations.map(([key, value]) => <p key={key} className="break-words text-xs text-muted-foreground">{key}: {Array.isArray(value) ? value.join(", ") : value}</p>)}
      </div>
    </section>
  </>;
}
