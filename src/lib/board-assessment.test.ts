import { Chess } from "chess.js";
import { expect, it } from "vitest";
import { badgeSquare, MOVE_BADGES, moveHighlight, savedMoveAssessment } from "./board-assessment";
import { readFileSync } from "node:fs";
import { ENGINE_BUILD, type EngineResult } from "./engine/domain";
import type { PositionAnalysis } from "./game-analysis/domain";

it("ships twelve font-independent SVGs whose colours match the move highlights", () => {
  for (const [label, badge] of Object.entries(MOVE_BADGES)) {
    const svg = readFileSync(`public/icons/moves/${label.toLowerCase().replaceAll(" ", "-")}.svg`, "utf8");
    expect(svg).toContain('viewBox="0 0 64 64"'); expect(svg).toContain(`<title id="title">${label}</title>`);
    expect(svg).toContain(`fill="${badge.color}"`); expect(svg).not.toMatch(/<text|<script|<image|href=/);
    expect(moveHighlight({ label: label as keyof typeof MOVE_BADGES, reason: "test" })).toContain(`${badge.color}80`);
  }
  expect(moveHighlight(null)).toContain("#eed57166");
});

it("places every badge on its destination in either orientation", () => {
  for (const file of "abcdefgh") for (let rank = 1; rank <= 8; rank++) {
    const white = badgeSquare(`${file}${rank}`, "white"), black = badgeSquare(`${file}${rank}`, "black");
    expect(white.column + black.column).toBe(7); expect(white.row + black.row).toBe(7);
  }
  expect(badgeSquare("e4", "white")).toEqual({ column: 4, row: 4 });
  expect(badgeSquare("e4", "black")).toEqual({ column: 3, row: 3 });
  expect(Object.keys(MOVE_BADGES)).toHaveLength(12);
  expect(MOVE_BADGES.Brilliant.symbol).toBe("!!"); expect(MOVE_BADGES.Blunder.symbol).toBe("??");
});
it("grades only the played move at the selected game/path/FEN, including variations", () => {
  const chess = new Chess();
  const before: EngineResult = { requestId: "before", fen: chess.fen(), engineVersion: "test", engineBuild: ENGINE_BUILD, config: { preset: "quick", multiPv: 3 }, bestMove: "e2e4", bestMoveSan: "e4", lines: [{ multiPv: 1, depth: 12, score: { type: "cp", value: 20 }, lowerBound: false, upperBound: false, pvUci: ["e2e4"], pvSan: ["e4"], replayComplete: true }] };
  chess.move("e4"); const after = { ...before, requestId: "after", fen: chess.fen() };
  // Only association/result fields are used by this selector and classifier.
  const records = [{ gameId: "game", analysisId: "session", ply: 0, movePath: [0, 0, 0], playedMoveUci: "e2e4", result: before }, { gameId: "game", analysisId: "session", ply: 1, result: after }] as PositionAnalysis[];
  expect(savedMoveAssessment(after.fen, "game", [0, 0, 0], records)?.label).toBe("Best");
  expect(savedMoveAssessment(after.fen, "other", [0, 0, 0], records)).toBeNull();
  expect(savedMoveAssessment(before.fen, "game", [0, 0, 0], records)).toBeNull();
  expect(savedMoveAssessment(after.fen, "game", [0], records)).toBeNull();
  expect(savedMoveAssessment(after.fen, "game", [], records)).toBeNull();
  expect(savedMoveAssessment(after.fen, "game", [0, 0, 0], records.slice(0, 1))).toBeNull();
  after.lines = [{ ...after.lines[0], depth: 4 }];
  expect(savedMoveAssessment(after.fen, "game", [0, 0, 0], records)).toMatchObject({ label: "Best", provisional: true });
});
