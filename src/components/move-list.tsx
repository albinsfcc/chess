"use client";
import { useMemo } from "react";
import { Button } from "./ui/button";
import { useWorkspace } from "@/store/workspace";
import { nodePath } from "@/lib/pgn/position";
import { pairedMoveRows } from "@/lib/pgn/move-list";
import type { GameNode } from "@/lib/pgn/domain";
import { useGameAnalysis } from "@/store/game-analysis";
import { assessmentMap } from "@/lib/game-analysis/move-quality";
import { MoveStrengthIcon } from "./move-strength-icon";
import { useOpenings } from "@/store/openings";
import { openingBookMoves, type OpeningEntry } from "@/lib/openings";
const PAGE_SIZE = 50;
export function MoveList({ nodes, variation = false }: { nodes: GameNode[]; variation?: boolean }) {
  const records = useGameAnalysis((state) => state.positions);
  const openings = useOpenings((state) => state.index);
  const game = useWorkspace((state) => state.game), paths = useWorkspace((state) => state.navigationPaths);
  const gameId = useWorkspace((state) => state.imported?.game.id);
  const analysisGameId = useGameAnalysis((state) => state.selected?.gameId);
  const rows = useMemo(() => pairedMoveRows(nodes), [nodes]);
  const selected = useWorkspace((state) => state.selectedPath.join(".")), select = useWorkspace((state) => state.selectNode);
  const active = rows.findIndex((row) => row.nodes.some((node) => node.id === selected)), offset = Math.floor(Math.max(0, active) / PAGE_SIZE) * PAGE_SIZE;
  const visiblePaths = useMemo(() => new Set(rows.slice(offset, offset + PAGE_SIZE).flatMap((row) => row.nodes.map((node) => node.id))), [rows, offset]);
  const bookMoves = useMemo(() => openings ? openingBookMoves(game.initialFen, game.moves, openings) : new Map<number, OpeningEntry>(), [game.initialFen, game.moves, openings]);
  const assessments = useMemo(() => {
    const result = assessmentMap(records, gameId, visiblePaths);
    for (const [ply, entry] of bookMoves) {
      const path = paths[ply]?.join(".");
      if (path && visiblePaths.has(path) && !result.has(path)) result.set(path, { label: "Book", reason: `Listed opening continuation: ${entry.name}.` });
    }
    return result;
  }, [records, gameId, visiblePaths, bookMoves, paths]);
  return <>
    {rows.slice(offset, offset + PAGE_SIZE).map((group) => <div key={group.nodes[0].id} style={{ marginLeft: Math.min(group.depth, 3) * 6 }} className={`grid grid-cols-[2rem_minmax(0,1fr)_minmax(0,1fr)] items-start gap-1 py-1 ${group.depth ? "border-l-2 border-primary/30 pl-1" : ""}`} aria-label={group.depth ? `Variation level ${group.depth}` : "Main line"}>
      <span className="pt-2 font-mono text-xs text-muted-foreground">{group.moveNumber}.</span>
      {(["w", "b"] as const).map((side) => { const node = group.nodes.find((entry) => entry.turn === side); return node ? <Button key={node.id} variant="ghost" size="sm" aria-current={selected === node.id ? "step" : undefined} aria-label={`${group.depth || variation ? "Variation" : "Main line"} ${node.moveNumber}${node.turn === "w" ? "." : "..."} ${node.san}`}
        aria-description={assessments.get(node.id) ? `${assessments.get(node.id)!.label}: ${assessments.get(node.id)!.reason}` : gameId && analysisGameId === gameId ? "Pending: analyze both adjacent positions or Resume the queue." : undefined}
        className={`my-0.5 h-auto min-h-9 min-w-0 flex-wrap justify-start gap-1 whitespace-normal px-1 font-mono ${selected === node.id ? "bg-primary/15 text-primary" : ""}`} onClick={() => select(nodePath(node))}>
        {node.san} {node.nags.join(" ")}{(node.commentsAfter.length > 0 || node.commentsBefore.length > 0) && <span aria-label="Has comment" className="text-primary">·</span>}
        {assessments.get(node.id) ? <span className="inline-flex items-center gap-1 font-sans text-xs" title={assessments.get(node.id)!.reason}><MoveStrengthIcon label={assessments.get(node.id)!.label} />{assessments.get(node.id)!.label}{assessments.get(node.id)!.provisional && " (provisional)"}</span>
          : gameId && analysisGameId === gameId && <span className="font-sans text-[10px] text-muted-foreground" title="Both adjacent positions need completed analysis. Resume or analyze the complete line.">Pending</span>}
      </Button> : <span key={side} />; })}
    </div>)}
    {rows.length > PAGE_SIZE && <nav aria-label="Move list pages" className="mt-2 flex flex-wrap items-center gap-2"><Button variant="outline" disabled={!offset} onClick={() => select(nodePath(rows[offset - PAGE_SIZE].nodes[0]))}>Previous moves</Button><span className="text-xs">{offset + 1}–{Math.min(rows.length, offset + PAGE_SIZE)} of {rows.length}</span><Button variant="outline" disabled={offset + PAGE_SIZE >= rows.length} onClick={() => select(nodePath(rows[offset + PAGE_SIZE].nodes[0]))}>More moves</Button></nav>}
  </>;
}
