import { describe, expect, it } from "vitest";
import { inspectPgn, PGN_LIMITS } from "./limits";
import { validatePgn } from "./validate";
import { flattenMoves } from "./move-list";
describe("PGN preflight limits", () => {
  it("limits encoded paste bytes and game count before parsing", async () => {
    expect((await validatePgn("é".repeat(PGN_LIMITS.pasteBytes / 2 + 1))).parseErrors[0].message).toContain("5 MB");
    expect((await validatePgn("1. e4 *\n".repeat(101))).parseErrors[0].message).toContain("100 games");
  });
  it("bounds individual games, total moves, nesting and tag values", () => {
    expect(() => inspectPgn(`{${"x".repeat(500_001)}} 1. e4 *`)).toThrow("500 KB");
    expect(() => inspectPgn("e4 ".repeat(20_001))).toThrow("20,000");
    expect(() => inspectPgn(`1. e4 ${"(".repeat(33)}${")".repeat(33)} *`)).toThrow("32 levels");
    expect(() => inspectPgn(`[White "${"a".repeat(2049)}"]\n*`)).toThrow("tag count or value");
  });
  it.each(['[__proto__ "x"]\n*', '[White Alice]\n*', '[SetUp "2"]\n*', '[White "A"]\n[White "B"]\n*'])("rejects malformed or unsafe tags: %s", async (raw) => {
    expect((await validatePgn(raw)).invalidEntries).toHaveLength(1);
  });
  it("preserves extension tags and legal deep variations, without counting comment parentheses", async () => {
    const nested = (n: number): string => `e4 ${n ? `(${nested(n - 1)})` : ""}`;
    const result = await validatePgn(`[StudyRef "safe"]\n{${"(".repeat(40)}} 1. ${nested(25)} *`);
    expect(result.invalidEntries).toHaveLength(0);
    expect(result.validGames[0].game.headers.StudyRef).toBe("safe");
    expect(flattenMoves(result.validGames[0].tree.mainLine)).toHaveLength(26);
  });
  it("keeps a valid game beside an oversized entry", async () => {
    const result = await validatePgn(`[Event "Bad"]\n{${"x".repeat(500_001)}} *\n[Event "Good"]\n1. e4 *`);
    expect(result.validGames).toHaveLength(1); expect(result.invalidEntries).toHaveLength(1);
  });
});
