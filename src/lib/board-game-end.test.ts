import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { gameEndBadges, recordedEnding } from "./board-game-end";
import { validatePgn } from "./pgn/validate";

describe("king game-end badges", () => {
  it("does not mark an ongoing game", () => {
    expect(gameEndBadges(new Chess())).toEqual([]);
  });
  it("marks both kings for checkmate and clears when stepping back", () => {
    const chess = new Chess();
    for (const move of ["f3", "e5", "g4", "Qh4#"]) chess.move(move);
    expect(gameEndBadges(chess)).toEqual(expect.arrayContaining([
      expect.objectContaining({ square: "e1", side: "w", kind: "checkmate" }),
      expect.objectContaining({ square: "e8", side: "b", kind: "winner" }),
    ]));
    chess.undo();
    expect(gameEndBadges(chess)).toEqual([]);
  });
  it.each([ ["1-0", "b"], ["0-1", "w"] ])("marks the correct resigning side for %s", (result, loser) => {
    expect(gameEndBadges(new Chess(), { result, termination: "resignation" }).find(b => b.side === loser)?.kind).toBe("resignation");
  });
  it("distinguishes a timeout and an unspecified loss", () => {
    expect(gameEndBadges(new Chess(), { result: "1-0", termination: "time forfeit" }).find(b => b.side === "b")?.kind).toBe("timeout");
    expect(gameEndBadges(new Chess(), { result: "1-0", termination: "normal" }).find(b => b.side === "b")?.kind).toBe("loss");
  });
  it.each([
    ["7k/5Q2/6K1/8/8/8/8/8 b - - 0 1", "stalemate"],
    ["7k/8/6K1/8/8/8/8/8 w - - 0 1", "insufficient material"],
    ["7k/8/6K1/8/8/8/R7/8 w - - 100 51", "fifty-move rule"],
  ])("marks both kings for %s", (fen, reason) => {
    const badges = gameEndBadges(new Chess(fen));
    expect(badges).toHaveLength(2);
    expect(badges.every(b => b.kind === "draw" && b.description.includes(reason))).toBe(true);
  });
  it("handles repetition and agreed draws", () => {
    const chess = new Chess();
    for (const move of ["Nf3", "Nf6", "Ng1", "Ng8", "Nf3", "Nf6", "Ng1", "Ng8"]) chess.move(move);
    expect(gameEndBadges(chess)[0].description).toContain("threefold repetition");
    expect(gameEndBadges(chess, undefined, false)).toEqual([]);
    expect(gameEndBadges(new Chess(), { result: "1/2-1/2", termination: "draw by agreement" }).every(b => b.kind === "draw")).toBe(true);
  });
  it("uses imported results only at the last main-line move, never variations", async () => {
    const document = (await validatePgn('[Result "0-1"]\n[Termination "resignation"]\n\n1. e4 (1. d4 d5) e5 0-1')).validGames[0];
    expect(recordedEnding(document, [])).toBeUndefined();
    expect(recordedEnding(document, [0])).toBeUndefined();
    expect(recordedEnding(document, [0, 0, 1])).toBeUndefined();
    expect(recordedEnding(document, [1])).toEqual({ result: "0-1", termination: "resignation" });
  });
});
