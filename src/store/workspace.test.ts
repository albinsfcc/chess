import { beforeEach, describe, expect, it } from "vitest";
import { useWorkspace } from "./workspace";
import { validatePgn } from "@/lib/pgn/import-service";
import { annotatedPgn } from "@/lib/pgn/fixtures";
import { chessAt } from "@/lib/game";
import { addUserMove } from "@/lib/pgn/user-variation";
import { USER_BRANCH } from "@/lib/pgn/position";

describe("imported game workspace", () => {
  beforeEach(() => { useWorkspace.getState().reset(); useWorkspace.setState({ orientation: "white" }); });
  it("does not publish repeated selection or navigation beyond either endpoint", async () => {
    useWorkspace.getState().openGame((await validatePgn("1. e4 e5 *")).validGames[0]);
    const start = useWorkspace.getState();
    for (let i = 0; i < 100; i++) { start.goTo(-1); start.selectNode([]); }
    expect(useWorkspace.getState()).toBe(start);
    start.goTo(2);
    const end = useWorkspace.getState();
    for (let i = 0; i < 100; i++) { end.goTo(99); end.selectNode([1]); }
    expect(useWorkspace.getState()).toBe(end);
  });
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
  it("returns to the main line when navigating to the starting position", async () => {
    useWorkspace.getState().openGame((await validatePgn(annotatedPgn)).validGames[0]);
    useWorkspace.getState().selectNode([0, 0, 1, 0, 0]);
    useWorkspace.getState().goTo(0);
    useWorkspace.getState().goTo(2);
    expect(useWorkspace.getState().selectedPath).toEqual([1]);
    useWorkspace.getState().selectNode([1]);
    expect(chessAt(useWorkspace.getState().game).get("e5")?.type).toBe("p");
  });
  it("leaves a local line at its played anchor and follows the played continuation", async () => {
    const document = (await validatePgn("1. e4 e5 2. Nf3 Nc6 *")).validGames[0];
    const first = addUserMove(document.tree, [0], { from: "d7", to: "d5", san: "d5" });
    const second = addUserMove(first.tree, first.path, { from: "e4", to: "d5", san: "exd5" });
    useWorkspace.getState().openGame({ ...document, tree: second.tree });
    useWorkspace.getState().selectNode(second.path);
    useWorkspace.getState().goTo(2);
    expect(useWorkspace.getState().selectedPath).toEqual([USER_BRANCH, 0, 0]);
    useWorkspace.getState().goTo(1);
    expect(useWorkspace.getState().selectedPath).toEqual([0]);
    expect(useWorkspace.getState().game.moves.map(move => move.san)).toEqual(["e4", "e5", "Nf3", "Nc6"]);
    useWorkspace.getState().goTo(2);
    expect(chessAt(useWorkspace.getState().game).get("e5")?.type).toBe("p");
    useWorkspace.getState().selectNode(second.path);
    useWorkspace.getState().selectNode([0]);
    useWorkspace.getState().goTo(2);
    expect(useWorkspace.getState().selectedPath).toEqual([1]);
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
