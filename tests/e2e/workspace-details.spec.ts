import { expect, test, type Page } from "@playwright/test";
import { build } from "esbuild";
const clockPgn = '[White "Alice"]\n[Black "Bob"]\n[WhiteElo "1600"]\n[TimeControl "300+2"]\n1. e4 {[%clk 0:04:59.250]} (1. d4 {[%clk 0:04:58.1]} d5 {[%clk 0:04:57.9]}) d5 {[%clk 0:04:56]} 2. exd5 *';
async function openGame(page: Page, pgn = clockPgn, name = "Alice vs Bob") {
  await page.getByRole("button", { name: "Paste PGN", exact: true }).click();
  await page.getByLabel("PGN games", { exact: true }).fill(pgn); await page.getByRole("button", { name: "Validate", exact: true }).click();
  await page.getByRole("button", { name: "Import 1 game", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).last().click();
  await page.getByRole("button", { name: `Open ${name}`, exact: true }).click();
}
test("player panels swap fully, reconstruct clocks/captures and follow variations", async ({ page }) => {
  await page.goto("/"); await openGame(page);
  await expect(page.getByTestId("top-player")).toContainText("Bob"); await expect(page.getByTestId("bottom-player")).toContainText("Alice (1600)");
  await expect(page.getByLabel("White clock: 5:00", { exact: true })).toBeVisible();
  await expect(page.getByTestId("evaluation-bar")).toHaveText("—");
  await page.getByRole("button", { name: "Last move", exact: true }).click();
  await expect(page.getByLabel("White clock: 4:59.250", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Black clock: 4:56", { exact: true })).toBeVisible();
  await expect(page.getByLabel("White captured: pawn", { exact: true })).toBeVisible();
  await expect(page.getByLabel("White material advantage 1", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Flip", exact: true }).click();
  await expect(page.getByTestId("top-player")).toContainText("Alice (1600)"); await expect(page.getByTestId("top-player")).toContainText("4:59.250");
  await page.getByRole("button", { name: "Variation 1... d5", exact: true }).click();
  await expect(page.getByLabel("White clock: 4:58.1", { exact: true })).toBeVisible(); await expect(page.getByLabel("Black clock: 4:57.9", { exact: true })).toBeVisible();
  await expect(page.getByLabel("White captured: none", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Main line 1. e4", exact: true }).click();
  await expect(page.getByLabel("Black clock: 5:00", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "First position", exact: true }).click(); await expect(page.getByLabel("White clock: 5:00", { exact: true })).toBeVisible();
  await expect(page.locator('[data-square="e2"] [data-piece="wP"]')).toHaveCount(1);
  await page.evaluate(() => window.scrollTo(0, 0));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `artifacts/workspace-panels-${page.viewportSize()?.width}.png`, fullPage: true });
});

test("navigation animates without remounting, including rapid changes and reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" }); await page.goto("/"); await openGame(page);
  await page.getByTestId("chessboard").evaluate((element) => element.setAttribute("data-mount-probe", "retained"));
  await page.evaluate(() => {
    const board = document.querySelector('[data-testid="chessboard"]')!;
    const observer = new MutationObserver((records) => { for (const record of records) { const element = record.target; if (element instanceof HTMLElement && element.dataset.piece && element.style.transition.includes("250ms")) board.setAttribute("data-observed-animation", element.style.transform); } });
    observer.observe(board, { attributes: true, attributeFilter: ["style"], subtree: true });
  });
  await page.getByRole("button", { name: "Next move", exact: true }).click();
  await expect(page.getByTestId("chessboard")).toHaveAttribute("data-observed-animation", /translate\(/);
  await expect(page.locator('[data-square="e4"] [data-piece="wP"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Last move", exact: true }).click();
  await page.getByRole("button", { name: "First position", exact: true }).click();
  await page.getByRole("button", { name: "Main line 2. exd5", exact: true }).click();
  await expect(page.locator('[data-square="d5"] [data-piece="wP"]')).toHaveCount(1);
  await expect(page.locator('[data-square="d5"] [data-piece="bP"]')).toHaveCount(0);
  await expect(page.getByTestId("chessboard")).toHaveAttribute("data-mount-probe", "retained");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByTestId("chessboard").evaluate((element) => element.removeAttribute("data-observed-animation"));
  await page.getByRole("button", { name: "First position", exact: true }).click();
  await expect(page.locator('[data-square="e2"] [data-piece="wP"]')).toHaveCount(1);
  await expect(page.getByTestId("chessboard")).not.toHaveAttribute("data-observed-animation");
  await page.getByRole("button", { name: "Free play", exact: true }).click();
  await expect(page.getByTestId("chessboard")).toHaveAttribute("data-mount-probe", "retained");
});

test("castling and promotion navigation settle correctly after rapid reversal", async ({ page }) => {
  await page.goto("/");
  await openGame(page, '[White "Castle"]\n[Black "Test"]\n[SetUp "1"]\n[FEN "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1"]\n1. O-O O-O-O *', "Castle vs Test");
  await page.getByRole("button", { name: "Next move", exact: true }).click();
  await expect(page.locator('[data-square="g1"] [data-piece="wK"]')).toHaveCount(1); await expect(page.locator('[data-square="f1"] [data-piece="wR"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Last move", exact: true }).click();
  await expect(page.locator('[data-square="c8"] [data-piece="bK"]')).toHaveCount(1); await expect(page.locator('[data-square="d8"] [data-piece="bR"]')).toHaveCount(1);
  await openGame(page, '[White "Promote"]\n[Black "Test"]\n[SetUp "1"]\n[FEN "r6k/1P6/8/8/8/8/8/7K w - - 0 1"]\n1. bxa8=Q+ *', "Promote vs Test");
  await page.getByRole("button", { name: "Next move", exact: true }).click();
  await expect(page.locator('[data-square="a8"] [data-piece="wQ"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Previous move", exact: true }).click();
  await page.getByRole("button", { name: "Next move", exact: true }).click();
  await page.getByRole("button", { name: "First position", exact: true }).click();
  await expect(page.locator('[data-square="b7"] [data-piece="wP"]')).toHaveCount(1); await expect(page.locator('[data-square="a8"] [data-piece="bR"]')).toHaveCount(1);
});

test("click and drag share legal destinations and clear on drop, cancel and undo", async ({ page }, info) => {
  test.skip(info.project.name === "mobile", "Mouse-held highlight assertions run on desktop; mobile click/touch regressions run separately.");
  await page.goto("/");
  const marked = page.locator('[data-legal-destination="true"]');
  await page.getByTestId("square-e7").click(); await expect(marked).toHaveCount(0);
  await page.getByTestId("square-e2").click(); await expect(marked).toHaveCount(2); await page.getByTestId("square-e2").click();
  async function grab(from: string) { await page.getByTestId(`square-${from}`).scrollIntoViewIfNeeded(); const box = (await page.getByTestId(`square-${from}`).boundingBox())!; await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 15, box.y + box.height / 2, { steps: 3 }); }
  async function drop(to: string) { const box = (await page.getByTestId(`square-${to}`).boundingBox())!; await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 5 }); await page.mouse.up(); }
  await grab("e2"); await expect(marked).toHaveCount(2); await expect(page.getByTestId("square-e4")).toHaveAttribute("data-legal-destination", "true");
  await drop("e5"); await expect(marked).toHaveCount(0);
  await grab("e2"); await expect(marked).toHaveCount(2); await page.keyboard.press("Escape"); await page.mouse.up(); await expect(marked).toHaveCount(0);
  await page.getByTestId("square-e2").click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("switch", { name: "Automatic assisted analysis", exact: true }).click();
  await page.getByRole("button", { name: "Close", exact: true }).click(); await expect(marked).toHaveCount(0);
  await grab("e2"); await expect(marked).toHaveCount(2); await page.keyboard.press("Escape"); await page.mouse.up();
  await grab("e2"); await drop("e4"); await expect(marked).toHaveCount(0); await expect(page.getByTestId("square-e4")).toHaveAttribute("aria-label", "e4, White pawn");
  await page.getByTestId("square-e7").click(); await expect(marked).toHaveCount(2);
  await page.getByRole("button", { name: "Undo move", exact: true }).click(); await expect(marked).toHaveCount(0);
  await page.getByRole("button", { name: "Reset", exact: true }).click(); await expect(marked).toHaveCount(0);
});

test("evaluation bar shows live and persisted positions and clears on navigation", async ({ page }) => {
  const worker = (await build({ entryPoints: ["tests/fixtures/game-analysis-worker.ts"], bundle: true, write: false, format: "iife", platform: "browser" })).outputFiles[0].text;
  await page.route("**/engines/analysis-worker.js", (route) => route.fulfill({ contentType: "application/javascript", body: worker }));
  await page.goto("/"); await expect(page.getByTestId("evaluation-bar")).toHaveText("—");
  await page.getByRole("button", { name: "Analyze Position", exact: true }).click(); await expect(page.getByTestId("evaluation-bar")).toHaveText("+0.30");
  await page.getByTestId("square-e2").click(); await page.getByTestId("square-e4").click(); await expect(page.getByTestId("evaluation-bar")).toHaveText("—");
  await openGame(page); await page.getByRole("button", { name: "Review game", exact: true }).click(); await page.getByRole("button", { name: "Start review", exact: true }).click();
  await expect(page.getByTestId("queue-progress")).toContainText("completed", { timeout: 15_000 });
  await page.reload(); await page.getByRole("button", { name: /Open Main line analysis/ }).first().click();
  await page.getByRole("button", { name: "Main line 1. e4", exact: true }).click(); await expect(page.getByTestId("evaluation-bar")).toHaveText("-0.10");
  await page.getByRole("button", { name: "Variation 1. d4", exact: true }).click(); await expect(page.getByTestId("evaluation-bar")).toHaveText("—");
  await page.getByRole("button", { name: "Main line 1. e4", exact: true }).click(); await expect(page.getByTestId("evaluation-bar")).toHaveText("-0.10");
});
