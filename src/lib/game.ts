import { Chess, DEFAULT_POSITION, type Square } from "chess.js";

export type PromotionPiece = "q" | "r" | "b" | "n";
export type GameMove = {
  from: Square;
  to: Square;
  san: string;
  promotion?: PromotionPiece;
};
export type GameState = {
  initialFen: string;
  moves: GameMove[];
  cursor: number;
};

// Navigation retains the immutable move array. Replay each prefix once, without
// exposing a shared mutable Chess instance to board/input callers.
const positionLines = new WeakMap<GameMove[], { initialFen: string; chess: Chess; fens: string[] }>();
export function positionFen(game: GameState): string {
  let line = positionLines.get(game.moves);
  if (!line || line.initialFen !== game.initialFen) {
    const chess = new Chess(game.initialFen);
    line = { initialFen: game.initialFen, chess, fens: [chess.fen()] };
    positionLines.set(game.moves, line);
  }
  const cursor = Math.max(0, Math.min(game.cursor, game.moves.length));
  while (line.fens.length <= cursor) {
    line.chess.move(game.moves[line.fens.length - 1]);
    line.fens.push(line.chess.fen());
  }
  return line.fens[cursor];
}
export type MoveResult =
  | { kind: "moved"; game: GameState }
  | { kind: "promotion"; from: Square; to: Square }
  | { kind: "illegal" };

export function createGame(initialFen = DEFAULT_POSITION): GameState {
  // Validate a custom starting position before it can enter workspace state.
  new Chess(initialFen);
  return { initialFen, moves: [], cursor: 0 };
}

export function chessAt(game: GameState): Chess {
  const chess = new Chess(game.initialFen);
  for (const move of game.moves.slice(0, game.cursor)) chess.move(move);
  return chess;
}

export function tryMove(
  game: GameState,
  from: string,
  to: string,
  promotion?: PromotionPiece,
  allowDrawContinuation = false,
): MoveResult {
  const chess = chessAt(game);
  if (!allowDrawContinuation && chess.isGameOver()) return { kind: "illegal" };
  const candidates = chess.moves({ verbose: true }).filter(
    (move) => move.from === from && move.to === to,
  );
  if (!candidates.length) return { kind: "illegal" };
  const candidate = candidates[0];
  if (candidate.promotion && !promotion) {
    return { kind: "promotion", from: candidate.from, to: candidate.to };
  }
  if (promotion && !candidates.some((move) => move.promotion === promotion)) {
    return { kind: "illegal" };
  }
  const move = chess.move({ from, to, ...(promotion ? { promotion } : {}) });
  return {
    kind: "moved",
    game: {
      ...game,
      moves: [
        ...game.moves.slice(0, game.cursor),
        { from: move.from, to: move.to, san: move.san, ...(promotion ? { promotion } : {}) },
      ],
      cursor: game.cursor + 1,
    },
  };
}

export function navigateTo(game: GameState, cursor: number): GameState {
  if (!Number.isFinite(cursor)) return game;
  return { ...game, cursor: Math.max(0, Math.min(game.moves.length, Math.trunc(cursor))) };
}

export function checkedKing(chess: Chess): Square | undefined {
  if (!chess.isCheck()) return undefined;
  return chess.board().flat().find((piece) => piece?.type === "k" && piece.color === chess.turn())?.square;
}

export function gameStatus(chess: Chess): string {
  const side = chess.turn() === "w" ? "White" : "Black";
  if (chess.isCheckmate()) return `Checkmate · ${chess.turn() === "w" ? "Black" : "White"} wins`;
  if (chess.isStalemate()) return "Draw · stalemate";
  if (chess.isThreefoldRepetition()) return "Draw · threefold repetition";
  if (chess.isInsufficientMaterial()) return "Draw · insufficient material";
  if (chess.isDrawByFiftyMoves()) return "Draw · fifty-move rule";
  return `${side} to move${chess.isCheck() ? " · check" : ""}`;
}
