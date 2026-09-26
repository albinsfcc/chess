import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { ENGINE_BUILD, type EngineResult, type EngineScore } from "./domain";
import { MAX_ALTERNATIVE_LOSS_CP, visibleLines } from "./alternatives";
function result(scores: EngineScore[], black = false): EngineResult {
  const chess = new Chess(); if (black) chess.move("e4");
  return { requestId: "test", fen: chess.fen(), config: { preset: "standard", multiPv: 5 }, engineBuild: ENGINE_BUILD, engineVersion: "test", bestMove: "e2e4", bestMoveSan: "e4", lines: scores.map((score, i) => ({ multiPv: i + 1, depth: 12, score, lowerBound: false, upperBound: false, pvUci: [], pvSan: [], replayComplete: true })) };
}
describe("visible engine alternatives", () => {
  it.each([false, true])("uses only current-player scores and includes the 75 cp boundary (Black: %s)", black => {
    const sign = black ? -1 : 1;
    const input = result([100, 25, 24, -90].map(value => ({ type: "cp", value: value * sign })), black);
    expect(MAX_ALTERNATIVE_LOSS_CP).toBe(75); expect(visibleLines(input).map(line => line.multiPv)).toEqual([1, 2]); expect(input.lines).toHaveLength(4);
    expect(visibleLines(input, 0)).toHaveLength(1);
  });
  it.each([false, true])("keeps only mates for the same winning side (Black: %s)", black => {
    const input = result([{ type: "mate", moves: 3 }, { type: "mate", moves: 7 }, { type: "mate", moves: -2 }, { type: "cp", value: 9999 }], black);
    expect(visibleLines(input).map(line => line.multiPv)).toEqual([1, 2]);
  });
  it("never hides the top, including bounded or terminal mate lines", () => {
    const input = result([{ type: "mate", moves: 0 }, { type: "cp", value: 0 }]);
    input.lines[0].lowerBound = true; expect(visibleLines(input)).toEqual([input.lines[0]]);
  });
});
