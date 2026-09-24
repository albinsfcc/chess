import { Chess } from "chess.js";
import type { GameNode, GameTree, NodePath } from "@/lib/pgn/domain";
import { nodePath } from "@/lib/pgn/position";
import { validatePosition } from "@/lib/engine/normalize";
import type { GameAnalysis, GameAnalysisConfig, PlannedPosition, PositionAnalysis } from "./domain";

export function selectedBranch(path: NodePath): GameAnalysis["selectedTreePath"] { return path.length > 1 ? path.slice(0, -1) : "main"; }
/** Includes the shared prefix needed to reach a branch, never its sibling RAVs. */
export function generatePositions(tree: GameTree, branch: GameAnalysis["selectedTreePath"]): PlannedPosition[] {
  if (!tree.playable) throw new Error("Unsupported variant: only standard chess can be analyzed.");
  let line = tree.mainLine; const prefix: GameNode[] = [];
  if (branch !== "main") {
    if (!branch.length || branch.length % 2 !== 0) throw new Error("Invalid selected variation path.");
    for (let index = 0; index < branch.length; index += 2) {
      const moveIndex = branch[index], variationIndex = branch[index + 1];
      const next = line[moveIndex]?.variations[variationIndex];
      if (!next) throw new Error(`Variation ${branch.join(".")} no longer exists.`);
      prefix.push(...line.slice(0, moveIndex)); line = next;
    }
  }
  const nodes = [...prefix, ...line]; let chess: Chess;
  try { chess = validatePosition(tree.initialFen); } catch { throw new Error("Invalid starting position (ply 0). Check the PGN FEN."); }
  const positions: PlannedPosition[] = [];
  let previous: NodePath = [];
  for (const [index, node] of nodes.entries()) {
    const fen = chess.fen(), mover = chess.turn();
    try {
      const move = chess.move(node.san, { strict: true });
      validatePosition(chess.fen());
      positions.push({ ply: index, treePath: previous, movePath: nodePath(node), fen, mover,
        playedMoveUci: `${move.from}${move.to}${move.promotion ?? ""}`, playedMoveSan: move.san,
        label: index ? `After ${nodes[index - 1].moveNumber}${nodes[index - 1].turn === "w" ? "." : "..."} ${nodes[index - 1].san}` : "Starting position" });
    } catch { throw new Error(`Cannot reconstruct ply ${index + 1}: ${node.moveNumber}${mover === "w" ? "." : "..."} ${node.san} (tree path ${node.id}). No positions were skipped.`); }
    previous = nodePath(node);
  }
  const last = nodes.at(-1);
  positions.push({ ply: nodes.length, treePath: previous, movePath: null, fen: chess.fen(), mover: chess.turn(), playedMoveUci: null, playedMoveSan: null,
    label: last ? `After ${last.moveNumber}${last.turn === "w" ? "." : "..."} ${last.san}` : "Starting position" });
  return positions;
}
export function positionRange(positions: PlannedPosition[], config: GameAnalysisConfig) {
  if (config.startPly < 0 || config.endPly >= positions.length || config.startPly > config.endPly || !Number.isInteger(config.startPly) || !Number.isInteger(config.endPly)) throw new Error(`Choose plies between 0 and ${positions.length - 1}.`);
  return positions.slice(config.startPly, config.endPly + 1);
}
export function validateAssociations(session: GameAnalysis, plan: PlannedPosition[], records: PositionAnalysis[]) {
  for (const row of records) {
    const position = plan.find((item) => item.ply === row.ply);
    if (!position || row.id !== `${session.id}:${row.ply}` || row.analysisId !== session.id || row.gameId !== session.gameId || position.fen !== row.fen || row.result.fen !== row.fen ||
      JSON.stringify(position.treePath) !== JSON.stringify(row.treePath) || JSON.stringify(position.movePath) !== JSON.stringify(row.movePath) || position.playedMoveUci !== row.playedMoveUci ||
      row.configurationHash !== session.configurationHash || row.result.engineVersion !== session.engineVersion || row.result.config.preset !== session.configuration.preset || row.result.config.multiPv !== session.configuration.multiPv) {
      throw new Error("Saved position associations are corrupt or incompatible. Start a new session to reuse intact cache entries.");
    }
  }
}
