import { readFile, readdir, mkdir, writeFile, access } from "node:fs/promises";
import path from "node:path";
const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
const manifest = [], notices = [], missing = [];
const licenseName = /^(?:licen[cs]e|copying|notice|copyright|unlicense)(?:[.-].*)?$/i;
async function licenseFiles(directory, recursive = false) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isFile() && licenseName.test(entry.name)) files.push(path.join(directory, entry.name));
    if (recursive && entry.isDirectory()) files.push(...await licenseFiles(path.join(directory, entry.name), true));
  }
  return files;
}
for (const [directory, entry] of Object.entries(lock.packages)) {
  if (!directory || (entry.dev && !/node_modules\/(?:stockfish|tailwindcss|@tailwindcss\/node)$/.test(directory))) continue;
  try { await access(`${directory}/package.json`); } catch { continue; } // Optional binaries for other platforms are not distributed here.
  const pkg = JSON.parse(await readFile(`${directory}/package.json`, "utf8"));
  const files = await licenseFiles(directory);
  if (!files.length && pkg.name.startsWith("@next/")) files.push("node_modules/next/license.md");
  if (!files.length && pkg.name === "client-only") files.push("node_modules/react/LICENSE");
  if (!files.length && pkg.name === "react-remove-scroll-bar") files.push("scripts/vendor-notices/react-remove-scroll-bar.LICENSE");
  if (pkg.name === "next") files.push(...await licenseFiles(`${directory}/dist/compiled`, true));
  if (pkg.name === "stockfish") files.push("public/engines/stockfish-19.0.0/NOTICE.txt");
  if (!files.length) missing.push(`${pkg.name}@${pkg.version}`);
  const repository = typeof pkg.repository === "string" ? pkg.repository : pkg.repository?.url;
  manifest.push({ name: pkg.name, version: pkg.version, license: pkg.license ?? "See notice", source: repository ?? pkg.homepage ?? "", noticeFiles: files.map((file) => file.replaceAll("\\", "/")), integrity: entry.integrity });
  notices.push(`\n${"=".repeat(72)}\n${pkg.name} ${pkg.version}\nLicense: ${pkg.license ?? "See below"}\nSource: ${repository ?? pkg.homepage ?? "package source"}\n`);
  for (const file of files) notices.push(`\n--- ${file.replaceAll("\\", "/")} ---\n${await readFile(file, "utf8")}\n`);
}
if (missing.length) throw new Error(`Missing distributed license text: ${missing.join(", ")}`);
await mkdir("public/licenses", { recursive: true });
manifest.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
await writeFile("public/licenses/manifest.json", JSON.stringify({ application: "Chess Review", version: lock.version, packages: manifest }, null, 2) + "\n");
await writeFile("public/licenses/THIRD-PARTY-NOTICES.txt", "Chess Review third-party notices\nGenerated from installed, locked distribution dependencies.\nThese notices describe dependencies; they do not change their licenses.\n" + notices.join(""));
console.log(`Prepared notices for ${manifest.length} installed distribution packages and bundled Next.js notices.`);
