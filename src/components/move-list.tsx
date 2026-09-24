"use client";
import { useMemo } from "react";
import { Button } from "./ui/button";
import { useWorkspace } from "@/store/workspace";
import { nodePath } from "@/lib/pgn/position";
import { flattenMoves } from "@/lib/pgn/move-list";
import type { GameNode } from "@/lib/pgn/domain";
const PAGE_SIZE = 100;
export function MoveList({ nodes }: { nodes: GameNode[] }) {
  const rows = useMemo(() => flattenMoves(nodes), [nodes]);
  const selected = useWorkspace((state) => state.selectedPath.join(".")), select = useWorkspace((state) => state.selectNode);
  const active = rows.findIndex((row) => row.node.id === selected), offset = Math.floor(Math.max(0, active) / PAGE_SIZE) * PAGE_SIZE;
  const groups: { depth: number; nodes: GameNode[] }[] = [];
  for (const row of rows.slice(offset, offset + PAGE_SIZE)) { const last = groups.at(-1); if (last?.depth === row.depth) last.nodes.push(row.node); else groups.push({ depth: row.depth, nodes: [row.node] }); }
  return <>
    {groups.map((group) => <div key={group.nodes[0].id} style={{ marginLeft: Math.min(group.depth, 5) * 10 }} className={group.depth ? "my-2 border-l-2 border-primary/30 pl-2" : ""} aria-label={group.depth ? `Variation level ${group.depth}` : "Main line"}>
      {group.nodes.map((node) => <Button key={node.id} variant="ghost" size="sm" aria-current={selected === node.id ? "step" : undefined} aria-label={`${group.depth ? "Variation" : "Main line"} ${node.moveNumber}${node.turn === "w" ? "." : "..."} ${node.san}`}
        className={`my-0.5 h-auto min-h-8 whitespace-normal font-mono ${selected === node.id ? "bg-primary/15 text-primary" : ""}`} onClick={() => select(nodePath(node))}>
        <span className="text-muted-foreground">{node.moveNumber}{node.turn === "w" ? "." : "..."}</span> {node.san} {node.nags.join(" ")}{(node.commentsAfter.length > 0 || node.commentsBefore.length > 0) && <span aria-label="Has comment" className="text-primary">·</span>}
      </Button>)}
    </div>)}
    {rows.length > PAGE_SIZE && <nav aria-label="Move list pages" className="mt-2 flex flex-wrap items-center gap-2"><Button variant="outline" disabled={!offset} onClick={() => select(nodePath(rows[offset - PAGE_SIZE].node))}>Previous moves</Button><span className="text-xs">{offset + 1}–{Math.min(rows.length, offset + PAGE_SIZE)} of {rows.length}</span><Button variant="outline" disabled={offset + PAGE_SIZE >= rows.length} onClick={() => select(nodePath(rows[offset + PAGE_SIZE].node))}>More moves</Button></nav>}
  </>;
}
