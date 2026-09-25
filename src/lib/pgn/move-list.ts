import type { GameNode } from "./domain";
export function flattenMoves(nodes: GameNode[]): { node: GameNode; depth: number }[] {
  const result: { node: GameNode; depth: number }[] = [];
  function visit(line: GameNode[], depth: number) { for (const node of line) { result.push({ node, depth }); for (const branch of node.variations) visit(branch, depth + 1); } }
  visit(nodes, 0); return result;
}
export type MoveRow = { depth: number; moveNumber: number; nodes: GameNode[] };
/** Pair White and Black within each line, then place its recursive variations below. */
export function pairedMoveRows(nodes: GameNode[]): MoveRow[] {
  const rows: MoveRow[] = [];
  function visit(line: GameNode[], depth: number) {
    for (let i = 0; i < line.length; i++) {
      const first = line[i], pair = [first], next = line[i + 1];
      if (first.turn === "w" && next?.turn === "b" && next.moveNumber === first.moveNumber) { pair.push(next); i++; }
      rows.push({depth, moveNumber: first.moveNumber, nodes: pair});
      for (const node of pair) for (const branch of node.variations) visit(branch, depth + 1);
    }
  }
  visit(nodes, 0); return rows;
}
