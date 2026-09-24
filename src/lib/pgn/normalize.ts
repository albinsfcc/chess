import { Chess, DEFAULT_POSITION } from "chess.js";
import type { ParseTree } from "@mliebelt/pgn-parser";
import { documentSchema, resultSchema, type GameDocument, type GameNode, type GameTree } from "./domain";
import { hashGame } from "./hash";
import { PGN_LIMITS } from "./limits";

type ParsedMove = ParseTree["moves"][number];

function tagValue(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(tagValue).join(":");
  if (value && typeof value === "object" && "value" in value) return tagValue(value.value);
  return "";
}
function annotations(value: unknown): Record<string, string | string[]> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value).filter(([, item]) => typeof item === "string" || (Array.isArray(item) && item.every((part) => typeof part === "string"))));
}
function text(value: string | undefined): string[] { return value?.trim() ? [value.trim()] : []; }
function rating(value: string | undefined): number | null { return value && /^\d+$/.test(value) ? Number(value) : null; }
function playedAt(headers: Record<string, string>): string | null {
  const value = [headers.UTCDate, headers.Date].find((date) => date && !/^\?{4}\.\?{2}\.\?{2}$/.test(date));
  return value ? value.replaceAll(".", "-") : null;
}

export async function normalizeGame(rawPgn: string, parsed: ParseTree): Promise<GameDocument> {
  const headers = Object.fromEntries(Object.entries(parsed.tags ?? {}).filter(([key]) => key !== "messages").map(([key, value]) => [key, tagValue(value)]));
  const variantTag = headers.Variant?.trim() || "Standard";
  const playable = ["standard", "chess", "normal"].includes(variantTag.toLowerCase());
  const variant = playable ? "Standard" : variantTag;
  if (playable && headers.SetUp === "1" && !headers.FEN) throw new Error('SetUp "1" requires a FEN header.');
  if (playable && headers.FEN && headers.SetUp === "0") throw new Error('FEN conflicts with SetUp "0". Use SetUp "1" for a custom position.');
  let initialFen = headers.FEN || DEFAULT_POSITION;
  if (playable) {
    try { initialFen = new Chess(initialFen).fen(); }
    catch (error) { throw new Error(`Invalid starting FEN: ${error instanceof Error ? error.message : "invalid position"}`); }
  }
  if ((parsed.messages ?? []).some((message) => message.key === "Result")) throw new Error("The Result header does not match the movetext result.");
  const result = resultSchema.parse(headers.Result && headers.Result !== "-" ? headers.Result : "*");
  let nodeCount = 0;
  function line(moves: ParsedMove[], fen: string, prefix: number[], ply: number): GameNode[] {
    if (prefix.length > PGN_LIMITS.variationDepth * 2) throw new Error("Variation nesting exceeds 32 levels. Split this study into smaller games.");
    const board = playable ? new Chess(fen) : null;
    return moves.map((entry, index) => {
      if (++nodeCount > 20_000) throw new Error("This game exceeds 20,000 moves including variations.");
      const path = [...prefix, index];
      const beforeFen = board?.fen() ?? fen;
      const moveNumber = board ? Number(beforeFen.split(" ")[5]) : entry.moveNumber || Math.floor((ply + index) / 2) + 1;
      const turn = board?.turn() ?? entry.turn ?? "w";
      let san = entry.notation.notation;
      let uci: string | undefined;
      if (board) {
        try {
          const move = board.move(san, { strict: true });
          san = move.san;
          uci = `${move.from}${move.to}${move.promotion ?? ""}`;
        } catch {
          throw new Error(`Illegal move "${san}" at ply ${ply + index + 1} (${moveNumber}${turn === "w" ? "." : "..."}), ${prefix.length ? `variation ${prefix.join(".")}` : "main line"}.`);
        }
      }
      return {
        id: path.join("."), san, ...(uci ? { uci } : {}), ply: ply + index + 1, moveNumber, turn,
        commentsBefore: text(entry.commentMove), commentsAfter: text(entry.commentAfter ?? entry.commentDiag?.comment),
        annotations: annotations(entry.commentDiag), nags: entry.nag ?? [],
        // A RAV replaces the annotated move: reconstruct from BEFORE that move.
        variations: (entry.variations ?? []).map((variation, branch) => line(variation, beforeFen, [...path, branch], ply + index)),
      };
    });
  }
  const tree: GameTree = {
    initialFen, result, playable, comments: text(parsed.gameComment?.comment),
    annotations: annotations(parsed.gameComment), mainLine: line(parsed.moves, initialFen, [], 0),
  };
  const fields = {
    site: headers.Site || "?", playedAt: playedAt(headers), white: headers.White || "Unknown White",
    black: headers.Black || "Unknown Black", result: tree.result, variant, initialFen,
  };
  const normalizedPgnHash = await hashGame(fields, tree);
  return documentSchema.parse({ game: {
    ...fields, id: crypto.randomUUID(), source: "pgn", rawPgn, normalizedPgnHash,
    event: headers.Event || "?", round: headers.Round || "?", whiteRating: rating(headers.WhiteElo),
    blackRating: rating(headers.BlackElo), timeControl: headers.TimeControl || "?", headers,
    importedAt: new Date().toISOString(), analysisStatus: playable ? "not-analyzed" : "unsupported",
  }, tree });
}
