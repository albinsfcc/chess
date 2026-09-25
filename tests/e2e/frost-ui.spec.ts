import { expect, test } from "@playwright/test";
import { build } from "esbuild";
import { annotatedPgn } from "../../src/lib/pgn/fixtures";

for (const [name, width, height] of [["desktop", 1440, 1000], ["tablet", 820, 1180], ["mobile", 390, 844], ["landscape", 844, 390]] as const) {
  test(`Frost ${name}: board, inspector, keyboard tabs and dialog fit`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    const board = page.getByTestId("chessboard");
    await expect(board).toBeVisible();
    await expect(page.getByTestId("square-e2")).toBeVisible();
    await page.getByTestId("square-e2").click(); await page.getByTestId("square-e4").click();
    await expect(page.getByTestId("square-e4")).toHaveAttribute("aria-label", "e4, White pawn");
    await page.getByRole("tab", { name: "Engine", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Engine analysis" })).toBeVisible();
    await page.getByRole("tab", { name: "Engine", exact: true }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "Opening", exact: true })).toHaveAttribute("aria-selected", "true");
    await page.getByRole("tab", { name: "Moves", exact: true }).click();
    await expect(page.getByRole("button", { name: "Go to move 1, White: e4" })).toBeVisible();
    const bounds = await board.boundingBox();
    expect(bounds).not.toBeNull();
    expect(Math.abs(bounds!.width - bounds!.height)).toBeLessThan(3);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    if (width >= 900) {
      const navigation = await page.getByTestId("board-navigation").boundingBox();
      expect(navigation!.y + navigation!.height).toBeLessThanOrEqual(height);
    }
    await page.screenshot({ path: `artifacts/frost-${name}.png`, fullPage: true });
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    const dialog = await page.getByRole("dialog").boundingBox();
    expect(dialog!.x).toBeGreaterThanOrEqual(0); expect(dialog!.x + dialog!.width).toBeLessThanOrEqual(width);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Settings", exact: true })).toBeFocused();
  });
}

test("Frost at 200% enlargement preserves reachable controls", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
  await expect(page.getByRole("button", { name: "Flip", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Flip", exact: true }).click();
  await expect(page.getByTestId("chessboard")).toHaveAttribute("data-orientation", "black");
  expect((await page.getByTestId("chessboard").boundingBox())!.width).toBeGreaterThan(180);
  await page.screenshot({ path: "artifacts/frost-zoom.png", fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test("Frost preserves imported review, variation navigation and engine controls across tabs", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  const worker = (await build({ entryPoints: ["tests/fixtures/game-analysis-worker.ts"], bundle: true, write: false, format: "iife", platform: "browser" })).outputFiles[0].text;
  await page.route("**/engines/analysis-worker.js", route => route.fulfill({ contentType: "application/javascript", body: worker }));
  await page.goto("/");
  await page.getByRole("button", { name: "Paste PGN", exact: true }).click();
  await page.getByLabel("PGN games", { exact: true }).fill(annotatedPgn);
  await page.getByRole("button", { name: "Import 1 game", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Reviewing game" })).toBeVisible();
  await page.getByRole("button", { name: "Start review", exact: true }).click({ timeout: 20000 });
  await expect(page.getByRole("region", { name: "Game review card", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Variation 1... Nf6", exact: true }).click();
  await expect(page.getByTestId("square-f6")).toHaveAttribute("aria-label", "f6, Black knight");
  await page.getByRole("tab", { name: "Engine", exact: true }).click();
  await expect(page.getByRole("region", { name: "Complete-game analysis", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Analyze Position", exact: true }).click();
  await expect(page.getByTestId("engine-best-move")).toBeVisible();
  await page.screenshot({ path: "artifacts/frost-engine.png", fullPage: true });
  await page.getByRole("tab", { name: "Moves", exact: true }).click();
  await expect(page.getByTestId("square-f6")).toHaveAttribute("aria-label", "f6, Black knight");
  await page.getByRole("button", { name: "Return to main line" }).click();
  await page.screenshot({ path: "artifacts/frost-review.png", fullPage: true });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.screenshot({ path: "artifacts/frost-dialog.png", fullPage: true });
  await page.getByLabel("Light squares", { exact: true }).fill("#e0d6c4");
  await page.keyboard.press("Escape");
  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByLabel("Light squares", { exact: true })).toHaveValue("#e0d6c4");
  expect(errors).toEqual([]);
});
