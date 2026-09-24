import { expect, test, type Page } from "@playwright/test";
import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import { annotatedPgn } from "../../src/lib/pgn/fixtures";

let workerSource: string;
test.beforeAll(async () => {
  const built = await build({ entryPoints: ["tests/fixtures/game-analysis-worker.ts"], bundle: true, write: false, format: "iife", platform: "browser" });
  workerSource = built.outputFiles[0].text;
});
test.beforeEach(async ({ page }) => {
  await page.route("**/engines/analysis-worker.js", (route) => route.fulfill({ contentType: "application/javascript", body: workerSource }));
  await page.goto("/");
  await page.getByRole("button", { name: "Paste PGN", exact: true }).click();
  await page.getByLabel("PGN games", { exact: true }).fill(annotatedPgn);
  await page.getByRole("button", { name: "Validate", exact: true }).click();
  await page.getByRole("button", { name: "Import 1 game", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).last().click();
  await page.getByRole("button", { name: "Open Alice vs Bob", exact: true }).click();
});
async function start(page: Page, variation = false) {
  await page.getByRole("button", { name: "Analyze game", exact: true }).click();
  if (variation) await page.getByLabel("Line to analyze", { exact: true }).selectOption("variation");
  await page.getByLabel("Game analysis preset", { exact: true }).selectOption("quick");
  await expect(page.getByLabel("Approximate workload")).toContainText("Approximate");
  await page.getByRole("button", { name: "Start game analysis", exact: true }).click();
}
async function partial(page: Page) {
  await expect.poll(async () => {
    const value = await page.getByTestId("queue-progress").textContent();
    return !!value && /^[1-4] \/ 5 positions · running/.test(value);
  }).toBe(true);
}
test("full-game queue pauses, reloads, resumes, navigates the graph and exports annotated PGN", async ({ page }) => {
  test.setTimeout(60_000);
  await start(page); await partial(page);
  await page.getByRole("button", { name: "Pause queue", exact: true }).click();
  await expect(page.getByTestId("queue-progress")).toContainText("paused");
  const progress = await page.getByTestId("queue-progress").textContent();
  await page.getByLabel("Navigate evaluation graph", { exact: true }).selectOption("4");
  await expect(page.getByLabel("Saved position analysis")).toContainText("not analyzed");
  await expect(page.getByTestId("square-c6")).toHaveAttribute("aria-label", "c6, Black knight");
  await page.reload();
  await page.getByRole("button", { name: /Open Main line analysis/ }).first().click();
  await expect(page.getByTestId("queue-progress")).toHaveText(progress!);
  await page.getByRole("button", { name: "Resume queue", exact: true }).click();
  await expect(page.getByTestId("queue-progress")).toHaveText("5 / 5 positions · completed", { timeout: 15_000 });
  await page.getByLabel("Navigate evaluation graph", { exact: true }).selectOption("1");
  await expect(page.getByTestId("square-e4")).toHaveAttribute("aria-label", "e4, White pawn");
  await expect(page.getByRole("button", { name: "Main line 1. e4", exact: true })).toHaveAttribute("aria-current", "step");
  await expect(page.getByLabel("Played move evaluation")).toContainText("Played move: e4");
  await expect(page.getByLabel("Played move evaluation")).toContainText("Loss:");
  await expect(page.getByTestId("chessboard")).toHaveAttribute("data-best-move", /^[a-h][1-8][a-h][1-8]/);
  await page.getByRole("button", { name: /^Ply 2:/ }).click();
  await expect(page.getByTestId("square-e5")).toHaveAttribute("aria-label", "e5, Black pawn");
  await page.getByRole("button", { name: /^Ply 2:/ }).focus();
  await page.keyboard.press("ArrowRight"); await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("button", { name: /^Ply 4:/ })).toHaveAttribute("aria-current", "step");
  const download = page.waitForEvent("download"); await page.getByRole("button", { name: "Export annotated PGN", exact: true }).click();
  const file = await (await download).path(); expect(file).not.toBeNull(); const exported = await readFile(file!, "utf8");
  for (const text of ["[%eval", "best line:", "Opening note", "Centre", "Indian defence", "Nf6", "$1"]) expect(exported).toContain(text);
  const counts = await page.evaluate(() => new Promise<number[]>((resolve, reject) => {
    const opening = indexedDB.open("chess-review"); opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const db = opening.result, request = db.transaction("positionAnalyses").objectStore("positionAnalyses").getAll();
      request.onsuccess = () => { const rows = request.result as { id: string }[]; resolve([rows.length, new Set(rows.map((row) => row.id)).size]); db.close(); };
    };
  }));
  expect(counts).toEqual([5, 5]);
  await page.screenshot({ path: `artifacts/game-analysis-${page.viewportSize()?.width}.png`, fullPage: true });
});
test("cancelled queues resume, and selected recursive variations retain separate results", async ({ page }) => {
  test.setTimeout(60_000);
  await start(page); await partial(page);
  await page.getByRole("button", { name: "Cancel queue", exact: true }).click();
  await expect(page.getByTestId("queue-progress")).toContainText("cancelled");
  await page.getByRole("button", { name: "Resume queue", exact: true }).click();
  await expect(page.getByTestId("queue-progress")).toHaveText("5 / 5 positions · completed", { timeout: 15_000 });
  await page.getByRole("button", { name: "Variation 1... Nf6", exact: true }).click();
  await start(page, true);
  await expect(page.getByTestId("queue-progress")).toHaveText("3 / 3 positions · completed", { timeout: 15_000 });
  await page.getByLabel("Navigate evaluation graph", { exact: true }).selectOption("2");
  await expect(page.getByTestId("square-f6")).toHaveAttribute("aria-label", "f6, Black knight");
  await expect(page.getByTestId("square-d4")).toHaveAttribute("aria-label", "d4, White pawn");
  await page.getByRole("button", { name: "Return to main line", exact: true }).click();
  await page.getByLabel("Saved analysis", { exact: true }).selectOption({ label: "Main line · quick / 3 PV · 5/5 · completed" });
  await expect(page.getByLabel("Saved position analysis")).toContainText("Depth 12");
  await page.getByLabel("Saved analysis", { exact: true }).selectOption({ label: "Variation 0.0.1.0 · quick / 3 PV · 3/3 · completed" });
  await page.getByLabel("Navigate evaluation graph", { exact: true }).selectOption("2");
  await expect(page.getByLabel("Saved position analysis")).toContainText("After 1... Nf6");
});
test("refresh during a running queue offers recovery without claiming background computation", async ({ page }) => {
  await start(page); await partial(page); await page.reload();
  await page.getByRole("button", { name: /Open Main line analysis/ }).first().click();
  await expect(page.getByTestId("queue-progress")).toContainText("paused");
  await expect(page.getByLabel("Complete-game analysis")).toContainText("previous tab session ended");
  await expect(page.getByRole("button", { name: "Resume queue", exact: true })).toBeEnabled();
});
