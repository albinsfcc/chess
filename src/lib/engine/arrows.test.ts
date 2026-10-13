import { expect, it } from "vitest";
import { uniqueArrows } from "./arrows";

it("deduplicates engine/threat endpoints and leaves existing user arrows visible", () => {
  const best = { startSquare: "c2", endSquare: "b1", color: "blue" };
  const threat = { ...best, color: "red" };
  const other = { startSquare: "e2", endSquare: "e4", color: "blue" };
  expect(uniqueArrows([best, threat, other])).toEqual([best, other]);
  expect(uniqueArrows([best, threat, other], [{ ...best, color: "purple" }])).toEqual([other]);
});
