"use client";
import { Fragment, memo, useMemo } from "react";
import { Button } from "./ui/button";
import { useWorkspace } from "@/store/workspace";
import { nodePath, USER_BRANCH } from "@/lib/pgn/position";
import { pairedMoveRows } from "@/lib/pgn/move-list";
import type { GameNode, NodePath } from "@/lib/pgn/domain";
import { useGameAnalysis } from "@/store/game-analysis";
import { assessmentMap, type MoveAssessment } from "@/lib/game-analysis/move-quality";
import { MoveStrengthIcon } from "./move-strength-icon";
import { useAnalysis } from "@/store/analysis";
import { useOpenings } from "@/store/openings";
import { openingBookMoves, type OpeningEntry } from "@/lib/openings";
export function MoveList({ nodes, variation = false }: { nodes: GameNode[]; variation?: boolean }) {
  const records = useGameAnalysis((state) => state.positions);
  const liveAssessments = useAnalysis((state) => state.reviewAssessments);
  const openings = useOpenings((state) => state.index);
  const game = useWorkspace((state) => state.game), paths = useWorkspace((state) => state.navigationPaths);
  const gameId = useWorkspace((state) => state.imported?.game.id);
  const branches = useWorkspace((state) => state.imported?.tree.userBranches);
  const analysisGameId = useGameAnalysis((state) => state.selected?.gameId);
  const anchors = useMemo(() => new Set(branches?.map(branch => branch.root.join("."))), [branches]);
  const rows = useMemo(() => pairedMoveRows(nodes, anchors), [nodes, anchors]);
  const selected = useWorkspace((state) => state.selectedPath.join(".")), select = useWorkspace((state) => state.selectNode);
  // Expand the active branch and its ancestors.
  const activePaths = new Set([selected]);
  let ancestor = selected.split(".").map(Number);
  while (ancestor[0] === USER_BRANCH) {
    const root = branches?.[ancestor[1]]?.root;
    if (!root || activePaths.has(root.join("."))) break;
    activePaths.add(root.join(".")); ancestor = root;
  }
  const visiblePaths = useMemo(() => new Set(rows.flatMap(row => row.nodes.map(node => node.id))), [rows]);
  const bookMoves = useMemo(() => openings ? openingBookMoves(game.initialFen, game.moves, openings) : new Map<number, OpeningEntry>(), [game.initialFen, game.moves, openings]);
  const assessments = useMemo(() => {
    const result = assessmentMap(records, gameId, visiblePaths);
    for (const path of visiblePaths) {
      const live = liveAssessments[`${gameId}:${path}`];
      if (live) result.set(path, live);
    }
    for (const [ply, entry] of bookMoves) {
      const path = paths[ply]?.join(".");
      if (path && visiblePaths.has(path) && !result.has(path)) result.set(path, { label: "Book", reason: `Listed opening continuation: ${entry.name}.` });
    }
    return result;
  }, [records, gameId, visiblePaths, bookMoves, paths, liveAssessments]);
  function localVariations(anchor: string) {
    return branches?.map((branch, index) => branch.root.join(".") === anchor ? <details key={index} open={[...activePaths].some(path => path.startsWith(`${USER_BRANCH}.${index}.`))} className="move-local-variation">
      <summary>Local variation {index + 1} from {branch.root.length ? `ply ${branch.moves[0].ply - 1}` : "start"}</summary>
      <MoveList nodes={branch.moves} variation />
    </details> : null);
  }
  return <div className="move-table" data-variation={variation}>
    {!variation && <div className="move-table-heading"><span>#</span><span><i data-side="w" />White move</span><span><i data-side="b" />Black move</span></div>}
    {!variation && localVariations("")}
    {rows.map((group) => <Fragment key={group.nodes[0].id}><div style={{ marginLeft: Math.min(group.depth, 3) * 6 }} className="move-table-row" data-active={group.nodes.some(node => node.id === selected)} data-depth={group.depth} aria-label={group.depth ? `Variation level ${group.depth}` : variation ? "Local variation" : "Main line"}>
      <span className="move-number">{group.moveNumber}.</span>
      {(["w", "b"] as const).map((side) => { const node = group.nodes.find((entry) => entry.turn === side); return node ? <MoveCell key={node.id} node={node} selected={selected === node.id} variation={!!group.depth || variation} assessment={assessments.get(node.id)} pending={!!gameId && analysisGameId === gameId} select={select} /> : <span key={side} />; })}
    </div>{group.nodes.map(node => <Fragment key={node.id}>{localVariations(node.id)}</Fragment>)}</Fragment>)}
  </div>;
}

const MoveCell = memo(function MoveCell({ node, selected, variation, assessment, pending, select }: {
  node: GameNode; selected: boolean; variation: boolean; assessment?: MoveAssessment; pending: boolean; select: (path: NodePath) => void;
}) {
  return <Button variant="ghost" size="sm" aria-current={selected ? "step" : undefined}
    aria-label={`${variation ? "Variation" : "Main line"} ${node.moveNumber}${node.turn === "w" ? "." : "..."} ${node.san}`}
    aria-description={assessment ? `${assessment.label}: ${assessment.reason}` : pending ? "Pending: analyze both adjacent positions or Resume the queue." : undefined}
    className="move-cell" data-grade={assessment?.label} onClick={() => select(nodePath(node))}>
    <span className="move-san">{node.san} {node.nags.join(" ")}{(node.commentsAfter.length > 0 || node.commentsBefore.length > 0) && <span aria-label="Has comment" className="text-primary">?</span>}</span>
    {assessment ? <span className="move-grade" title={assessment.reason}><MoveStrengthIcon label={assessment.label} className="size-4 shrink-0" />{assessment.label}{assessment.provisional && " (provisional)"}</span>
      : pending && <span className="font-sans text-[10px] text-muted-foreground" title="Both adjacent positions need completed analysis. Resume or analyze the complete line.">Pending</span>}
  </Button>;
});
