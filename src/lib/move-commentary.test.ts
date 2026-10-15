import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { moveCommentary, spokenMove } from "./move-commentary";
import { parseCoachPreferences } from "../store/coach";

describe("move commentary", () => {
  it("explains e4 without inventing engine superiority and speaks squares clearly", () => {
    const chess = new Chess(), before = chess.fen(), move = chess.move("e4");
    const comment = moveCommentary(chess.fen(), before);
    expect(comment.text).toContain("classic first move");
    expect(comment.source).toBe("Board observation");
    expect(comment.text).not.toContain("best");
    expect(spokenMove(move)).toBe("pawn to e 4");
    expect(comment.speech).toContain("White. pawn to e 4");
  });
  it("detects a missed mate in one from legal moves without an engine", () => {
    const chess = new Chess("7k/8/5KQ1/8/8/8/8/8 w - - 0 1"), before = chess.fen();
    chess.move("Qg5");
    expect(moveCommentary(chess.fen(), before).text).toContain("missed a mate in one");
    expect(moveCommentary(chess.fen(), before).mood).toBe("concerned");
  });
  it("warns of a legal undefended pawn capture without claiming a forced material loss", () => {
    const chess = new Chess("4k3/8/8/8/8/3q4/P7/7K w - - 0 1"), before = chess.fen();
    chess.move("a3");
    const comment = moveCommentary(chess.fen(), before);
    expect(comment.text).toContain("pawn on a3 is undefended");
    expect(comment.text).toContain("compensation");
  });
  it("only gives a confident engine opinion for a non-provisional grade", () => {
    const chess = new Chess(), before = chess.fen(); chess.move("Nf3");
    expect(moveCommentary(chess.fen(), before, { label: "Best", reason: "matches" }, "iris").text).toContain("Love that!");
    expect(moveCommentary(chess.fen(), before, { label: "Best", reason: "matches", provisional: true }).source).toBe("Board observation");
  });
  it("recognizes checkmate and rejects an unrelated previous position", () => {
    const chess = new Chess(); ["f3", "e5", "g4"].forEach(m => chess.move(m));
    const before = chess.fen(); chess.move("Qh4#");
    expect(moveCommentary(chess.fen(), before).text).toContain("Checkmate!");
    expect(moveCommentary(chess.fen(), new Chess().fen()).move).toBeNull();
  });
  it("persists independent avatar voices and safely handles older or damaged settings", () => {
    expect(parseCoachPreferences('{"avatar":"iris"}')).toMatchObject({ avatar: "iris", enabled: true, spoken: false });
    expect(parseCoachPreferences("broken").avatar).toBe("maia");
    expect(parseCoachPreferences('{"avatar":"unknown"}').avatar).toBe("maia");
    expect(parseCoachPreferences(JSON.stringify({ avatar: "vera", spoken: true, voices: { maia: "a", iris: "b", vera: "c" } })).voices).toEqual({ maia: "a", iris: "b", vera: "c" });
  });
});
