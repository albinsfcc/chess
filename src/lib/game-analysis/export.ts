import type { GameDocument, GameNode } from "@/lib/pgn/domain";
import { formatScore } from "@/lib/engine/normalize";
import { branchLabel, type GameAnalysis, type PositionAnalysis } from "./domain";

function comment(text: string): string {
  // Semicolon comments can legally contain braces. Preserve their text safely.
  return /[{}]/.test(text) ? `\n${text.split(/\r?\n/).map((line) => `;${line}`).join("\n")}\n` : `{${text}}`;
}
function annotations(values: Record<string, string | string[]>): string {
  return Object.entries(values).filter(([key]) => key !== "comment").map(([key, value]) => comment(`[%${key} ${Array.isArray(value) ? value.join(",") : value}]`)).join(" ");
}
/** Generates a new document; never writes to or mutates the original raw PGN. */
export function annotatedPgn(document: GameDocument, session: GameAnalysis, positions: PositionAnalysis[]): string {
  if (session.gameId !== document.game.id) throw new Error("This analysis belongs to a different game.");
  const byPath = new Map(positions.map((row) => [row.treePath.join("."), row]));
  function engineComment(path: string) {
    const position = byPath.get(path); if (!position) return "";
    const line = position.result.lines.find((pv) => pv.multiPv === 1);
    if (!line) return comment("Engine search completed without a scored line.");
    const value = line.score.type === "cp" ? (line.score.value / 100).toFixed(2) : `#${line.score.moves}`;
    const bound = line.lowerBound ? "lower bound" : line.upperBound ? "upper bound" : "exact search score";
    return comment(`${!line.lowerBound && !line.upperBound ? `[%eval ${value},${line.depth}] ` : ""}White evaluation ${formatScore(line.score)} (${bound}); depth ${line.depth}; best move ${position.bestMoveSan ?? "none"}; best line: ${line.pvSan.join(" ") || "none"}.`);
  }
  function line(nodes: GameNode[]): string {
    return nodes.map((node) => [
      ...node.commentsBefore.map(comment), `${node.moveNumber}${node.turn === "w" ? "." : "..."}`, node.san, ...node.nags,
      ...node.commentsAfter.map(comment), annotations(node.annotations), engineComment(node.id),
      ...node.variations.map((variation) => `(${line(variation)})`),
    ].filter(Boolean).join(" ")).join(" ");
  }
  const escape = (text: string) => text.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  const headers = Object.entries(document.game.headers).map(([key, value]) => `[${key} "${escape(value)}"]`).join("\n");
  const provenance = comment(`Analysis: ${session.engineName} ${session.engineVersion}; ${branchLabel(session.selectedTreePath)}; ${session.configuration.preset}; MultiPV ${session.configuration.multiPv}; plies ${session.configuration.startPly}-${session.configuration.endPly}; ${positions.length}/${session.totalPositions} completed. Evaluations are White-relative. Configuration ${session.configurationHash}.`);
  return `${headers}\n\n${[...document.tree.comments.map(comment), annotations(document.tree.annotations), provenance, engineComment(""), line(document.tree.mainLine), document.tree.result].filter(Boolean).join(" ")}\n`;
}
