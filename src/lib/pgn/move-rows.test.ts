import { expect, it } from "vitest";
import { pairedMoveRows } from "./move-list";
import { validatePgn } from "./import-service";
import { annotatedPgn } from "./fixtures";
it("pairs White and Black by move number while retaining recursive variations", async () => {
 const game = (await validatePgn(annotatedPgn)).validGames[0];
 const rows = pairedMoveRows(game.tree.mainLine);
 expect(rows[0].nodes.map(node=>node.san)).toEqual(["e4","e5"]);
 expect(rows.find(row=>row.depth===0 && row.moveNumber===2)?.nodes.map(node=>node.san)).toEqual(["Nf3","Nc6"]);
 expect(rows.find(row=>row.depth===2)?.nodes.map(node=>node.san)).toEqual(["Nf6"]);
 expect(new Set(rows.flatMap(row=>row.nodes.map(node=>node.id))).size).toBe(rows.flatMap(row=>row.nodes).length);
});
it("splits a move pair at a local branch so the alternative precedes the played reply", async () => {
 const game = (await validatePgn("1. e4 e5 2. Nf3 Nc6 *")).validGames[0];
 const rows = pairedMoveRows(game.tree.mainLine, new Set(["0"]));
 expect(rows.map(row => row.nodes.map(node => node.san))).toEqual([["e4"], ["e5"], ["Nf3", "Nc6"]]);
});
