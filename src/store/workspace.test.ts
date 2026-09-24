import { beforeEach, describe, expect, it } from "vitest";
import { useWorkspace } from "./workspace";
import { validatePgn } from "@/lib/pgn/import-service";
import { annotatedPgn } from "@/lib/pgn/fixtures";
import { chessAt } from "@/lib/game";

describe("imported game workspace", () => {
  beforeEach(() => { useWorkspace.getState().reset(); useWorkspace.setState({ orientation: "white" }); });
  it("preserves the free-play session and orientation while viewing an immutable import", async () => {
    useWorkspace.getState().move("e2", "e4");
    useWorkspace.getState().flip();
    const freeFen = chessAt(useWorkspace.getState().game).fen();
    const document = (await validatePgn(annotatedPgn)).validGames[0];
    useWorkspace.getState().openGame(document);
    expect(useWorkspace.getState().orientation).toBe("black");
    expect(useWorkspace.getState().move("d2", "d4").kind).toBe("moved");
    useWorkspace.getState().goTo(4);
    expect(document.tree.mainLine).toHaveLength(4);
    useWorkspace.getState().closeGame();
    expect(chessAt(useWorkspace.getState().game).fen()).toBe(freeFen);
    expect(useWorkspace.getState().orientation).toBe("black");
  });
  it("keeps the chosen branch across previous/next and first/last navigation", async () => {
    useWorkspace.getState().openGame((await validatePgn(annotatedPgn)).validGames[0]);
    useWorkspace.getState().selectNode([0, 0, 1, 0, 0]);
    const branchFen = chessAt(useWorkspace.getState().game).fen();
    useWorkspace.getState().goTo(0);
    useWorkspace.getState().goTo(2);
    expect(chessAt(useWorkspace.getState().game).fen()).toBe(branchFen);
    expect(useWorkspace.getState().selectedPath).toEqual([0, 0, 1, 0, 0]);
    useWorkspace.getState().selectNode([1]);
    expect(chessAt(useWorkspace.getState().game).get("e5")?.type).toBe("p");
  });
  it("selecting a shared main-line prefix restores main-line Next navigation", async () => {
    const document = (await validatePgn("1. e4 e5 2. Nf3 (2. Bc4) Nc6 *")).validGames[0];
    useWorkspace.getState().openGame(document);
    useWorkspace.getState().selectNode([2, 0, 0]);
    useWorkspace.getState().selectNode([0]);
    useWorkspace.getState().goTo(3);
    expect(useWorkspace.getState().selectedPath).toEqual([2]);
    expect(chessAt(useWorkspace.getState().game).get("f3")?.type).toBe("n");
  });
  it("rejects unsupported variants without changing the workspace", async () => {
    const document = (await validatePgn('[Variant "Atomic"]\n1. e5 *')).unsupportedGames[0];
    expect(() => useWorkspace.getState().openGame(document)).toThrow("variant");
    expect(useWorkspace.getState().imported).toBeNull();
  });
});
