import { expect, test, type Page } from "@playwright/test";
import { annotatedPgn } from "../../src/lib/pgn/fixtures";

async function importPgn(page: Page, input: string) {
  await page.getByRole("button", { name: "Paste PGN", exact: true }).click();
  await page.getByLabel("PGN games", { exact: true }).fill(input);
  await page.getByRole("button", { name: "Validate", exact: true }).click();
}

test.beforeEach(async ({ page }) => { await page.goto("/"); });

test("import, open, navigate variations and reload the persistent game library", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.getByRole("button", { name: "Flip", exact: true }).click();
  await importPgn(page, annotatedPgn);
  await expect(page.getByLabel("Import preview")).toContainText("1 valid games");
  await page.getByRole("button", { name: "Import 1 game", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Imported 1 game." })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).last().click();
  await page.getByRole("button", { name: "Open Alice vs Bob", exact: true }).click();
  await expect(page.getByLabel("Game headers")).toContainText("Alice (1600) vs Bob (1550)");
  await expect(page.getByTestId("chessboard")).toHaveAttribute("data-orientation", "black");
  await expect(page.getByTestId("square-e2")).toHaveAttribute("aria-label", "e2, White pawn");
  await page.getByRole("button", { name: "Next move", exact: true }).click();
  await expect(page.getByTestId("square-e4")).toHaveAttribute("aria-label", "e4, White pawn");
  await expect(page.getByLabel("Position comments")).toContainText("Centre");
  await expect(page.getByLabel("Position comments")).toContainText("$1");
  await page.getByRole("button", { name: "Variation 1... Nf6", exact: true }).click();
  await expect(page.getByTestId("square-d4")).toHaveAttribute("aria-label", "d4, White pawn");
  await expect(page.getByTestId("square-f6")).toHaveAttribute("aria-label", "f6, Black knight");
  await expect(page.getByLabel("Position comments")).toContainText("Indian defence");
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("square-g8")).toHaveAttribute("aria-label", "g8, Black knight");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("square-f6")).toHaveAttribute("aria-label", "f6, Black knight");
  await page.getByRole("button", { name: "Return to main line", exact: true }).click();
  await expect(page.getByTestId("square-e5")).toHaveAttribute("aria-label", "e5, Black pawn");
  await expect(page.getByTestId("square-d2")).toHaveAttribute("aria-label", "d2, White pawn");
  await page.keyboard.press("End");
  await expect(page.getByTestId("square-c6")).toHaveAttribute("aria-label", "c6, Black knight");
  await page.keyboard.press("Home");
  await expect(page.getByTestId("square-e2")).toHaveAttribute("aria-label", "e2, White pawn");
  await page.screenshot({ path: `artifacts/pgn-viewer-${page.viewportSize()?.width}.png`, fullPage: true });
  await page.reload();
  await expect(page.getByRole("button", { name: "Open Alice vs Bob", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Open Alice vs Bob", exact: true }).click();
  await page.getByRole("button", { name: "Main line 2. Nf3", exact: true }).click();
  await expect(page.getByTestId("square-f3")).toHaveAttribute("aria-label", "f3, White knight");
  const preferences = await page.evaluate(() => Object.values(localStorage));
  expect(preferences.join(" ")).not.toContain("Alice");
  expect(errors).toEqual([]);
});

test("mixed import preserves input, skips duplicates, stores unsupported games and confirms deletion", async ({ page }) => {
  const input = `${annotatedPgn}\n\n${annotatedPgn}\n\n[Variant "Atomic"]\n[White "Atomic player"]\n1. e5 *\n\n[Event "Bad"]\n1. e5 *`;
  await importPgn(page, input);
  const preview = page.getByLabel("Import preview");
  for (const summary of ["1 valid games", "1 duplicates", "1 unsupported variants", "1 invalid games"]) await expect(preview).toContainText(summary);
  await expect(page.getByLabel("PGN games", { exact: true })).toHaveValue(input);
  await page.getByText("Game 4: invalid", { exact: false }).click();
  await expect(page.getByText('Illegal move "e5"', { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Import 2 games", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).last().click();
  await expect(page.getByRole("button", { name: "Open Atomic player vs Unknown Black", exact: true })).toBeDisabled();
  await importPgn(page, annotatedPgn);
  await expect(preview).toContainText("1 duplicates");
  await expect(page.getByRole("button", { name: "Import", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Delete Alice vs Bob", exact: true }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("button", { name: "Open Alice vs Bob", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Delete Alice vs Bob", exact: true }).click();
  await page.getByRole("button", { name: "Delete game", exact: true }).click();
  await expect(page.getByRole("button", { name: "Open Alice vs Bob", exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("button", { name: "Open Atomic player vs Unknown Black", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open Alice vs Bob", exact: true })).toHaveCount(0);
});

test("custom FEN opens at its starting position and validation is invalidated by edits", async ({ page }) => {
  await importPgn(page, '[White "Promotion"]\n[SetUp "1"]\n[FEN "7k/P7/8/8/8/8/8/7K w - - 0 1"]\n1. a8=Q+ *');
  await expect(page.getByRole("button", { name: "Import 1 game", exact: true })).toBeEnabled();
  await page.getByLabel("PGN games", { exact: true }).fill("not PGN");
  await expect(page.getByRole("button", { name: "Import", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Validate", exact: true }).click();
  await expect(page.getByLabel("Import preview")).toContainText("1 invalid games");
  await page.getByLabel("PGN games", { exact: true }).fill('[White "Promotion"]\n[SetUp "1"]\n[FEN "7k/P7/8/8/8/8/8/7K w - - 0 1"]\n1. a8=Q+ *');
  await page.getByRole("button", { name: "Validate", exact: true }).click();
  await page.getByRole("button", { name: "Import 1 game", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).last().click();
  await page.getByRole("button", { name: "Open Promotion vs Unknown Black", exact: true }).click();
  await expect(page.getByTestId("square-a7")).toHaveAttribute("aria-label", "a7, White pawn");
  await page.getByRole("button", { name: "Last move", exact: true }).click();
  await expect(page.getByTestId("square-a8")).toHaveAttribute("aria-label", "a8, White queen");
});

test("IndexedDB failures show an actionable error without losing pasted PGN", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "indexedDB", { get() { throw new DOMException("Storage blocked", "SecurityError"); } });
  });
  await page.reload();
  await expect(page.getByRole("region", { name: "Game library", exact: true }).getByRole("alert")).toContainText("Could not access the local game library");
  await importPgn(page, annotatedPgn);
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("Could not access the local game library");
  await expect(page.getByLabel("PGN games", { exact: true })).toHaveValue(annotatedPgn);
  await expect(page.getByRole("button", { name: "Import", exact: true })).toBeDisabled();
});
