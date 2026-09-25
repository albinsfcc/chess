import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { Chess } from "chess.js";
const root = "data/openings", out = "public/openings";
const provenance = JSON.parse(await readFile(`${root}/provenance.json`, "utf8"));
const entries = [], named = {}, edges = {}, hashes = {};
const key = (fen) => fen.split(" ").slice(0, 4).join(" ");
let maxPly = 0;
for (const file of ["a.tsv", "b.tsv", "c.tsv", "d.tsv", "e.tsv"]) {
  const text = await readFile(`${root}/${file}`, "utf8"); hashes[file] = createHash("sha256").update(text).digest("hex");
  for (const line of text.trim().split(/\r?\n/).slice(1)) {
    const [eco, name, pgn] = line.split("\t");
    if (!eco || !name || !pgn) throw new Error(`Invalid opening in ${file}`);
    const chess = new Chess(); chess.loadPgn(pgn); const history = chess.history({ verbose: true });
    const id = entries.length; entries.push({ eco, name, pgn, ply: history.length }); maxPly = Math.max(maxPly, history.length);
    const last = key(chess.fen());
    // Multiple named transpositions are retained; UI can disclose aliases.
    (named[last] ??= []).push(id);
    for (const move of history) {
      const position = key(move.before), uci = `${move.from}${move.to}${move.promotion ?? ""}`;
      edges[position] ??= {};
      const old = edges[position][uci];
      if (old === undefined || entries[old].ply > history.length) edges[position][uci] = id;
    }
  }
}
await mkdir(out, { recursive: true });
const data = { version: 1, ...provenance, entries, named, edges, maxPly };
await writeFile(`${out}/index.json`, JSON.stringify(data));
await copyFile(`${root}/COPYING.txt`, `${out}/COPYING.txt`);
await writeFile(`${out}/manifest.json`, JSON.stringify({ ...provenance, entries: entries.length, positions: Object.keys(edges).length, maxPly, files: hashes, indexSha256: createHash("sha256").update(JSON.stringify(data)).digest("hex") }, null, 2));
console.log(`Prepared ${entries.length} named openings, ${Object.keys(edges).length} book positions (maximum ${maxPly} plies).`);
