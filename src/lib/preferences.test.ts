import { describe, expect, it } from "vitest";
import { coordinateColor, defaultPreferences, parsePreferences } from "./preferences";

describe("board preferences", () => {
  it("persists wooden texture and the complete new piece set across reload parsing", () => {
    const preferences = { ...defaultPreferences, lightSquare: "#e8c99b", darkSquare: "#94603e", boardTexture: "wooden", pieceSet: "carved" };
    expect(parsePreferences(JSON.stringify(preferences))).toEqual(preferences);
  });
  it("round trips valid colours and hidden coordinates", () => {
    const preferences = { lightSquare: "#abcdef", darkSquare: "#123456", showCoordinates: false };
    expect(parsePreferences(JSON.stringify(preferences))).toEqual({ ...preferences, boardTexture: "plain", pieceSet: "classic" });
  });
  it.each([null, "", "bad json", "null", "{}", '{"lightSquare":"red"}', '{"showCoordinates":"false"}'])("falls back safely for %s", (value) => {
    expect(parsePreferences(value)).toEqual(defaultPreferences);
  });
  it("discards unknown fields", () => {
    expect(parsePreferences(JSON.stringify({ ...defaultPreferences, games: ["not a preference"] }))).toEqual(defaultPreferences);
  });
  it("keeps coordinates readable on custom square colours", () => {
    expect(coordinateColor("#ffffff")).toBe("#101619");
    expect(coordinateColor("#000000")).toBe("#ffffff");
  });
});
