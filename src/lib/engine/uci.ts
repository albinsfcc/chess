import type { EngineScore, UciOption } from "./domain";

export type UciInfo = {
  type: "info"; multiPv: number; depth: number; selectiveDepth?: number; nodes?: number; nodesPerSecond?: number; timeMs?: number;
  score: EngineScore; lowerBound: boolean; upperBound: boolean; pvUci: string[];
};
export type UciEvent = { type: "option"; option: UciOption } | { type: "uciok" } | { type: "readyok" } | { type: "name"; name: string }
  | { type: "bestmove"; move: string | null; ponder?: string } | UciInfo;
export const uciMove = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

// Only called inside the dedicated worker (and tests), never on React's thread.
export function parseUci(line: string): UciEvent | null {
  const text = line.trim();
  const option = /^option name (.+?) type (\w+)(.*)$/.exec(text);
  if (option) {
    const min = /\bmin (-?\d+)/.exec(option[3]), max = /\bmax (-?\d+)/.exec(option[3]);
    return { type: "option", option: { name: option[1], type: option[2], ...(min ? { min: Number(min[1]) } : {}), ...(max ? { max: Number(max[1]) } : {}) } };
  }
  if (text === "uciok" || text === "readyok") return { type: text };
  if (text.startsWith("id name ")) return { type: "name", name: text.slice(8) };
  const words = text.split(/\s+/);
  if (words[0] === "bestmove") {
    const move = words[1];
    if (!move || (!uciMove.test(move) && move !== "(none)" && move !== "0000")) return null;
    return { type: "bestmove", move: uciMove.test(move) ? move : null, ...(words[2] === "ponder" && uciMove.test(words[3] ?? "") ? { ponder: words[3] } : {}) };
  }
  if (words[0] !== "info" || words[1] === "string") return null;
  const pvIndex = words.indexOf("pv");
  const fields = pvIndex < 0 ? words : words.slice(0, pvIndex);
  function integer(key: string): number | undefined {
    const index = fields.indexOf(key); if (index < 0 || !/^-?\d+$/.test(fields[index + 1] ?? "")) return;
    const value = Number(fields[index + 1]); return Number.isSafeInteger(value) ? value : undefined;
  }
  const depth = integer("depth"), scoreIndex = fields.indexOf("score");
  const scoreType = fields[scoreIndex + 1];
  const value = scoreIndex >= 0 ? integer(scoreType) : undefined;
  if (depth === undefined || depth < 0 || value === undefined || !["cp", "mate"].includes(scoreType)) return null;
  const multiPv = integer("multipv") ?? 1; if (multiPv < 1 || multiPv > 5) return null;
  const nonnegative = (key: string) => { const n = integer(key); return n !== undefined && n >= 0 ? n : undefined; };
  return { type: "info", depth, multiPv, selectiveDepth: nonnegative("seldepth"), nodes: nonnegative("nodes"), nodesPerSecond: nonnegative("nps"), timeMs: nonnegative("time"),
    score: scoreType === "cp" ? { type: "cp", value } : { type: "mate", moves: value },
    lowerBound: fields.includes("lowerbound"), upperBound: fields.includes("upperbound"), pvUci: pvIndex < 0 ? [] : words.slice(pvIndex + 1),
  };
}
