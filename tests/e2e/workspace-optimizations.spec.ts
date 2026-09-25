import { expect, test, type Page } from "@playwright/test";
import { build } from "esbuild";
async function openPgn(page: Page, pgn = '[White "Keyboard"]\n[Black "Test"]\n1. e4 e5 2. Nf3 *') {
  await page.getByRole("button", { name: "Paste PGN", exact: true }).click();
  await page.getByLabel("PGN games", { exact: true }).fill(pgn);
  await page.getByRole("button", { name: "Validate", exact: true }).click();
  await page.getByRole("button", { name: "Import 1 game", exact: true }).click();
  await expect(page.getByRole("button", { name: "Validate", exact: true })).toBeEnabled();
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).last().click();
  await page.getByRole("button", { name: "Open Keyboard vs Test", exact: true }).click();
  await expect(page.getByRole("button", { name: "Next move", exact: true })).toBeEnabled();
}
test("desktop board, players and navigation fit while only the cards scroll", async ({ page }) => {
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 1280, height: 720 }, { width: 1024, height: 768 }]) {
    await page.setViewportSize(viewport); await page.goto("/");
    await expect(page.getByTestId("chessboard")).toBeVisible();
    await expect.poll(async () => (await page.getByTestId("board-navigation").boundingBox())!.y + (await page.getByTestId("board-navigation").boundingBox())!.height).toBeLessThanOrEqual(viewport.height);
    for (const id of ["top-player", "bottom-player", "chessboard"]) {
      const box = (await page.getByTestId(id).boundingBox())!;
      expect(box.y).toBeGreaterThan(0); expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    }
    const board = (await page.getByTestId("chessboard").boundingBox())!, bar = (await page.getByTestId("evaluation-bar").boundingBox())!;
    expect(bar.x).toBeGreaterThanOrEqual(board.x + board.width);
    const panel = page.getByLabel("Game workspace panels", { exact: true });
    await panel.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    expect((await page.getByTestId("chessboard").boundingBox())!.y).toBe(board.y);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
    await expect(page.getByRole("banner").getByRole("button", { name: "Import from Chess.com", exact: true })).toBeVisible();
  }
});
test("four arrow keys navigate recorded moves without stealing dialog input", async ({ page }) => {
  await page.goto("/"); await openPgn(page);
  await page.keyboard.press("ArrowDown"); await expect(page.getByRole("button", { name: "Main line 2. Nf3", exact: true })).toHaveAttribute("aria-current", "step");
  await page.keyboard.press("ArrowLeft"); await expect(page.getByRole("button", { name: "Main line 1... e5", exact: true })).toHaveAttribute("aria-current", "step");
  await page.keyboard.press("ArrowUp"); await expect(page.getByTestId("square-e2")).toHaveAttribute("aria-label", "e2, White pawn");
  await page.keyboard.press("ArrowRight"); await expect(page.getByRole("button", { name: "Main line 1. e4", exact: true })).toHaveAttribute("aria-current", "step");
  await page.getByRole("button", { name: "Settings", exact: true }).click(); await page.keyboard.press("ArrowDown");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("button", { name: "Main line 1. e4", exact: true })).toHaveAttribute("aria-current", "step");
});
test("top-move arrows, smooth evaluation and opponent threats follow preferences and navigation", async ({ page }) => {
  const worker = (await build({ entryPoints: ["tests/fixtures/game-analysis-worker.ts"], bundle: true, write: false, format: "iife", platform: "browser" })).outputFiles[0].text;
  await page.route("**/engines/analysis-worker.js", (route) => route.fulfill({ contentType: "application/javascript", body: worker }));
  await page.emulateMedia({ reducedMotion: "no-preference" }); await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click(); await page.getByLabel("Principal variations count", { exact: true }).selectOption("5");
  await page.getByRole("switch", { name: "Show threats", exact: true }).click(); await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Analyze Position", exact: true }).click();
  await expect(page.locator('[data-arrow-count="5"]')).toHaveCount(1);
  await expect(page.getByLabel("Principal variations", { exact: true }).locator("li")).toHaveCount(5);
  expect(await page.locator(".evaluation-white").evaluate((element) => getComputedStyle(element).transitionDuration)).toContain("0.45s");
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await page.locator(".evaluation-white").evaluate((element) => getComputedStyle(element).transitionDuration)).not.toContain("0.45s");
  await openPgn(page, '[White "Keyboard"]\n[Black "Test"]\n[SetUp "1"]\n[FEN "r3k3/8/8/8/8/Q7/8/4K3 w - - 0 1"]\n1. Qb3 *');
  await expect(page.getByLabel("Opponent threats", { exact: true })).toContainText("Rxa3");
  await expect(page.locator('[data-threat-count="1"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Next move", exact: true }).click();
  await expect(page.getByLabel("Opponent threats", { exact: true })).not.toContainText("Rxa3");
  await page.reload(); await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByLabel("Principal variations count", { exact: true })).toHaveValue("5");
  await expect(page.getByRole("switch", { name: "Show threats", exact: true })).toBeChecked();
});
test("completed game analysis labels moves without replacing the original notation", async ({ page }) => {
  const worker = (await build({ entryPoints: ["tests/fixtures/game-analysis-worker.ts"], bundle: true, write: false, format: "iife", platform: "browser" })).outputFiles[0].text;
  await page.route("**/engines/analysis-worker.js", (route) => route.fulfill({ contentType: "application/javascript", body: worker }));
  await page.goto("/"); await openPgn(page);
  await page.getByRole("button", { name: "Review game", exact: true }).click();
  await page.getByRole("button", { name: "Start review", exact: true }).click();
  await expect(page.getByTestId("queue-progress")).toContainText("completed", { timeout: 15_000 });
  const move = page.getByRole("button", { name: "Main line 1. e4", exact: true });
  await expect(move).toContainText("Book"); await move.click();
  await expect(page.getByLabel("Move assessment", { exact: true })).toContainText("Book");
  await expect(page.getByTestId("square-e4")).toHaveAttribute("aria-label", "e4, White pawn");
  const badge = page.getByTestId("board-move-badge");
  await expect(badge).toHaveAttribute("data-square", "e4");
  await expect(badge).toHaveAccessibleName(/e4: Book/);
  await expect(badge.locator("img")).toHaveAttribute("src", "/icons/moves/book.svg");
  for (const square of ["e2", "e4"]) await expect(page.getByTestId(`square-${square}`)).toHaveAttribute("data-move-strength", "Book");
  await badge.click(); await expect(badge).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("status").filter({ hasText: "e4 · Book" })).toBeVisible();
  await page.getByTestId("chessboard").screenshot({ path: `artifacts/board-badge-${page.viewportSize()?.width}.png` });
  await page.getByRole("button", { name: "Flip", exact: true }).click();
  const square = (await page.getByTestId("square-e4").boundingBox())!, marker = (await badge.boundingBox())!;
  expect(marker.x).toBeGreaterThanOrEqual(square.x - 1); expect(marker.x + marker.width).toBeLessThanOrEqual(square.x + square.width + 1);
  expect(marker.y).toBeGreaterThanOrEqual(square.y - 1); expect(marker.y + marker.height).toBeLessThanOrEqual(square.y + square.height + 1);
  await page.getByTestId("square-e4").click(); await expect(badge).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("button", { name: "First position", exact: true }).click(); await expect(badge).toHaveCount(0);
  await move.click(); await expect(badge).toHaveAttribute("data-square", "e4");
  await page.reload(); await page.getByRole("button", { name: "Open Keyboard vs Test", exact: true }).click();
  await move.click(); await expect(badge).toHaveAccessibleName(/e4: Book/);
  await page.getByTestId("square-d7").click(); await page.getByTestId("square-d5").click();
  await expect(badge).toHaveAccessibleName(/d5: Book/);
});

for (const label of ["Brilliant", "Blunder"] as const) test(`${label} SVG and matching previous-move highlights survive flipping and clear on reset`, async ({ page }) => {
  const worker = (await build({ entryPoints: ["tests/fixtures/strength-worker.ts"], bundle: true, write: false, format: "iife", platform: "browser" })).outputFiles[0].text;
  await page.route("**/engines/analysis-worker.js", (route) => route.fulfill({ contentType: "application/javascript", body: worker }));
  await page.goto("/");
  const pgn = label === "Brilliant" ? '[White "Keyboard"]\n[Black "Test"]\n[SetUp "1"]\n[FEN "r3k3/8/8/8/8/8/8/R3K3 w - - 0 1"]\n1. Ra7 *' : '[White "Keyboard"]\n[Black "Test"]\n[SetUp "1"]\n[FEN "k7/8/8/8/8/8/4P3/6K1 w - - 0 1"]\n1. e4 *';
  await openPgn(page, pgn); await page.getByRole("button", { name: "Review game", exact: true }).click();
  await page.getByRole("button", { name: "Start review", exact: true }).click();
  await expect(page.getByTestId("queue-progress")).toContainText("completed");
  await page.getByRole("button", { name: "Last move", exact: true }).click();
  const badge = page.getByTestId("board-move-badge"), squares = label === "Brilliant" ? ["a1", "a7"] : ["e2", "e4"];
  await expect(badge).toHaveAccessibleName(new RegExp(label));
  await expect(badge.locator("img")).toHaveAttribute("src", `/icons/moves/${label.toLowerCase()}.svg`);
  const color = label === "Brilliant" ? "33, 182, 165" : "237, 81, 70";
  for (const square of squares) {
    await expect(page.getByTestId(`square-${square}`)).toHaveAttribute("data-move-strength", label);
    expect(await page.getByTestId(`square-${square}`).evaluate((element) => getComputedStyle(element).backgroundImage)).toContain(color);
  }
  await page.getByTestId("chessboard").screenshot({ path: `artifacts/strength-${label}-${page.viewportSize()?.width}.png` });
  await page.getByRole("button", { name: "Flip", exact: true }).click(); await expect(badge).toHaveAttribute("data-square", squares[1]);
  await page.getByRole("button", { name: "First position", exact: true }).click();
  await expect(badge).toHaveCount(0); await expect(page.locator("[data-move-strength]")).toHaveCount(0);
  await page.getByText("Move strength icons", { exact: true }).click();
  await expect(page.getByLabel("Move strength legend").locator("img")).toHaveCount(12);
  await page.getByLabel("Move strength legend").screenshot({ path: `artifacts/strength-legend-${page.viewportSize()?.width}.png` });
});
