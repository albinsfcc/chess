"use client";

import { Button } from "@/components/ui/button";
import { MoveList } from "./move-list";
import { treeNode, USER_BRANCH } from "@/lib/pgn/position";
import { mainLineReturn } from "@/lib/pgn/user-variation";
import { useWorkspace } from "@/store/workspace";
import { platformName } from "@/lib/platforms/domain";

export function ImportedGameViewer() {
  const imported = useWorkspace((state) => state.imported);
  const game = useWorkspace((state) => state.game);
  const selectedPath = useWorkspace((state) => state.selectedPath);
  const select = useWorkspace((state) => state.selectNode);
  if (!imported) return null;
  const record = imported.game;
  const active = treeNode(imported.tree, selectedPath);
  const branch = selectedPath[0] === USER_BRANCH ? imported.tree.userBranches?.[selectedPath[1]] : undefined;
  const rootNode = branch ? treeNode(imported.tree, branch.root) : undefined;
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
      <p role="status" className="px-5 pt-3 text-sm text-primary">{selectedPath.length > 1 ? `Variation${branch ? ` from ${rootNode ? `${rootNode.moveNumber}${rootNode.turn === "w" ? "." : "..."} ${rootNode.san}` : "starting position"}` : " (PGN)"}` : "Main line"}</p>
      <div className="p-3">
        {imported.tree.mainLine.length ? <MoveList nodes={imported.tree.mainLine} /> : <p className="p-2 text-sm text-muted-foreground">This game contains a starting position and no moves.</p>}
        {imported.tree.userBranches?.map((variation, index) => <details key={index} open={selectedPath[0] === USER_BRANCH && selectedPath[1] === index} className="mt-2 border-l-2 border-primary/30 pl-2"><summary className="cursor-pointer text-sm">Local variation {index + 1} from {variation.root.length ? `ply ${variation.moves[0].ply - 1}` : "start"}</summary><MoveList nodes={variation.moves} variation /></details>)}
      </div>
      <div className="space-y-2 border-t px-5 py-3">
        <Button variant="secondary" size="sm" onClick={() => select(mainLineReturn(imported.tree, selectedPath))}>Return to main line</Button>
        <p className="text-xs text-muted-foreground">← / → Previous / Next · ↑ / ↓ First / Last (also Home / End)</p>
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
