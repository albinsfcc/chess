// Developer-only production measurement. Start `npm start` before running this.
import { chromium } from "@playwright/test";

const browser = await chromium.launch({ channel: "msedge" });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(process.argv[2] ?? "http://localhost:3000");
  await page.getByTestId("square-e2").waitFor();
  await page.waitForTimeout(1000); // Fixed idle observation interval; not an application wait.
  const initial = await page.evaluate(() => {
    const resources = performance.getEntriesByType("resource");
    return {
      decodedJavaScriptBytes: resources.filter((entry) => entry.name.includes(".js")).reduce((total, entry) => total + entry.decodedBodySize, 0),
      engineAssets: resources.filter((entry) => entry.name.includes("/engines/")).map((entry) => entry.name),
    };
  });
  const moves = Array.from({ length: 50 }, (_, i) => `${i * 2 + 1}. Nf3 Nf6 ${i * 2 + 2}. Ng1 Ng8`).join(" ");
  const pgn = Array.from({ length: 40 }, (_, i) => `[Event "Load ${i}"]\n[White "Player ${i}"]\n[Black "Opponent"]\n\n${moves} *`).join("\n\n");
  await page.getByRole("button", { name: "Paste PGN", exact: true }).click();
  await page.getByLabel("PGN games", { exact: true }).fill(pgn);
  await page.evaluate(() => {
    window.audit = { tasks: [], frames: 0, running: true };
    window.audit.observer = new PerformanceObserver((list) => window.audit.tasks.push(...list.getEntries().map((entry) => entry.duration)));
    window.audit.observer.observe({ type: "longtask" });
    const tick = () => { window.audit.frames++; if (window.audit.running) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  const started = Date.now();
  await page.getByRole("button", { name: "Validate", exact: true }).click();
  await page.getByRole("button", { name: "Import 40 games", exact: true }).waitFor({ timeout: 60_000 });
  const durationMs = Date.now() - started;
  const validation = await page.evaluate(() => {
    window.audit.running = false; window.audit.observer.disconnect();
    return { longTasksMs: window.audit.tasks, animationFrames: window.audit.frames };
  });
  console.log(JSON.stringify({ initial, pgnBytes: Buffer.byteLength(pgn), positions: 8000, durationMs, ...validation }, null, 2));
} finally { await browser.close(); }
