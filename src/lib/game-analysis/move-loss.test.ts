import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { readFileSync } from "node:fs";
import { resultSchema } from "../engine/domain";
import { centipawnLoss, scoreLoss } from "./move-loss";
import { classifyMove } from "./move-quality";
import { moveAccuracy } from "./review-summary";
import recorded from "../../../tests/fixtures/nova-review-engine.json";

describe("outcome and material loss", () => {
  it("keeps substantial errors visible in winning and losing positions", () => {
    expect(centipawnLoss(2706, 1534)).toBeGreaterThan(.15);
    expect(centipawnLoss(-2651, -4472)).toBeGreaterThan(.2);
    expect(centipawnLoss(0, 100)).toBe(0);
    expect(centipawnLoss(100, 100)).toBe(0);
    expect(centipawnLoss(0, -10000)).toBeLessThanOrEqual(1);
    expect(centipawnLoss(3000, 2900)).toBeLessThan(centipawnLoss(0, -100));
  });
  it("uses symmetric player perspectives and never invents mate centipawns", () => {
    expect(scoreLoss({ type: "cp", value: 100 }, { type: "cp", value: -100 }, "w")).toBe(scoreLoss({ type: "cp", value: -100 }, { type: "cp", value: 100 }, "b"));
    for (const sign of [1, -1]) {
      expect(scoreLoss({ type: "mate", moves: 5 * sign }, { type: "cp", value: 3066 * sign }, sign === 1 ? "w" : "b")).toBe(.1);
      expect(scoreLoss({ type: "mate", moves: 5 * sign }, { type: "mate", moves: 8 * sign }, sign === 1 ? "w" : "b")).toBe(0);
    }
  });
  it("regresses the supplied Nova game using recorded standard-budget Stockfish evidence", () => {
    const chess = new Chess(); chess.loadPgn(readFileSync("tests/fixtures/nova-review.pgn", "utf8"));
    const moves = chess.history({ verbose: true }), rows = recorded.map(row => resultSchema.parse(row));
    expect(rows).toHaveLength(moves.length + 1);
    const scores: Record<"w" | "b", number[]> = { w: [], b: [] };
    const grades = moves.map((move, i) => {
      expect(rows[i].fen).toBe(move.before); expect(rows[i + 1].fen).toBe(move.after);
      if (new Chess(move.before).moves().length > 1) scores[move.color].push(moveAccuracy(rows[i], rows[i + 1], move.lan, move.color)!);
      return classifyMove(rows[i], rows[i + 1], move.lan, { previous: rows[i - 1] })?.label;
    });
    expect(grades[11]).toBe("Blunder"); // 6...Ne5, roughly equal to losing.
    expect(grades[26]).toBe("Miss"); // 14.Qxg8+, gives up substantial winning material.
    expect(grades[58]).toBe("Miss"); // 30.Rxb7+, loses forced mate but retains a win.
    for (const side of ["w", "b"] as const) expect(scores[side].every(value => value >= 0 && value <= 100)).toBe(true);
    const mean = (side: "w" | "b") => scores[side].reduce((a, b) => a + b, 0) / scores[side].length;
    expect(mean("w")).toBeGreaterThan(90); expect(mean("w")).toBeLessThan(96);
    expect(mean("b")).toBeGreaterThan(80); expect(mean("b")).toBeLessThan(90);
  });
});
