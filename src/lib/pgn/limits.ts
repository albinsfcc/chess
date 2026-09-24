export const PGN_LIMITS = { pasteBytes: 5_000_000, games: 100, gameBytes: 500_000, variationDepth: 32, moves: 20_000, tags: 100, tagValue: 2048 } as const;
export class PgnLimitError extends Error {}
export const byteLength = (text: string) => new TextEncoder().encode(text).byteLength;

/** Linear preflight before the recursive third-party parser sees untrusted input. */
export function inspectPgn(raw: string): number {
  if (raw.length > PGN_LIMITS.gameBytes || byteLength(raw) > PGN_LIMITS.gameBytes) throw new PgnLimitError("A game exceeds 500 KB. Split it into smaller games.");
  let depth = 0, moves = 0, tags = 0;
  const names = new Set<string>();
  for (let i = 0; i < raw.length;) {
    const char = raw[i];
    if (/\s/.test(char)) { i++; continue; }
    if (char === ";" || (char === "%" && (i === 0 || raw[i - 1] === "\n"))) { const end = raw.indexOf("\n", i); i = end < 0 ? raw.length : end + 1; continue; }
    if (char === "{") { const end = raw.indexOf("}", i); if (end < 0) throw new Error("Unclosed PGN comment."); i = end + 1; continue; }
    if (char === "[") {
      let end = i + 1, quoted = false;
      for (; end < raw.length; end++) { if (raw[end] === "\\" && quoted) { end++; continue; } if (raw[end] === '"') quoted = !quoted; if (raw[end] === "]" && !quoted) break; }
      const tag = /^\[([A-Za-z][A-Za-z0-9_]{0,63})\s+"((?:\\.|[^"\\])*)"\s*\]$/.exec(raw.slice(i, end + 1));
      if (!tag || /^(?:__proto__|prototype|constructor)$/i.test(tag[1])) throw new Error("Malformed or unsafe PGN tag. Use a tag name and a quoted value.");
      if (++tags > PGN_LIMITS.tags || tag[2].length > PGN_LIMITS.tagValue) throw new PgnLimitError("PGN tag count or value length exceeds the supported limit.");
      if (names.has(tag[1])) throw new Error(`Duplicate PGN tag: ${tag[1]}.`);
      names.add(tag[1]);
      if (tag[1] === "SetUp" && !/^[01]$/.test(tag[2])) throw new Error('SetUp must be "0" or "1".');
      i = end + 1; continue;
    }
    if (char === "(") { if (++depth > PGN_LIMITS.variationDepth) throw new PgnLimitError("Variation nesting exceeds 32 levels."); i++; continue; }
    if (char === ")") { if (--depth < 0) throw new Error("Unmatched variation closing parenthesis."); i++; continue; }
    let end = i + 1; while (end < raw.length && !/[\s()[\]{};]/.test(raw[end])) end++;
    const token = raw.slice(i, end).replace(/^\d+\.+/, "");
    if (token && !/^(?:\.+|\$\d+|[!?]+|1-0|0-1|1\/2-1\/2|\*)$/.test(token) && ++moves > PGN_LIMITS.moves) throw new PgnLimitError("PGN exceeds 20,000 moves including variations.");
    i = end;
  }
  if (depth) throw new Error("Unclosed PGN variation.");
  return moves;
}
