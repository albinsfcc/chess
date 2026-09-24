import type { GameNode } from "./domain";
export function flattenMoves(nodes: GameNode[]): { node: GameNode; depth: number }[] {
  const result: { node: GameNode; depth: number }[] = [];
  function visit(line: GameNode[], depth: number) { for (const node of line) { result.push({ node, depth }); for (const branch of node.variations) visit(branch, depth + 1); } }
  visit(nodes, 0); return result;
}
