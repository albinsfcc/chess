import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { APP_VERSION } from "@/lib/app-info";
describe("release notices and provenance", () => {
  it("includes notices for required direct dependencies and the application version", () => {
    const manifest = JSON.parse(readFileSync("public/licenses/manifest.json", "utf8")) as { version: string; packages: { name: string; license: string; noticeFiles: string[] }[] };
    expect(manifest.version).toBe(APP_VERSION);
    for (const name of ["stockfish", "chess.js", "react-chessboard", "@mliebelt/pgn-parser", "dexie", "next", "react"]) expect(manifest.packages.find((pkg) => pkg.name === name)?.noticeFiles.length).toBeGreaterThan(0);
    const notices = readFileSync("public/licenses/THIRD-PARTY-NOTICES.txt", "utf8"); expect(notices).toContain("GNU GENERAL PUBLIC LICENSE"); expect(notices).toContain("Apache License"); expect(notices).toContain("Redistribution and use");
  });
  it("traces the unmodified WASM and loader to the pinned package and source", () => {
    const root = "public/engines/stockfish-19.0.0/";
    const manifest = JSON.parse(readFileSync(`${root}manifest.json`, "utf8")) as { package: string; source: string; files: Record<string, { sha256: string; bytes: number }> };
    expect(manifest.package).toBe("stockfish@19.0.0"); expect(manifest.source).toBe("https://github.com/nmrugg/stockfish.js/tree/v19.0.0");
    for (const name of ["stockfish-19-lite-single.wasm", "stockfish-19-lite-single.js"]) {
      const distributed = readFileSync(root + name), installed = readFileSync(`node_modules/stockfish/bin/${name}`);
      expect(distributed.equals(installed)).toBe(true); expect(createHash("sha256").update(distributed).digest("hex")).toBe(manifest.files[name].sha256);
    }
  });
});
