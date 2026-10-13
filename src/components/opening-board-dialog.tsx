"use client";
import { useMemo, useState } from "react";
import { Chess, type Square } from "chess.js";
import { Chessboard } from "react-chessboard";
import { ArrowLeft, ArrowRight, FlipVertical2, RotateCcw } from "lucide-react";
import { chessAt, gameStatus, navigateTo, tryMove, type GameState, type PromotionPiece } from "@/lib/game";
import type { OpeningEntry } from "@/lib/openings";
import { squareAppearance } from "@/lib/board-appearance";
import { useWorkspace } from "@/store/workspace";
import { moveSound, playSound } from "@/lib/sound";
import { usePieceSet } from "./piece-set";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";

export function OpeningBoardDialog({ entry, onClose }: { entry: OpeningEntry; onClose: () => void }) {
  const initial = useMemo<GameState>(() => {
    const chess = new Chess();
    const initialFen = chess.fen();
    chess.loadPgn(entry.pgn);
    const moves = chess.history({ verbose: true }).map(move => ({ from: move.from, to: move.to, san: move.san, ...(move.promotion ? { promotion: move.promotion as PromotionPiece } : {}) }));
    return { initialFen, moves, cursor: moves.length };
  }, [entry]);
  const [game, setGame] = useState(initial);
  const [orientation, setOrientation] = useState<"white" | "black">("white");
  const [selected, setSelected] = useState<Square | null>(null);
  const [promotion, setPromotion] = useState<{ from: string; to: string } | null>(null);
  const preferences = useWorkspace(state => state.preferences);
  const pieces = usePieceSet(preferences.pieceSet);
  const chess = useMemo(() => chessAt(game), [game]);
  const destinations = selected ? chess.moves({ square: selected, verbose: true }).map(move => move.to) : [];
  function move(from: string, to: string, piece?: PromotionPiece) {
    const result = tryMove(game, from, to, piece, true);
    if (result.kind === "promotion") { setPromotion({ from, to }); setSelected(null); return false; }
    if (result.kind !== "moved") return false;
    setGame(result.game); setSelected(null); setPromotion(null);
    playSound(moveSound(result.game.moves[result.game.cursor - 1].san)); return true;
  }
  function select(square: string) {
    if (promotion) return;
    if (selected && move(selected, square)) return;
    const piece = chess.get(square as Square);
    setSelected(piece?.color === chess.turn() ? square as Square : null);
  }
  function goTo(cursor: number) {
    const next = navigateTo(game, cursor);
    if (next.cursor !== game.cursor) playSound(next.cursor < game.cursor ? "move" : moveSound(next.moves[next.cursor - 1].san));
    setGame(next); setSelected(null); setPromotion(null);
  }
  const names = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="opening-board-dialog">
      <DialogHeader><DialogTitle>{entry.eco} · {entry.name}</DialogTitle><DialogDescription>Explore this opening on a separate board. Your game review stays in place.</DialogDescription></DialogHeader>
      <div className="opening-explorer-board" data-testid="opening-board" data-fen={chess.fen()}>
        <Chessboard options={{ id: "opening-explorer", position: chess.fen(), pieces, boardOrientation: orientation, showAnimations: false,
          lightSquareStyle: squareAppearance(preferences, true), darkSquareStyle: squareAppearance(preferences, false),
          allowDragging: !promotion && !chess.isCheckmate() && !chess.isStalemate(), canDragPiece: ({ piece }) => piece.pieceType[0] === chess.turn(),
          onPieceDrop: ({ sourceSquare, targetSquare }) => !!targetSquare && move(sourceSquare, targetSquare),
          onSquareClick: ({ square }) => select(square),
          squareStyles: { ...Object.fromEntries(destinations.map(square => [square, { backgroundImage: "radial-gradient(#174b6099 22%, transparent 23%)" }])), ...(selected ? { [selected]: { boxShadow: "inset 0 0 0 3px #226e59" } } : {}) },
          squareRenderer: ({ square, children }) => {
            const piece = chess.get(square as Square);
            return <div className="h-full w-full" role="button" tabIndex={0} aria-label={`${square}, ${piece ? `${piece.color === "w" ? "White" : "Black"} ${names[piece.type]}` : "empty"}`} data-testid={`opening-square-${square}`} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); select(square); } }}>{children}</div>;
          },
        }} />
      </div>
      <p role="status" className="text-center text-sm text-primary">{gameStatus(chess)}</p>
      {promotion && <div className="flex flex-wrap justify-center gap-2" role="group" aria-label="Choose promotion">{([['q', 'Queen'], ['r', 'Rook'], ['b', 'Bishop'], ['n', 'Knight']] as const).map(([piece, name]) => <Button key={piece} onClick={() => move(promotion.from, promotion.to, piece)}>{name}</Button>)}<Button variant="ghost" onClick={() => setPromotion(null)}>Cancel</Button></div>}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button variant="outline" size="icon" aria-label="Previous opening move" disabled={!game.cursor} onClick={() => goTo(game.cursor - 1)}><ArrowLeft /></Button>
        <span className="text-xs text-muted-foreground">Ply {game.cursor} / {game.moves.length}</span>
        <Button variant="outline" size="icon" aria-label="Next opening move" disabled={game.cursor === game.moves.length} onClick={() => goTo(game.cursor + 1)}><ArrowRight /></Button>
        <Button variant="outline" onClick={() => { setGame(initial); setSelected(null); setPromotion(null); }}><RotateCcw />Reset opening</Button>
        <Button variant="outline" onClick={() => setOrientation(orientation === "white" ? "black" : "white")}><FlipVertical2 />Flip</Button>
      </div>
      <p className="break-words rounded-lg bg-secondary p-3 font-mono text-xs leading-relaxed" aria-label="Opening move sequence">{entry.pgn}</p>
    </DialogContent>
  </Dialog>;
}
