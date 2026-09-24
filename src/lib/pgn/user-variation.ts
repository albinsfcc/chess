import { Chess } from "chess.js";
import type { GameTree, NodePath, GameNode } from "./domain";
import { reconstructPosition, selectedLine, USER_BRANCH } from "./position";
import type { GameMove } from "@/lib/game";

/** Add only locally authored lines. The imported main line and RAVs are immutable. */
export function addUserMove(tree: GameTree, root: NodePath, move: GameMove): { tree: GameTree; path: NodePath } {
  const position = reconstructPosition(tree, root);
  const { line } = selectedLine(tree, root);
  const nextIndex = root.length ? root.at(-1)! + 1 : 0;
  const uci = `${move.from}${move.to}${move.promotion ?? ""}`;
  if (line[nextIndex]?.uci === uci) return { tree, path: line[nextIndex].id.split(".").map(Number) };
  const sibling = line[nextIndex]?.variations.find((nodes) => nodes[0]?.uci === uci);
  if (sibling) return { tree, path: sibling[0].id.split(".").map(Number) };
  const branches = tree.userBranches ?? [];
  const existing = branches.findIndex((branch) => branch.root.join(".") === root.join(".") && branch.moves[0]?.uci === uci);
  if (existing >= 0) return { tree, path: [USER_BRANCH, existing, 0] };
  if (branches.reduce((sum, branch) => sum + branch.moves.length, 0) >= 20000) throw new Error("This game has reached its limit of 20,000 local variation moves.");
  const chess = new Chess(position.fen), turn = chess.turn(), moveNumber = Number(position.fen.split(" ")[5]);
  const legal = chess.move(move);
  const extending = root[0] === USER_BRANCH && nextIndex === line.length;
  if (!extending && branches.length >= 500) throw new Error("This game has reached its limit of 500 local variations.");
  const branchIndex = extending ? root[1] : branches.length;
  const index = extending ? nextIndex : 0;
  if (index >= 10000) throw new Error("This local variation has reached its limit of 10,000 moves.");
  const path = [USER_BRANCH, branchIndex, index];
  const node: GameNode = { id: path.join("."), san: legal.san, uci, ply: position.currentPly + 1, moveNumber, turn,
    commentsBefore: [], commentsAfter: [], annotations: {}, nags: [], variations: [] };
  const updated = [...branches];
  if (extending) updated[branchIndex] = { ...branches[branchIndex], moves: [...line, node] };
  else updated.push({ root: [...root], moves: [node] });
  const result = { ...tree, userBranches: updated };
  reconstructPosition(result, path); // validates the full path, including nested anchors
  return { tree: result, path };
}
export function mainLineReturn(tree: GameTree, path: NodePath): NodePath {
  let root = path;
  const seen = new Set<number>();
  while (root[0] === USER_BRANCH) {
    if (seen.has(root[1])) return [];
    seen.add(root[1]); root = tree.userBranches?.[root[1]]?.root ?? [];
  }
  if (root.length > 1) {
    const ply = reconstructPosition(tree, root).currentPly;
    return ply && tree.mainLine.length ? [Math.min(ply, tree.mainLine.length) - 1] : [];
  }
  return root;
}

/** Validate local additions independently of the immutable imported PGN tree. */
export function validateUserBranches(tree: GameTree): void {
  let count = 0;
  for (const [index, branch] of (tree.userBranches ?? []).entries()) {
    if (!branch.moves.length || (branch.root[0] === USER_BRANCH && branch.root[1] >= index)) throw new Error("Invalid local variation anchor.");
    const start = reconstructPosition(tree, branch.root);
    const chess = new Chess(start.fen);
    for (const [ply, node] of branch.moves.entries()) {
      if (++count > 20000) throw new Error("Too many local variation moves.");
      const turn = chess.turn(), number = Number(chess.fen().split(" ")[5]);
      const legal = chess.move(node.san, { strict: true });
      if (node.id !== [USER_BRANCH, index, ply].join(".") || node.ply !== start.currentPly + ply + 1 || node.turn !== turn || node.moveNumber !== number || node.uci !== `${legal.from}${legal.to}${legal.promotion ?? ""}` || node.variations.length) throw new Error("Invalid local variation move.");
    }
  }
}
