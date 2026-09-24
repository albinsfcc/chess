import { parseGame, type ParseTree } from "@mliebelt/pgn-parser";
import { z } from "zod";
import type { ImportIssue } from "./domain";
import { PGN_LIMITS, PgnLimitError, byteLength, inspectPgn } from "./limits";

type Entry = { rawPgn: string; startLine: number };

// This scanner finds game boundaries only. All PGN grammar, annotations and RAVs
// are parsed by pgn-parser. Results inside comments, tags or RAVs are not boundaries.
export function splitEntries(input: string): Entry[] {
  const entries: Entry[] = [];
  let start = 0;
  let brace = false;
  let semicolon = false;
  let tag = false;
  let quoted = false;
  let depth = 0;
  let movetext = false;
  let eventSeen = false;
  function finish(end: number) {
    const raw = input.slice(start, end);
    const leading = raw.length - raw.trimStart().length;
    if (raw.trim()) entries.push({ rawPgn: raw.trim(), startLine: input.slice(0, start + leading).split("\n").length });
    if (entries.length > PGN_LIMITS.games) throw new PgnLimitError("A paste supports at most 100 games. Split this collection into batches.");
    start = end;
    movetext = false;
    eventSeen = false;
  }
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (semicolon) { if (char === "\n") semicolon = false; continue; }
    if (brace) { if (char === "}") brace = false; continue; }
    if (tag) {
      if (char === "\\" && quoted) { i++; continue; }
      if (char === '"') quoted = !quoted;
      if (char === "]" && !quoted) tag = false;
      continue;
    }
    if (char === "{") { brace = true; continue; }
    if (char === ";" || (char === "%" && (i === 0 || input[i - 1] === "\n"))) { semicolon = true; continue; }
    if (char === "[") {
      const isEvent = /^\[Event\s/.test(input.slice(i));
      if (depth === 0 && (movetext || (isEvent && eventSeen))) finish(i);
      if (isEvent) eventSeen = true;
      tag = true;
      continue;
    }
    if (char === "(") { depth++; continue; }
    if (char === ")") { depth = Math.max(0, depth - 1); continue; }
    if (depth === 0 && (i === 0 || /\s/.test(input[i - 1]))) {
      const result = /^(?:1\/2-1\/2|1-0|0-1|\*)(?=\s|$|\[)/.exec(input.slice(i));
      if (result) { i += result[0].length - 1; finish(i + 1); continue; }
    }
    if (!/\s|\uFEFF/.test(char)) movetext = true;
  }
  finish(input.length);
  return entries;
}

const locationSchema = z.object({ location: z.object({ start: z.object({ line: z.number(), column: z.number() }) }) });

// pgn-parser expects NAGs before comments. Reorder only adjacent annotation
// tokens in the parser input; rawPgn remains untouched. Tags and comments are
// consumed as opaque tokens, so embedded '$1' text is never rewritten.
function normalizeAnnotationOrder(input: string): string {
  const tokens = input.match(/\[(?:"(?:\\.|[^"\\])*"|[^\]"])*\]|\{[^}]*\}|;[^\r\n]*|\$\d+|[!?]{1,2}|\s+|[^\s[{};$!?]+|./g) ?? [];
  let output = "";
  let group: string[] = [];
  function flush() {
    const nags = group.filter((token) => /^(?:\$\d+|[!?]{1,2})$/.test(token));
    const comments = group.filter((token) => token.startsWith("{") || token.startsWith(";"));
    if (nags.length && comments.length) output += ` ${nags.join(" ")} ${comments.map((comment) => comment.startsWith(";") ? `${comment}\n` : comment).join(" ")} `;
    else output += group.join("");
    group = [];
  }
  for (const token of tokens) {
    if (/^(?:\s+|\$\d+|[!?]{1,2})$/.test(token) || token.startsWith("{") || token.startsWith(";")) group.push(token);
    else { flush(); output += token; }
  }
  flush();
  return output;
}

function parseWithAnnotations(raw: string): ParseTree {
  try { return parseGame(raw); }
  catch (originalError) {
    const compatible = normalizeAnnotationOrder(raw);
    if (compatible !== raw) {
      try { return parseGame(compatible); }
      catch { /* Keep the original parser error and its precise source location. */ }
    }
    throw originalError;
  }
}
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "An unexpected error occurred.";
}

export function parsePgnEntries(input: string): {
  entries: { entryIndex: number; rawPgn: string; parsed: ParseTree; startLine: number }[];
  errors: ImportIssue[];
} {
  const entries: ReturnType<typeof parsePgnEntries>["entries"] = [];
  const errors: ImportIssue[] = [];
  if (!input.trim()) return { entries, errors: [{ entryIndex: 1, rawPgn: input, message: "Paste at least one PGN game before validating." }] };
  if (input.length > PGN_LIMITS.pasteBytes || byteLength(input) > PGN_LIMITS.pasteBytes) return { entries, errors: [{ entryIndex: 1, rawPgn: "", message: "This input exceeds 5 MB. Split it into smaller batches." }] };
  let index = 0;
  let totalMoves = 0;
  function parseEntry(entry: Entry, recover = true) {
    try {
      if (index >= PGN_LIMITS.games) throw new PgnLimitError("A paste supports at most 100 games.");
      totalMoves += inspectPgn(entry.rawPgn);
      if (totalMoves > PGN_LIMITS.moves) throw new PgnLimitError("This paste exceeds 20,000 total moves including variations.");
      const parsed = parseWithAnnotations(entry.rawPgn);
      entries.push({ ...entry, parsed, entryIndex: ++index });
    } catch (error) {
      // Recover a following headered game after malformed syntax (e.g. an unclosed
      // brace). Only attempt this after parsing fails; valid comments stay intact.
      const boundaries = recover && !(error instanceof PgnLimitError) ? [...entry.rawPgn.matchAll(/^\s*\[Event\s+"/gm)].map((match) => match.index).slice(0, PGN_LIMITS.games) : [];
      const cuts = boundaries.filter((offset) => entry.rawPgn.slice(0, offset).trim().length > 0);
      if (cuts.length) {
        const offsets = [0, ...cuts, entry.rawPgn.length];
        for (let n = 0; n < offsets.length - 1; n++) {
          parseEntry({ rawPgn: entry.rawPgn.slice(offsets[n], offsets[n + 1]), startLine: entry.startLine + entry.rawPgn.slice(0, offsets[n]).split("\n").length - 1 }, false);
        }
        return;
      }
      const location = locationSchema.safeParse(error);
      errors.push({ entryIndex: ++index, rawPgn: entry.rawPgn, message: errorMessage(error),
        ...(location.success ? { line: entry.startLine + location.data.location.start.line - 1, column: location.data.location.start.column } : {}) });
    }
  }
  try { for (const entry of splitEntries(input)) parseEntry(entry); }
  catch (error) { return { entries: [], errors: [{ entryIndex: 1, rawPgn: "", message: errorMessage(error) }] }; }
  return { entries, errors };
}
