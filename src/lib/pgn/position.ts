import { Chess } from "chess.js";
import type { GameState, PromotionPiece } from "@/lib/game";
import type { GameNode, GameTree, NodePath } from "./domain";

export type TreePosition = {
  fen: string;
  sanHistory: string[];
  uciHistory: string[];
  currentPly: number;
  path: NodePath;
  game: GameState;
  navigationPaths: NodePath[];
  node: GameNode | null;
};

export function nodePath(node: GameNode): NodePath { return node.id.split(".").map(Number); }

export function reconstructPosition(tree: GameTree, path: NodePath = []): TreePosition {
  if (!tree.playable) throw new Error("This variant cannot be opened on the standard chessboard.");
  if (path.length && (path.length % 2 !== 1 || path.some((index) => !Number.isInteger(index) || index < 0))) throw new Error("Invalid game-tree path.");
  let line = tree.mainLine;
  const prefix: GameNode[] = [];
  for (let i = 0; i < path.length - 1; i += 2) {
    const branch = line[path[i]]?.variations[path[i + 1]];
    if (!branch) throw new Error("Variation no longer exists.");
    prefix.push(...line.slice(0, path[i]));
    line = branch;
  }
  const index = path.length ? path[path.length - 1] : -1;
  if (index >= line.length) throw new Error("Move no longer exists.");
  const nodes = [...prefix, ...line];
  const cursor = path.length ? prefix.length + index + 1 : 0;
  const chess = new Chess(tree.initialFen);
  const game: GameState = { initialFen: tree.initialFen, moves: [], cursor };
  let fen = chess.fen();
  const sanHistory: string[] = [];
  const uciHistory: string[] = [];
  nodes.forEach((node, ply) => {
    const move = chess.move(node.san, { strict: true });
    game.moves.push({ from: move.from, to: move.to, san: move.san, ...(move.promotion ? { promotion: move.promotion as PromotionPiece } : {}) });
    if (ply < cursor) {
      fen = chess.fen();
      sanHistory.push(move.san);
      uciHistory.push(`${move.from}${move.to}${move.promotion ?? ""}`);
    }
  });
  return { fen, sanHistory, uciHistory, currentPly: cursor, path: [...path], game,
    navigationPaths: nodes.map(nodePath), node: cursor ? nodes[cursor - 1] : null };
}
