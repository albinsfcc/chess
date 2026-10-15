import { Chess, type Move, type PieceSymbol } from "chess.js";
import { intrinsicAssessment, type MoveAssessment } from "./game-analysis/move-quality";
import { sideName } from "./workspace-position";
import type { CoachId } from "./coach-personas";

export type MoveComment = { text: string; speech: string; mood: "happy" | "thinking" | "concerned"; source: "Board observation" | "Engine opinion"; move: string | null };
const pieceNames: Record<PieceSymbol, string> = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };
export function spokenMove(move: Move): string {
  if (move.isKingsideCastle()) return "Castles kingside";
  if (move.isQueensideCastle()) return "Castles queenside";
  return `${pieceNames[move.piece]} ${move.captured ? "takes on" : "to"} ${move.to[0]} ${move.to[1]}${move.promotion ? `, promoting to a ${pieceNames[move.promotion]}` : ""}${move.san.endsWith("#") ? ", checkmate" : move.san.endsWith("+") ? ", check" : ""}`;
}
export function moveCommentary(fen: string, previousFen?: string, assessment?: MoveAssessment | null, persona: CoachId = "maia"): MoveComment {
  const chess = new Chess(fen);
  let move: Move | undefined, before: Chess | undefined;
  if (previousFen) { before = new Chess(previousFen); move = before.moves({ verbose: true }).find(m => m.after === fen); }
  const make = (body: string, mood: MoveComment["mood"] = "thinking", source: MoveComment["source"] = "Board observation"): MoveComment => ({ text: move ? `${move.san} — ${body}` : body, speech: move ? `${sideName[move.color]}. ${spokenMove(move)}. ${body}` : body, mood, source, move: move?.san ?? null });
  if (!move || !before) return make("I'm here to help you spot the ideas behind each move. Play a move or step through your game together with me.");
  if (chess.isCheckmate()) return make("Checkmate! The king has no escape. Nicely finished.", "happy");
  if (chess.isStalemate()) return make("That's stalemate. There are no legal moves, but the king isn't in check, so it's a draw.");
  if (chess.isDraw()) return make("This position is drawn under the available position rules.");
  const mate = before.moves({ verbose: true }).find(m => m.san.endsWith("#"));
  if (mate) {
    const result = make(`Oops, ${sideName[move.color]} missed a mate in one! ${mate.san} would have finished the game. Look for checks before settling on a move.`, "concerned");
    result.speech = `${sideName[move.color]}. ${spokenMove(move)}. Oops, there was a mate in one! ${spokenMove(mate)} would have finished the game.`;
    return result;
  }
  const intrinsic = intrinsicAssessment(previousFen!, `${move.from}${move.to}${move.promotion ?? ""}`);
  if (intrinsic?.label === "Forced") return make("The only legal move. Sometimes the position makes the decision for us.");
  if (assessment && !assessment.provisional) {
    const praise = persona === "iris" ? "Love that!" : persona === "vera" ? "Well calculated." : "Nice move!";
    const concern = persona === "iris" ? "Oh, watch out." : persona === "vera" ? "Let's pause here." : "Careful here.";
    const opinions: Partial<Record<MoveAssessment["label"], string>> = {
      Best: `${praise} This matches the engine's top choice in the position.`,
      Excellent: `${praise} The engine considers this very close to its best choice.`,
      Good: "A reasonable choice. The engine sees only a small drop compared with its preferred move.",
      Great: `${praise} The engine sees a big gap between this move and the next alternative.`,
      Brilliant: `${praise} The engine considers this a promising piece sacrifice. Let's examine the continuation.`,
      Inaccuracy: "There's a more precise way. The engine prefers another move; compare the resulting positions.",
      Mistake: `${concern} The engine sees a significant drop after this move. Let's look at the opponent's reply.`,
      Blunder: `${concern} This gives the opponent a major opportunity according to the engine. Check their forcing replies.`,
      Miss: "An opportunity slipped by. The engine found a stronger continuation here.",
      "Missed Win": "There was a winning opportunity here. Let's revisit the position before this move.",
    };
    if (opinions[assessment.label]) return make(opinions[assessment.label]!, ["Blunder", "Mistake", "Miss", "Missed Win"].includes(assessment.label) ? "concerned" : ["Best", "Excellent", "Great", "Brilliant"].includes(assessment.label) ? "happy" : "thinking", "Engine opinion");
  }
  // A legal capture of an undefended pawn is a concrete warning, not proof of a net loss.
  const pawnCapture = chess.moves({ verbose: true }).find(m => m.captured === "p" && !m.isEnPassant() && !chess.isAttacked(m.to, move!.color));
  if (pawnCapture) {
    const result = make(`Watch out: ${sideName[move.color]}'s pawn on ${pawnCapture.to} is undefended and can be taken with ${pawnCapture.san}. Check whether there's compensation before giving it up.`, "concerned");
    result.speech = `${spokenMove(move)}. Watch out, the pawn on ${pawnCapture.to[0]} ${pawnCapture.to[1]} is undefended. ${spokenMove(pawnCapture)} can take it. Check for compensation.`;
    return result;
  }
  if (before.history().length === 0 && previousFen === new Chess().fen() && move.san === "e4") return make("A classic first move! It takes space in the center and opens lines for the bishop and queen.", "happy");
  if (move.san.endsWith("+")) return make("Check! The opponent has to answer the threat to their king. Look at their legal escapes before planning the next move.");
  if (move.isKingsideCastle() || move.isQueensideCastle()) return make("Castling brings the king and rook into new positions. Now check the pawn cover and any open lines toward the king.", "happy");
  if (move.promotion) return make(`A new ${pieceNames[move.promotion]} on the board! Recheck the threats now that the balance of pieces has changed.`, "happy");
  if (move.captured) return make(`That captures a ${pieceNames[move.captured]}. Before celebrating, check the recapture and what lines have opened.`);
  if (["n", "b"].includes(move.piece) && (move.from[1] === "1" || move.from[1] === "8")) return make("Bringing a minor piece into play. Look for a useful target, and keep an eye on the center.", "happy");
  if (move.piece === "p") return make("That pawn move changes the structure. Which squares did it gain control of, and which ones did it leave behind?");
  return make(`The ${pieceNames[move.piece]} has a new square. Check what it attacks now, and what it no longer defends.`);
}
