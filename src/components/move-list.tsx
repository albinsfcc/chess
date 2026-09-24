"use client";
import { useMemo } from "react";
import { Button } from "./ui/button";
import { useWorkspace } from "@/store/workspace";
import { nodePath } from "@/lib/pgn/position";
import { flattenMoves } from "@/lib/pgn/move-list";
import type { GameNode } from "@/lib/pgn/domain";
import { useGameAnalysis } from "@/store/game-analysis";
import { assessmentMap } from "@/lib/game-analysis/move-quality";
const PAGE_SIZE = 100;
export function MoveList({ nodes, variation = false }: { nodes: GameNode[]; variation?: boolean }) {
  const records = useGameAnalysis((state) => state.positions);
  const gameId = useWorkspace((state) => state.imported?.game.id);
  const rows = useMemo(() => flattenMoves(nodes), [nodes]);
  const selected = useWorkspace((state) => state.selectedPath.join(".")), select = useWorkspace((state) => state.selectNode);
  const active = rows.findIndex((row) => row.node.id === selected), offset = Math.floor(Math.max(0, active) / PAGE_SIZE) * PAGE_SIZE;
  const visiblePaths = useMemo(() => new Set(rows.slice(offset, offset + PAGE_SIZE).map((row) => row.node.id)), [rows, offset]);
  const assessments = useMemo(() => assessmentMap(records, gameId, visiblePaths), [records, gameId, visiblePaths]);
  const groups: { depth: number; nodes: GameNode[] }[] = [];
  for (const row of rows.slice(offset, offset + PAGE_SIZE)) { const last = groups.at(-1); if (last?.depth === row.depth) last.nodes.push(row.node); else groups.push({ depth: row.depth, nodes: [row.node] }); }
  return <>
    {groups.map((group) => <div key={group.nodes[0].id} style={{ marginLeft: Math.min(group.depth, 5) * 10 }} className={group.depth ? "my-2 border-l-2 border-primary/30 pl-2" : ""} aria-label={group.depth ? `Variation level ${group.depth}` : "Main line"}>
      {group.nodes.map((node) => <Button key={node.id} variant="ghost" size="sm" aria-current={selected === node.id ? "step" : undefined} aria-label={`${group.depth || variation ? "Variation" : "Main line"} ${node.moveNumber}${node.turn === "w" ? "." : "..."} ${node.san}`}
        className={`my-0.5 h-auto min-h-8 whitespace-normal font-mono ${selected === node.id ? "bg-primary/15 text-primary" : ""}`} onClick={() => select(nodePath(node))}>
        <span className="text-muted-foreground">{node.moveNumber}{node.turn === "w" ? "." : "..."}</span> {node.san} {node.nags.join(" ")}{(node.commentsAfter.length > 0 || node.commentsBefore.length > 0) && <span aria-label="Has comment" className="text-primary">·</span>}
        {assessments.get(node.id) && <span className="text-[10px] font-sans text-muted-foreground" title={assessments.get(node.id)!.reason}>{assessments.get(node.id)!.label}</span>}
      </Button>)}
    </div>)}
    {rows.length > PAGE_SIZE && <nav aria-label="Move list pages" className="mt-2 flex flex-wrap items-center gap-2"><Button variant="outline" disabled={!offset} onClick={() => select(nodePath(rows[offset - PAGE_SIZE].node))}>Previous moves</Button><span className="text-xs">{offset + 1}–{Math.min(rows.length, offset + PAGE_SIZE)} of {rows.length}</span><Button variant="outline" disabled={offset + PAGE_SIZE >= rows.length} onClick={() => select(nodePath(rows[offset + PAGE_SIZE].node))}>More moves</Button></nav>}
  </>;
}
