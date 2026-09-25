import { expect, test, type Page } from "@playwright/test";
import { build } from "esbuild";
import { annotatedPgn } from "../../src/lib/pgn/fixtures";
let worker: string;
test.beforeAll(async () => { worker = (await build({ entryPoints: ["tests/fixtures/game-analysis-worker.ts"], bundle: true, write: false, format: "iife", platform: "browser" })).outputFiles[0].text; });
async function setup(page: Page) {
  await page.goto("/"); await page.getByRole("button", { name: "Paste PGN", exact: true }).click();
  await page.getByLabel("PGN games", { exact: true }).fill(annotatedPgn);
  await page.getByRole("button", { name: "Validate", exact: true }).click();
  await page.getByRole("button", { name: "Import 1 game", exact: true }).click();
  await expect(page.getByRole("button", { name: "Validate", exact: true })).toBeEnabled();
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).last().click();
  await page.getByRole("button", { name: "Open Alice vs Bob", exact: true }).click();
}
async function partial(page: Page) { await expect(page.getByTestId("review-progress")).toContainText(/^[1-3] \/ 5 positions/); }
async function finish(page: Page) {
  await expect(page.getByRole("button", { name: "Start review", exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("dialog").getByLabel("White accuracy", { exact: true })).toHaveText(/\d+\.\d/);
  await page.getByRole("button", { name: "Start review", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
}
test("global settings drive one-click full main-line review and summary moves to the top card", async ({ page }) => {
  await page.route("**/engines/analysis-worker.js", (route) => route.fulfill({ contentType: "application/javascript", body: worker }));
  await setup(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Analysis preset", { exact: true }).selectOption("quick");
  await page.getByLabel("Principal variations count", { exact: true }).selectOption("2");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Variation 1... Nf6", exact: true }).click();
  await page.getByRole("button", { name: "Review game", exact: true }).click();
  await expect(page.getByRole("dialog").locator("select,input")).toHaveCount(0);
  await expect(page.getByTestId("review-progress")).toContainText("/ 5 positions");
  await expect(page.getByRole("dialog").getByLabel("Approximate workload")).toContainText("1.3 seconds");
  await finish(page);
  const card = page.getByRole("region", { name: "Game review card", exact: true });
  await expect(card).toBeVisible(); await expect(card).toContainText("4 / 4 moves graded");
  await expect(card).toContainText("quick · 2 lines");
  expect(await page.getByLabel("Game workspace panels", { exact: true }).locator(":scope > section").first().getAttribute("aria-label")).toBe("Game review card");
  await card.getByLabel("Navigate evaluation graph", { exact: true }).selectOption("1");
  await expect(page.getByTestId("square-e4")).toHaveAttribute("aria-label", "e4, White pawn");
  await page.reload(); await page.getByRole("button", { name: "Open Alice vs Bob", exact: true }).click();
  await expect(card).toContainText("4 / 4 moves graded");
  await page.getByRole("button", { name: "Review game", exact: true }).click(); await finish(page);
  await page.screenshot({ path: `artifacts/review-summary-${page.viewportSize()?.width}.png`, fullPage: true });
});
test("closing stops review, reload preserves progress, reopening resumes without duplicate rows", async ({ page }) => {
  await page.route("**/engines/analysis-worker.js", (route) => route.fulfill({ contentType: "application/javascript", body: worker }));
  await setup(page); await page.getByRole("button", { name: "Review game", exact: true }).click(); await partial(page);
  await page.getByRole("button", { name: "Close and pause", exact: true }).click();
  await expect(page.getByTestId("queue-progress")).toContainText("paused");
  const saved = await page.getByTestId("queue-progress").textContent();
  await page.waitForTimeout(1100); await expect(page.getByTestId("queue-progress")).toHaveText(saved!);
  await page.reload(); await page.getByRole("button", { name: "Open Alice vs Bob", exact: true }).click();
  await page.getByRole("button", { name: "Review game", exact: true }).click(); await finish(page);
  const counts = await page.evaluate(() => new Promise<number[]>((resolve) => {
    const opening = indexedDB.open("chess-review"); opening.onsuccess = () => {
      const db = opening.result, transaction = db.transaction(["gameAnalyses", "positionAnalyses"]), sessions = transaction.objectStore("gameAnalyses").count(), positions = transaction.objectStore("positionAnalyses").count();
      transaction.oncomplete = () => { resolve([sessions.result, positions.result]); db.close(); };
    };
  })); expect(counts).toEqual([1, 5]);
});
test("hidden-tab pause resumes automatically while review modal stays open", async ({ page }) => {
  await page.route("**/engines/analysis-worker.js", (route) => route.fulfill({ contentType: "application/javascript", body: worker }));
  await setup(page); await page.getByRole("button", { name: "Review game", exact: true }).click(); await partial(page);
  await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" }); document.dispatchEvent(new Event("visibilitychange")); });
  await expect(page.getByTestId("review-progress")).toContainText("paused");
  await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" }); document.dispatchEvent(new Event("visibilitychange")); });
  await finish(page);
});
test("failed review exposes retry and retains completed work", async ({ page }) => {
  let loads = 0;
  await page.route("**/engines/analysis-worker.js", (route) => {
    const faulty = 'let reviewSearches = 0;\n' + worker.replace('const request = data.request', 'if (++reviewSearches === 2) { scope.postMessage({type:"error", message:"Test worker interrupted"}); return; } const request = data.request');
    return route.fulfill({ contentType: "application/javascript", body: ++loads === 1 ? faulty : worker });
  });
  await setup(page); await page.getByRole("button", { name: "Review game", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("Test worker interrupted");
  await expect(page.getByTestId("review-progress")).toContainText("1 / 5");
  await page.getByRole("button", { name: "Retry review", exact: true }).click(); await finish(page);
  expect(loads).toBe(2);
});
