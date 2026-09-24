import { describe, expect, it } from "vitest";
import { Chess, DEFAULT_POSITION } from "chess.js";
import { validatePgn } from "./import-service";
import { reconstructPosition } from "./position";
import { splitEntries } from "./parse";
import { identityKeys, isDuplicate } from "./hash";
import { annotatedPgn } from "./fixtures";

describe("PGN parsing and domain normalization", () => {
  it("parses a single game with typed headers, comments, NAGs and nested RAVs", async () => {
    const result = await validatePgn(annotatedPgn);
    expect(result.invalidEntries).toEqual([]);
    expect(result.validGames).toHaveLength(1);
    const { game, tree } = result.validGames[0];
    expect(game).toMatchObject({ source: "pgn", white: "Alice", black: "Bob", whiteRating: 1600, blackRating: 1550, playedAt: "2025-08-01", timeControl: "600+5", analysisStatus: "not-analyzed", rawPgn: annotatedPgn });
    expect(tree.initialFen).toBe(DEFAULT_POSITION);
    expect(tree.result).toBe("*");
    expect(tree.comments).toEqual(["Opening note"]);
    expect(tree.mainLine.map((node) => node.san)).toEqual(["e4", "e5", "Nf3", "Nc6"]);
    expect(tree.mainLine[0]).toMatchObject({ nags: ["$1"], commentsAfter: ["Centre"], uci: "e2e4" });
    expect(tree.mainLine[1].commentsAfter).toEqual(["Reply comment"]);
    expect(tree.mainLine[0].variations[0][1].variations[0][0]).toMatchObject({ san: "Nf6", nags: ["$2"], commentsAfter: ["Indian defence"] });
  });

  it("preserves pre-move comments and structured comment annotations", async () => {
    const { validGames } = await validatePgn('1. e4 {[%clk 0:05:00] hello} ({before} 1. d4) *');
    expect(validGames[0].tree.mainLine[0].annotations).toMatchObject({ clk: "0:05:00", comment: "hello" });
    expect(validGames[0].tree.mainLine[0].variations[0][0].commentsBefore).toEqual(["before"]);
  });

  it("accepts NAGs after comments without rewriting the saved PGN or comment text", async () => {
    const raw = '[Event "Text {inside} $4"]\n1. e4 {one $2} {two} $1 (1. d4 ;a note\n$2 d5) e5 *';
    const result = await validatePgn(raw);
    expect(result.invalidEntries).toEqual([]);
    const { game, tree } = result.validGames[0];
    expect(game.rawPgn).toBe(raw);
    expect(game.event).toBe("Text {inside} $4");
    expect(tree.mainLine[0].nags).toEqual(["$1"]);
    expect(tree.mainLine[0].commentsAfter).toEqual(["one $2 two"]);
    expect(tree.mainLine[0].variations[0][0].nags).toEqual(["$2"]);
  });

  it("does not silently merge a header-only invalid game with a following Event", async () => {
    const result = await validatePgn('[Event "Missing moves"]\n\n[Event "Good"]\n1. e4 *');
    expect(result.invalidEntries).toHaveLength(1);
    expect(result.validGames).toHaveLength(1);
    expect(result.validGames[0].game.event).toBe("Good");
  });

  it("parses multiple games including headerless games and missing optional headers", async () => {
    const result = await validatePgn(`${annotatedPgn}\n\n1. d4 d5 *\n\n[White "Carol"]\n1. c4 e5 *`);
    expect(result.validGames).toHaveLength(3);
    expect(result.invalidEntries).toEqual([]);
    expect(result.validGames[1].game).toMatchObject({ white: "Unknown White", black: "Unknown Black", playedAt: null, whiteRating: null });
  });

  it("splits at a new header when the preceding game omits its result", async () => {
    const result = await validatePgn('[White "First"]\n1. e4 e5\n[White "Second"]\n1. d4 d5 *');
    expect(result.validGames).toHaveLength(2);
  });

  it("does not split on results or apparent headers inside annotations", async () => {
    const pgn = '1. e4 {1-0\n[Event "inside comment"]} (1. d4 {0-1}) e5 *';
    expect(splitEntries(pgn)).toHaveLength(1);
    expect((await validatePgn(pgn)).validGames).toHaveLength(1);
  });

  it("retains valid games from mixed input and reports source locations", async () => {
    const result = await validatePgn('[Event "Broken"]\n1. e4 nonsense *\n\n[Event "Good"]\n1. d4 d5 *\n\n1. e5 *');
    expect(result.validGames).toHaveLength(1);
    expect(result.invalidEntries).toHaveLength(2);
    expect(result.parseErrors).toHaveLength(1);
    expect(result.invalidEntries[0]).toMatchObject({ entryIndex: 1, line: 2 });
    expect(result.invalidEntries[1].message).toContain('Illegal move "e5"');
  });

  it("recovers a later Event game after an unclosed comment", async () => {
    const result = await validatePgn('[Event "Broken"]\n1. e4 {unclosed\n\n[Event "Good"]\n1. d4 d5 *');
    expect(result.validGames).toHaveLength(1);
    expect(result.invalidEntries).toHaveLength(1);
  });

  it.each(["", "   ", "this is not PGN", "1. e5 *", '1. e4 (1. d5) *', '[FEN "not a fen"]\n1. e4 *', '[SetUp "1"]\n1. e4 *', '[Result "1-0"]\n1. e4 0-1'])("reports invalid input without throwing: %s", async (input) => {
    const result = await validatePgn(input);
    expect(result.validGames).toHaveLength(0);
    expect(result.invalidEntries.length).toBeGreaterThan(0);
    expect(result.invalidEntries[0].rawPgn).toBe(input.trim() || input);
  });

  it("preserves unsupported games even if their moves are illegal in standard chess", async () => {
    const pgn = '[Variant "Atomic"]\n[White "Variant player"]\n1. e5 *';
    const result = await validatePgn(pgn);
    expect(result.invalidEntries).toHaveLength(0);
    expect(result.unsupportedGames).toHaveLength(1);
    expect(result.unsupportedGames[0].game).toMatchObject({ rawPgn: pgn, variant: "Atomic", analysisStatus: "unsupported" });
    expect(() => reconstructPosition(result.unsupportedGames[0].tree)).toThrow("variant");
  });

  it("normalizes standard variant aliases", async () => {
    expect((await validatePgn('[Variant "Chess"]\n1. e4 *')).validGames[0].game.variant).toBe("Standard");
  });
});

describe("PGN identities", () => {
  it("ignores whitespace, wrapping, comments, variations and NAGs", async () => {
    const a = '[Site "Local"]\n[Date "2025.01.01"]\n[White "Alice"]\n[Black "Bob"]\n1. e4 $1 {hello} (1. d4) e5 *';
    const b = '[Site "Local"] [UTCDate "2025.01.01"] [White "Alice"] [Black "Bob"]\n1.e4\n e5 {new annotation} *';
    const result = await validatePgn(`${a}\n\n${b}`);
    expect(result.validGames).toHaveLength(1);
    expect(result.duplicateGames).toHaveLength(1);
    const existing = await validatePgn(b, [result.validGames[0].game]);
    expect(existing.duplicateGames).toHaveLength(1);
  });

  it("keeps different results, players, variants and starting positions separate", async () => {
    const result = await validatePgn('1. e4 1-0\n1. e4 0-1\n[White "Other"]\n1. e4 1-0\n[Variant "Atomic"]\n1. e4 1-0');
    expect(result.validGames).toHaveLength(3);
    expect(result.unsupportedGames).toHaveLength(1);
    expect(result.duplicateGames).toHaveLength(0);
    const a = (await validatePgn('[FEN "7k/8/8/8/8/8/P7/7K w - - 0 1"]\n1. a3 *')).validGames[0];
    const b = (await validatePgn('[FEN "6k1/8/8/8/8/8/P7/7K w - - 0 1"]\n1. a3 *')).validGames[0];
    expect(a.game.normalizedPgnHash).not.toBe(b.game.normalizedPgnHash);
  });

  it("prefers matching source/external ID when present and also checks the hash", () => {
    const game = { source: "pgn" as const, externalId: "external-1", normalizedPgnHash: "a" };
    const known = new Set(identityKeys(game));
    expect(isDuplicate({ ...game, normalizedPgnHash: "b" }, known)).toBe(true);
    expect(isDuplicate({ ...game, externalId: undefined }, known)).toBe(true);
  });
});

describe("game-tree reconstruction", () => {
  it("reconstructs the start and arbitrary main-line plies with SAN, UCI and path", async () => {
    const { tree } = (await validatePgn(annotatedPgn)).validGames[0];
    expect(reconstructPosition(tree).fen).toBe(DEFAULT_POSITION);
    const expected = new Chess(); expected.move("e4"); expected.move("e5"); expected.move("Nf3");
    expect(reconstructPosition(tree, [2])).toMatchObject({ fen: expected.fen(), sanHistory: ["e4", "e5", "Nf3"], uciHistory: ["e2e4", "e7e5", "g1f3"], currentPly: 3, path: [2] });
    expect(() => reconstructPosition(tree, [9])).toThrow();
    expect(() => reconstructPosition(tree, [0, 0])).toThrow();
  });

  it("reconstructs a recursive variation before the replaced move and restores main line", async () => {
    const { tree } = (await validatePgn(annotatedPgn)).validGames[0];
    const expected = new Chess(); expected.move("d4"); expected.move("Nf6");
    const branch = reconstructPosition(tree, [0, 0, 1, 0, 0]);
    expect(branch.fen).toBe(expected.fen());
    expect(branch.sanHistory).toEqual(["d4", "Nf6"]);
    expect(branch.uciHistory).toEqual(["d2d4", "g8f6"]);
    expect(branch.currentPly).toBe(2);
    const main = new Chess(); main.move("e4"); main.move("e5");
    expect(reconstructPosition(tree, [1]).fen).toBe(main.fen());
  });

  it.each([
    ['7k/P7/8/8/8/8/8/7K w - - 0 1', '1. a8=Q+', 'a7a8q'],
    ['r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', '1. O-O', 'e1g1'],
    ['7k/8/8/3pP3/8/8/8/7K w - d6 0 1', '1. exd6', 'e5d6'],
    ['7k/8/8/8/8/8/p7/7K b - - 0 42', '42... a1=N', 'a2a1n'],
  ])("handles custom FEN and special move %s %s", async (fen, movetext, uci) => {
    const result = await validatePgn(`[SetUp "1"]\n[FEN "${fen}"]\n${movetext} *`);
    expect(result.invalidEntries).toEqual([]);
    const { tree } = result.validGames[0];
    expect(reconstructPosition(tree).fen).toBe(new Chess(fen).fen());
    const position = reconstructPosition(tree, [0]);
    expect(position.uciHistory).toEqual([uci]);
    expect(position.currentPly).toBe(1);
  });

  it("supports checkmate notation", async () => {
    const { tree } = (await validatePgn('1. f3 e5 2. g4 Qh4# 0-1')).validGames[0];
    expect(new Chess(reconstructPosition(tree, [3]).fen).isCheckmate()).toBe(true);
  });
});
