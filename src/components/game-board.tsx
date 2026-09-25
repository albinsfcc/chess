"use client";
import { topMoveArrows, THREAT_COLOR } from "@/lib/engine/arrows";
import { useThreats } from "@/store/threats";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Chessboard } from "react-chessboard";
import type { Square } from "chess.js";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { checkedKing, chessAt, type GameState, type PromotionPiece } from "@/lib/game";
import { coordinateColor } from "@/lib/preferences";
import { useWorkspace } from "@/store/workspace";
import { useAnalysis } from "@/store/analysis";
import { legalDestinations } from "@/lib/workspace-position";
import { usePositionAnalysis } from "./use-position-analysis";
import { EvaluationBar } from "./evaluation-bar";
import { useBoardAnimation } from "./use-board-animation";
import { useMoveAssessment } from "./use-move-assessment";
import { BoardMoveBadge } from "./board-move-badge";
import { moveHighlight } from "@/lib/board-assessment";

const pieceNames: Record<string, string> = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };
const promotions: { piece: PromotionPiece; name: string; white: string; black: string }[] = [
  { piece: "q", name: "Queen", white: "♕", black: "♛" },
  { piece: "r", name: "Rook", white: "♖", black: "♜" },
  { piece: "b", name: "Bishop", white: "♗", black: "♝" },
  { piece: "n", name: "Knight", white: "♘", black: "♞" },
];

export function GameBoard() {
  const game = useWorkspace((state) => state.game);
  const exploring = useWorkspace((state) => state.imported !== null);
  const readOnly = useWorkspace((state) => state.imported?.tree.playable === false);
  const orientation = useWorkspace((state) => state.orientation);
  const preferences = useWorkspace((state) => state.preferences);
  const makeMove = useWorkspace((state) => state.move);
  const chess = useMemo(() => chessAt(game), [game]);
  const gameOver = chess.isCheckmate() || chess.isStalemate() || (!exploring && chess.isGameOver());
  const result = usePositionAnalysis(chess.fen());
  const assessment = useMoveAssessment(chess.fen());
  const transition = useWorkspace((state) => state.boardTransition), epoch = useWorkspace((state) => state.boardEpoch);
  const mode = useAnalysis((state) => state.preferences.automatic);
  const animation = useBoardAnimation(chess.fen(), transition);
  const showArrow = useAnalysis((state) => state.preferences.showArrow);
  const count = useAnalysis((state) => state.preferences.multiPv), showThreats = useAnalysis((state) => state.preferences.showThreats);
  const threatResult = useThreats((state) => state.result);
  const arrows = useMemo(() => [
    ...(showArrow ? topMoveArrows(chess.fen(), result, count) : []),
    ...(showThreats && threatResult?.fen === chess.fen() ? threatResult.threats.map((threat) => ({ startSquare: threat.from, endSquare: threat.to, color: THREAT_COLOR })) : []),
  ], [showArrow, chess, result, count, showThreats, threatResult]);
  const bestMove = showArrow && result?.fen === chess.fen() ? result.bestMove : null;
  const [selection, setSelection] = useState<{ square: Square; game: GameState; epoch: number; mode: boolean } | null>(null);
  const [promotion, setPromotion] = useState<{ from: Square; to: Square; game: GameState } | null>(null);
  const [notice, setNotice] = useState("");
  const [keyboardSquare, setKeyboardSquare] = useState("a1");
  const [promotionReady, setPromotionReady] = useState(true);
  const promotionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (promotionTimer.current) clearTimeout(promotionTimer.current); }, []);
  useEffect(() => {
    const offGame = useWorkspace.subscribe((next, before) => {
      if (next.game !== before.game || next.boardEpoch !== before.boardEpoch) { setSelection(null); setPromotion(null); setNotice(""); }
    });
    const offMode = useAnalysis.subscribe((next, before) => {
      if (next.preferences.automatic !== before.preferences.automatic) { setSelection(null); setNotice(""); }
    });
    return () => { offGame(); offMode(); };
  }, []);
  const selected = !readOnly && selection?.game === game && selection.epoch === epoch && selection.mode === mode ? selection.square : null;
  const pending = promotion?.game === game ? promotion : null;
  const lastMove = game.moves[game.cursor - 1];
  const king = checkedKing(chess);
  const destinations = legalDestinations(chess, selected, !readOnly && !pending, exploring);
  const squareStyles: Record<string, CSSProperties> = {};
  if (lastMove) {
    for (const square of [lastMove.from, lastMove.to]) squareStyles[square] = { backgroundImage: moveHighlight(assessment) };
  }
  if (selected) {
    squareStyles[selected] = { boxShadow: "inset 0 0 0 4px #226e59" };
    for (const move of destinations) {
      squareStyles[move.square] = {
        ...squareStyles[move.square],
        backgroundImage: move.capture
          ? "radial-gradient(transparent 58%, #174b6077 59%, #174b6077 70%, transparent 71%)"
          : "radial-gradient(#174b6077 19%, transparent 20%)",
      };
    }
  }
  if (king) squareStyles[king] = { ...squareStyles[king], backgroundImage: "radial-gradient(ellipse, #ed4b5c 5%, #ed4b5ca0 55%, transparent 80%)" };

  function attempt(from: string, to: string, dragged = false): boolean {
    const result = makeMove(from, to);
    if (result.kind === "promotion") {
      if (promotionTimer.current) clearTimeout(promotionTimer.current);
      // The board's drag sensor suppresses document clicks for 50 ms after drop.
      // Do not offer an enabled chooser whose first click can be swallowed.
      setPromotionReady(!dragged);
      if (dragged) promotionTimer.current = setTimeout(() => setPromotionReady(true), 75);
      setPromotion({ from: result.from, to: result.to, game });
      setSelection(null);
      setNotice("");
      return false;
    }
    if (result.kind === "moved") {
      setSelection(null);
      setNotice("");
      return true;
    }
    return false;
  }

  function selectSquare(square: string) {
    if (readOnly || pending || gameOver) return;
    const typedSquare = square as Square;
    if (selected === square) { setSelection(null); setNotice(""); return; }
    if (selected) {
      const result = attempt(selected, square);
      if (result || chess.moves({ square: selected, verbose: true }).some((move) => move.to === square && move.promotion)) return;
    }
    if (chess.get(typedSquare)?.color === chess.turn()) {
      setSelection({ square: typedSquare, game, epoch, mode });
      setNotice("");
    }
  }

  return (
    <>
      <div className="board-with-evaluation">
      <div className="board-frame relative overflow-hidden rounded-md border border-white/10" data-testid="chessboard" data-orientation={orientation} data-best-move={bestMove ?? undefined} data-arrow-count={arrows.length} data-threat-count={showThreats && threatResult?.fen === chess.fen() ? threatResult.threats.length : 0}>
        <Chessboard options={{
          id: "workspace-board",
          position: animation.fen,
          boardOrientation: orientation,
          showNotation: preferences.showCoordinates,
          lightSquareStyle: { backgroundColor: preferences.lightSquare },
          darkSquareStyle: { backgroundColor: preferences.darkSquare },
          lightSquareNotationStyle: { color: coordinateColor(preferences.lightSquare), fontSize: "clamp(11px, 1.8vw, 14px)", fontWeight: 700 },
          darkSquareNotationStyle: { color: coordinateColor(preferences.darkSquare), fontSize: "clamp(11px, 1.8vw, 14px)", fontWeight: 700 },
          squareStyles,
          allowDrawingArrows: false,
          arrows,
          clearArrowsOnPositionChange: false,
          clearArrowsOnClick: false,
          allowDragOffBoard: false,
          allowDragging: !readOnly && !pending && !animation.settling && !gameOver,
          showAnimations: animation.animate,
          animationDurationInMs: animation.duration,
          canDragPiece: ({ piece }) => piece.pieceType[0] === chess.turn(),
          onPieceDrag: ({ square }) => {
            // The library retains this callback until its piece position changes.
            // Read the current mode/game, even when switching modes at the same FEN.
            const current = useWorkspace.getState();
            if (legalDestinations(chessAt(current.game), square, current.imported?.tree.playable !== false, !!current.imported).length) setSelection({ square: square as Square, game: current.game, epoch: current.boardEpoch, mode: useAnalysis.getState().preferences.automatic });
          },
          onPieceDragCancel: () => { setSelection(null); setNotice(""); },
          onPieceDrop: ({ sourceSquare, targetSquare }) => {
            setSelection(null); setNotice("");
            if (useWorkspace.getState().game !== game || readOnly || pending || animation.settling) return false;
            return targetSquare ? attempt(sourceSquare, targetSquare, true) : false;
          },
          onSquareClick: ({ square }) => selectSquare(square),
          squareRenderer: ({ square, children }) => {
            const piece = chess.get(square as Square);
            const label = `${square}${piece ? `, ${piece.color === "w" ? "White" : "Black"} ${pieceNames[piece.type]}` : ", empty"}`;
            return <div
              className="h-full w-full"
              style={squareStyles[square]}
              role="button"
              tabIndex={keyboardSquare === square ? 0 : -1}
              onFocus={() => setKeyboardSquare(square)}
              ref={(element) => {
                // react-chessboard's drag handle duplicates our named keyboard target.
                // Keep pointer dragging, but expose only the square to assistive technology.
                element?.querySelectorAll<HTMLElement>('[role="button"]').forEach((handle) => { handle.setAttribute("role", "presentation"); handle.setAttribute("aria-hidden", "true"); handle.tabIndex = -1; });
              }}
              aria-label={label}
              aria-pressed={selected === square}
              data-testid={`square-${square}`}
              data-last-move={lastMove?.from === square || lastMove?.to === square ? "true" : undefined}
              data-move-strength={lastMove && (lastMove.from === square || lastMove.to === square) ? assessment?.label : undefined}
              data-check={king === square ? "true" : undefined}
              data-legal-destination={destinations.some((move) => move.square === square) ? "true" : undefined}
              onKeyDown={(event) => {
                const direction = orientation === "white" ? 1 : -1;
                const delta = { ArrowLeft: [-direction, 0], ArrowRight: [direction, 0], ArrowUp: [0, direction], ArrowDown: [0, -direction] }[event.key];
                if (delta && (selected || event.altKey)) {
                  event.preventDefault(); event.stopPropagation();
                  const file = Math.max(97, Math.min(104, square.charCodeAt(0) + delta[0])), rank = Math.max(1, Math.min(8, Number(square[1]) + delta[1]));
                  const next = `${String.fromCharCode(file)}${rank}`; setKeyboardSquare(next);
                  event.currentTarget.closest('[data-testid="chessboard"]')?.querySelector<HTMLElement>(`[data-testid="square-${next}"]`)?.focus();
                }
                if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); selectSquare(square); }
                if (event.key === "Escape") { setSelection(null); setNotice(""); }
              }}
            >{children}</div>;
          },
        }} />
        {lastMove && assessment && animation.fen === chess.fen() && <BoardMoveBadge key={`${chess.fen()}:${assessment.label}`} square={lastMove.to} san={lastMove.san} orientation={orientation} assessment={assessment} />}
      </div>
      <EvaluationBar fen={chess.fen()} />
      </div>
      <p data-board-chrome aria-live="polite" className={`board-instructions mt-2 min-h-5 text-center text-xs ${notice ? "text-amber-200" : "text-muted-foreground"}`}>
        {readOnly ? "Use the move list or navigation controls to explore this game." : notice || (selected ? `Choose a square for ${selected}, or select another piece.` : "Drag or click to move. Arrows navigate moves. Alt+arrows explore squares; Enter selects a piece or destination.")}
      </p>
      <Dialog open={!!pending} onOpenChange={(open) => { if (!open) setPromotion(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Promote your pawn</DialogTitle>
            <DialogDescription>Choose a piece for {pending?.to}. The move is made after you choose.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-4 gap-2 py-3">
            {promotions.map(({ piece, name, white, black }) => (
              <Button key={piece} disabled={!promotionReady} variant="outline" className="h-auto flex-col gap-2 px-1 py-4" onClick={() => {
                if (pending) makeMove(pending.from, pending.to, piece);
                setPromotion(null);
                setSelection(null);
                setNotice("");
              }}>
                <span aria-hidden="true" className="text-4xl">{chess.turn() === "w" ? white : black}</span>
                <span className="text-sm">{name}</span>
              </Button>
            ))}
          </div>
          <Button variant="secondary" onClick={() => setPromotion(null)}>Cancel move</Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
