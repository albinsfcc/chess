import { expect, test } from "@playwright/test";
import { build } from "esbuild";

test("import review continues with its modal closed and can be reopened or paused", async ({ page }) => {
  test.setTimeout(60000);
  const worker = (await build({ entryPoints: ["tests/fixtures/game-analysis-worker.ts"], bundle: true, write: false, format: "iife", platform: "browser" })).outputFiles[0].text;
  await page.route("**/engines/analysis-worker.js", route => route.fulfill({ contentType: "application/javascript", body: worker }));
  await page.goto("/");
  if (await page.getByRole("button", { name: "Import", exact: true }).isVisible()) await page.getByRole("button", { name: "Import", exact: true }).click();
  await page.getByRole("button", { name: "Paste PGN", exact: true }).click();
  await page.getByLabel("PGN games", { exact: true }).fill('[White "Background"]\n[Black "Review"]\n1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. d3 d6 1-0');
  await page.getByRole("button", { name: "Import 1 game", exact: true }).click();
  await page.getByRole("button", { name: "Continue in background", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Next move", exact: true }).click();
  await expect(page.getByTestId("square-e4")).toHaveAttribute("aria-label", "e4, White pawn");
  const progress = page.getByRole("button", { name: /^View analysis/ });
  await expect(progress).toHaveText(/View analysis \([1-8]\/9\)/);
  await progress.click();
  await expect(page.getByTestId("review-progress")).toContainText("running");
  await page.getByRole("button", { name: "Close and pause", exact: true }).click();
  await expect(page.getByRole("button", { name: "Resume review", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Resume review", exact: true }).click();
  await page.getByRole("button", { name: "Continue in background", exact: true }).click();
  await expect(page.getByRole("button", { name: "View review", exact: true })).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "View review", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Review Ready", exact: true })).toBeVisible();
});
