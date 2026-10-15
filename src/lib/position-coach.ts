import { Chess, type Color, type PieceSymbol, type Square } from "chess.js";
import type { EngineResult } from "./engine/domain";
import { formatScore } from "./engine/normalize";
import { materialBalance, sideName } from "./workspace-position";

const names: Record<PieceSymbol, string> = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };
const other = (color: Color): Color => color === "w" ? "b" : "w";
export type CoachFactor = { title: string; explanation: string };
export type CoachCandidate = { move: string; explanation: string; reply: string; continuation: string; evaluation: string };
export type PositionCoachReport = {
  fen: string; summary: string; changed: string; urgent: string; terminal: boolean;
  factors: CoachFactor[]; candidates: CoachCandidate[]; routine: string[]; narration: string;
};

/** Board facts and cautious planning prompts, with engine evidence only for this exact FEN.
 * Plain text narration is intentionally independent of UI and any future voice provider.
 */
export function explainPosition(fen: string, result: EngineResult | null = null, previousFen?: string): PositionCoachReport {
  const chess = new Chess(fen), turn = chess.turn(), side = sideName[turn];
  const pieces = chess.board().flat().filter(piece => piece !== null);
  const legal = chess.moves({ verbose: true });
  const terminal = chess.isGameOver();
  const attacked = pieces.filter(p => p.type !== "k" && chess.isAttacked(p.square, other(p.color)));
  const describe = (p: typeof pieces[number]) => `${sideName[p.color]}'s ${names[p.type]} on ${p.square}`;
  const loose = attacked.filter(p => !chess.isAttacked(p.square, p.color));
  const ownLoose = loose.filter(p => p.color === turn);
  const checks = legal.filter(m => /[+#]/.test(m.san)), captures = legal.filter(m => m.captured);
  const list = (items: string[]) => items.join(", ");
  let changed = "This is the starting position of this line; there is no previous move to compare.";
  if (previousFen) {
    const before = new Chess(previousFen);
    const move = before.moves({ verbose: true }).find(m => m.after === fen);
    changed = move ? `${sideName[move.color]} played ${move.san}: the ${names[move.piece]} moved from ${move.from} to ${move.to}${move.captured ? `, capturing a ${names[move.captured]}` : ""}${move.promotion ? ` and promoting to a ${names[move.promotion]}` : ""}. ${chess.isCheck() ? "This gives check." : "Recheck the lines opened and the squares left behind."}` : "Compare the current piece placement with the previous position.";
  }
  const urgent = chess.isCheckmate() ? `${side} is checkmated. There is no legal reply.`
    : chess.isStalemate() ? `${side} has no legal move and is not in check: stalemate.`
    : terminal ? "This position is drawn under the available position rules."
    : chess.isCheck() ? `${side} is in check. First escape the check by moving the king, capturing the checking piece, or blocking where legal.`
    : ownLoose.length ? `${list(ownLoose.map(describe))} ${ownLoose.length === 1 ? "is" : "are"} attacked with no geometric defender. Investigate captures before making a quiet move.`
    : `${side} is not in check. Look for the opponent's forcing moves before choosing a plan; absence of an undefended attacked piece does not rule out a tactic.`;
  const balance = materialBalance(chess);
  const material = balance === 0 ? "Material is level by standard piece values." : `${balance > 0 ? "White" : "Black"} has about ${Math.abs(balance)} pawn${Math.abs(balance) === 1 ? "" : "s"} more material (queen 9, rook 5, bishop/knight 3).`;
  const pawns = pieces.filter(p => p.type === "p");
  const pawnNotes = (["w", "b"] as const).map(color => {
    const own = pawns.filter(p => p.color === color), enemy = pawns.filter(p => p.color !== color);
    const isolated = own.filter(p => !own.some(q => Math.abs(q.square.charCodeAt(0) - p.square.charCodeAt(0)) === 1));
    const doubledFiles = [...new Set(own.filter(p => own.filter(q => q.square[0] === p.square[0]).length > 1).map(p => p.square[0]))];
    const passed = own.filter(p => !enemy.some(q => Math.abs(q.square.charCodeAt(0) - p.square.charCodeAt(0)) <= 1 && (color === "w" ? q.square[1] > p.square[1] : q.square[1] < p.square[1])));
    return `${sideName[color]}: ${[isolated.length ? `isolated pawns on ${list(isolated.map(p => p.square))}` : "", doubledFiles.length ? `doubled pawns on the ${list(doubledFiles)} file(s)` : "", passed.length ? `passed pawns on ${list(passed.map(p => p.square))}` : ""].filter(Boolean).join("; ") || "no isolated, doubled, or passed pawns"}.`;
  });
  const central = ["d4", "e4", "d5", "e5"] as Square[];
  const center = (["w", "b"] as const).map(color => `${sideName[color]} attacks ${central.filter(s => chess.isAttacked(s, color)).length} of the four central squares`);
  const openFiles = [..."abcdefgh"].filter(file => !pawns.some(p => p.square[0] === file));
  const kingNotes = (["w", "b"] as const).map(color => {
    const king = pieces.find(p => p.type === "k" && p.color === color)!;
    const nearby = pieces.filter(p => p.type === "p" && p.color === color && Math.abs(p.square.charCodeAt(0) - king.square.charCodeAt(0)) <= 1 && Number(p.square[1]) - Number(king.square[1]) === (color === "w" ? 1 : -1));
    return `${sideName[color]}'s king is on ${king.square}, with ${nearby.length} friendly pawn${nearby.length === 1 ? "" : "s"} immediately in front on its file or adjacent files.`;
  });
  const quietPieces = pieces.filter(p => p.color === turn && p.type !== "k" && p.type !== "p" && !legal.some(m => m.from === p.square));
  const candidates: CoachCandidate[] = [];
  const engine = result?.fen === fen ? result : null;
  if (!terminal && engine) for (const line of [...engine.lines].sort((a, b) => a.multiPv - b.multiPv)) {
    const board = new Chess(fen), moves = [];
    for (const uci of line.pvUci.slice(0, 6)) {
      try { moves.push(board.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), ...(uci[4] ? { promotion: uci[4] } : {}) })); } catch { break; }
    }
    const first = moves[0];
    if (!first || candidates.some(c => c.move === first.san)) continue;
    candidates.push({ move: first.san,
      explanation: `${side} moves the ${names[first.piece]} from ${first.from} to ${first.to}${first.captured ? ` and captures a ${names[first.captured]}` : ""}${first.promotion ? `, promoting to a ${names[first.promotion]}` : ""}.${/[+#]/.test(first.san) ? " This forces a response to check." : " Compare the resulting activity and threats before committing."}`,
      reply: moves[1] ? `${sideName[other(turn)]}'s engine reply is ${moves[1].san}.` : "No reply is available in this engine line.",
      continuation: moves.map(m => m.san).join(" "), evaluation: `${line.lowerBound ? "At least " : line.upperBound ? "At most " : ""}${formatScore(line.score)} (White's perspective), depth ${line.depth}` });
    if (candidates.length === 3) break;
  }
  const factors: CoachFactor[] = [
    { title: "Checks and threats", explanation: `${urgent} ${attacked.length ? `Attacked pieces: ${list(attacked.map(describe))}. An attack is not necessarily a winning capture; pinned defenders and exchanges need calculation.` : "No non-king piece is currently attacked."}` },
    { title: "Tactical opportunities", explanation: `${side}'s legal checks: ${list(checks.map(m => m.san)) || "none"}. Legal captures: ${list(captures.map(m => m.san)) || "none"}. Look for forks, pins, skewers, and discovered attacks for both sides; this board scan does not establish a combination.` },
    { title: "King safety", explanation: `${kingNotes.join(" ")} Pawn cover alone does not determine safety: check open lines and attacking pieces, especially before moving a pawn near your king.` },
    { title: "Material", explanation: `${material} Activity, king safety, and passed pawns may compensate for a deficit; the material count alone cannot establish compensation.` },
    { title: "Piece activity", explanation: quietPieces.length ? `${list(quietPieces.map(describe))} currently have no legal moves. ${chess.isCheck() ? "The need to answer check restricts mobility." : "Consider freeing a blocked piece once immediate threats are handled."}` : `${side} has a legal move for every non-pawn, non-king piece still on the board. Compare useful targets and safe squares to choose which piece to improve; mobility alone is not activity.` },
    { title: "Pawn structure", explanation: `${pawnNotes.join(" ")} Before a pawn break, calculate captures and the lines it opens. Backward pawns require a closer look at support and control of the square ahead.` },
    { title: "Center and space", explanation: `${center.join("; ")}. This counts geometric attacks, including pinned pieces. Central control is one clue to space; check whether pieces can actually use those squares.` },
    { title: "Key squares and open lines", explanation: `${openFiles.length ? `The ${list(openFiles)} file(s) contain no pawns. Consider whether a rook can enter safely.` : "There are no fully open files. Consider a pawn break to open a line for your rooks."} Look for entry squares and outposts that enemy pawns cannot challenge.` },
    { title: "Initiative", explanation: chess.isCheck() ? `${sideName[other(turn)]} has made a forcing move: ${side} must answer check. This alone does not establish a lasting initiative.` : `${checks.length ? `${side} has ${checks.length} legal checking move(s).` : `${side} has no immediate legal check.`} The initiative belongs to the side that can sustain useful threats; a check or the side to move alone does not prove it.` },
    { title: "Plans and exchanges", explanation: terminal ? "There is no further plan to play in this finished position." : `${chess.isCheck() || ownLoose.length ? "Resolve the immediate danger first." : "Start by improving a piece or preparing a useful pawn break."} ${balance ? "The side ahead in material can consider piece trades, but must check the resulting pawn ending and counterplay." : "With material level, exchange an active enemy piece only when the resulting position helps your plan."} For either side, recalculate king safety and passed pawns after a trade.` },
  ];
  const summary = terminal ? urgent : `${side} to move. ${material} ${candidates.length ? `The engine's leading candidate is ${candidates[0].move}.` : "Run engine analysis to compare candidate moves and replies."}`;
  const routine = [changed, urgent, candidates.length ? `Compare ${list(candidates.map(c => c.move))}.` : "Find two or three candidates: forcing moves first, then a move that improves your position.", candidates.length ? candidates.map(c => `After ${c.move}: ${c.reply}`).join(" ") : "For each candidate, calculate the opponent's strongest checks, captures, and threats.", "Before playing, picture the resulting board. Does your move allow a check, a tactic, or loss of material?"];
  return { fen, summary, changed, urgent, terminal, factors, candidates, routine, narration: [summary, changed, ...factors.map(f => `${f.title}. ${f.explanation}`), ...candidates.map(c => `${c.move}. ${c.explanation} ${c.reply}`)].join("\n\n") };
}
