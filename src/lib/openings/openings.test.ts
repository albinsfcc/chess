import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { Chess, DEFAULT_POSITION } from "chess.js";
import { describe, expect, it } from "vitest";
import { openingIndexSchema, openingHistory, openingKey, bookContinuation } from "./index";
const index = openingIndexSchema.parse(JSON.parse(readFileSync("public/openings/index.json", "utf8")));
function game(pgn: string) {
  const chess = new Chess(); chess.loadPgn(pgn);
  return { initialFen: DEFAULT_POSITION, moves: chess.history({ verbose: true }).map(({from,to,san,promotion}) => ({from,to,san,...(promotion && promotion !== "p" && promotion !== "k" ? {promotion} : {})})), cursor: chess.history().length };
}
describe("pinned local opening knowledge", () => {
  it("covers all 500 ECO codes and has reproducible provenance", () => {
    expect(index.entries.length).toBe(3815); expect(new Set(index.entries.map((entry) => entry.eco)).size).toBe(500);
    expect(index.license).toBe("CC0-1.0");
    const manifest = JSON.parse(readFileSync("public/openings/manifest.json", "utf8")) as { indexSha256: string; commit: string };
    expect(manifest.commit).toBe(index.commit);
    expect(createHash("sha256").update(readFileSync("public/openings/index.json")).digest("hex")).toBe(manifest.indexSha256);
  });
  it.each([
    ["1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6", "Najdorf"],
    ["1. e4 e5 2. Nf3 Nc6 3. Bb5", "Ruy Lopez"],
    ["1. e4 c6 2. d4 d5", "Caro-Kann"], ["1. e4 e6 2. d4 d5", "French"],
    ["1. d4 d5 2. c4", "Queen's Gambit"], ["1. d4 Nf6 2. c4 e6 3. Nc3 Bb4", "Nimzo-Indian"],
    ["1. d4 Nf6 2. c4 g6 3. Nc3 Bg7 4. e4 d6", "King's Indian"], ["1. c4", "English"],
    ["1. d4 d5 2. Nf3 Nf6 3. Bf4", "London"],
  ])("recognizes %s", (pgn, name) => expect(openingHistory(game(pgn), index).match?.name).toContain(name));
  it("matches transpositions and ignores counters, but preserves castling and turn", () => {
    const a = new Chess(); a.loadPgn("1. Nf3 d5 2. d4"); const b = new Chess(); b.loadPgn("1. d4 d5 2. Nf3");
    expect(openingKey(a.fen())).toBe(openingKey(b.fen()));
    expect(bookContinuation(DEFAULT_POSITION, "e2e4", index)).not.toBeNull();
    expect(bookContinuation(DEFAULT_POSITION.replace(" 0 1", " 9 30"), "e2e4", index)).not.toBeNull();
    expect(bookContinuation(DEFAULT_POSITION.replace(" KQkq ", " - "), "e2e4", index)).toBeNull();
    expect(bookContinuation(DEFAULT_POSITION, "e2e5", index)).toBeNull();
  });
  it("retains the last recognized opening and follows backwards navigation", () => {
    const state = game("1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Nb1 h6 7. Nb3 h5");
    const full = openingHistory(state, index); expect(full.match?.name).toContain("Najdorf"); expect(full.current).toBe(false);
    expect(openingHistory({ ...state, cursor: 1 }, index).match?.name).not.toContain("Najdorf");
    expect(openingHistory({ ...state, cursor: 0 }, index).match).toBeNull();
  });
});
