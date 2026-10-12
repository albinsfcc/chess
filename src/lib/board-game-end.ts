import type { Chess, Color, Square } from "chess.js";
import type { GameDocument, NodePath } from "./pgn/domain";

export type GameEndKind = "winner" | "resignation" | "checkmate" | "timeout" | "loss" | "draw";
export type GameEndBadge = { square: Square; side: Color; kind: GameEndKind; description: string };
export type RecordedEnding = { result: string | null; termination?: string | null };

export function recordedEnding(document: GameDocument, path: NodePath): RecordedEnding | undefined {
  const length = document.tree.mainLine.length;
  const atEnd = length === 0 ? path.length === 0 : path.length === 1 && path[0] === length - 1;
  return atEnd ? { result: document.game.result, termination: document.game.headers.Termination } : undefined;
}

export function gameEndBadges(chess: Chess, recorded?: RecordedEnding, allowPositionDraw = true): GameEndBadge[] {
  const mate = chess.isCheckmate();
  const drawReason = chess.isStalemate() ? "stalemate"
    : chess.isInsufficientMaterial() ? "insufficient material"
    : chess.isThreefoldRepetition() ? "threefold repetition"
    : chess.isDrawByFiftyMoves() ? "fifty-move rule" : null;
  const result = mate ? (chess.turn() === "w" ? "0-1" : "1-0")
    : recorded?.result && recorded.result !== "*" ? recorded.result
    : allowPositionDraw && drawReason ? "1/2-1/2" : null;
  if (!result || !["1-0", "0-1", "1/2-1/2"].includes(result)) return [];
  const termination = recorded?.termination?.toLowerCase() ?? "";
  const loss: GameEndKind = mate ? "checkmate" : /resign/.test(termination) ? "resignation"
    : /time|flag/.test(termination) ? "timeout" : "loss";
  const reason = result === "1/2-1/2" ? drawReason ?? (/agreement/.test(termination) ? "agreement" : null)
    : loss === "loss" ? null : loss;
  return chess.board().flatMap(rank => rank.flatMap(piece => {
    if (piece?.type !== "k") return [];
    const kind = result === "1/2-1/2" ? "draw" : piece.color === (result === "1-0" ? "w" : "b") ? "winner" : loss;
    const outcome = kind === "draw" ? "Draw" : kind === "winner" ? "wins" : "loses";
    return [{ square: piece.square, side: piece.color, kind,
      description: `${piece.color === "w" ? "White" : "Black"}: ${outcome}${reason ? ` by ${reason}` : ""}` }];
  }));
}
