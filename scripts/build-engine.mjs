import { build } from "esbuild";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const version = "19.0.0";
const source = `https://github.com/nmrugg/stockfish.js/tree/v${version}`;
const root = `public/engines/stockfish-${version}`;
const pkg = JSON.parse(await readFile("node_modules/stockfish/package.json", "utf8"));
if (pkg.version !== version) throw new Error("Unexpected Stockfish package version");
await mkdir(root, { recursive: true });
const files = {};
for (const [from, name] of [
  ["bin/stockfish-19-lite-single.js", "stockfish-19-lite-single.js"],
  ["bin/stockfish-19-lite-single.wasm", "stockfish-19-lite-single.wasm"],
  ["Copying.txt", "COPYING.txt"],
]) {
  await copyFile(`node_modules/stockfish/${from}`, `${root}/${name}`);
  const bytes = await readFile(`${root}/${name}`);
  files[name] = { bytes: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex") };
}
await writeFile(`${root}/manifest.json`, JSON.stringify({ package: `stockfish@${version}`, build: "lite single-threaded WASM", source, files }, null, 2) + "\n");
await writeFile(`${root}/NOTICE.txt`, `Stockfish 19 / Stockfish.js ${version}\nLite single-threaded WASM build; vendor files copied without modification.\n\nStockfish.js (c) 2026 Chess.com, LLC, by Nathan Rugg and contributors.\nStockfish by the Stockfish developers. Distributed under GNU GPL version 3.\nFull license: COPYING.txt (distributed alongside this notice).\n\nCorresponding source, build scripts and license:\n${source}\nSource archive: https://github.com/nmrugg/stockfish.js/archive/refs/tags/v${version}.tar.gz\nRelease: https://github.com/nmrugg/stockfish.js/releases/tag/v${version}\nRelease commit: 9cb3e50 (v19.0.0). Upstream Stockfish base: edb0d9d.\nLite code/network reference is documented in that release and the loader header.\nBuild recipe: ./build.js --single-threaded --lite -f (Emscripten; see upstream build.js and README).\nPackage provenance: https://registry.npmjs.org/stockfish/-/stockfish-${version}.tgz\nPackage integrity is pinned in package-lock.json; distributed file hashes are in manifest.json.\n\nThis application loads these files locally in one dedicated Web Worker.\nNo third-party engine CDN, server-side engine, or engine modifications are used.\nStockfish.js has the same GPLv3 notice for the distributed loader/WASM.\n`);
await build({ entryPoints: ["src/lib/engine/stockfish.worker.ts"], outfile: "public/engines/analysis-worker.js", bundle: true, platform: "browser", format: "iife", target: "es2020", minify: true, legalComments: "inline" });
console.log(`Prepared Stockfish.js ${version} lite single-threaded assets and analysis worker.`);
await mkdir("public/workers", { recursive: true });
await build({ entryPoints: ["src/lib/data/data.worker.ts"], outfile: "public/workers/data-worker.js", bundle: true, platform: "browser", format: "iife", target: "es2020", minify: true, legalComments: "inline" });
