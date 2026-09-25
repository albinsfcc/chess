import { expect, test, type Page } from "@playwright/test";
async function open(page: Page, moves: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "Paste PGN", exact: true }).click();
  await page.getByLabel("PGN games", { exact: true }).fill('[White "Opening"]\n[Black "Test"]\n' + moves);
  await page.getByRole("button", { name: "Validate", exact: true }).click();
  await page.getByRole("button", { name: "Import 1 game", exact: true }).click();
  await expect(page.getByRole("button", { name: "Validate", exact: true })).toBeEnabled();
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).last().click();
  await page.getByRole("button", { name: "Open Opening vs Test", exact: true }).click();
  await page.getByRole("button", { name: "Last move", exact: true }).click();
}
test("local opening and variation names follow navigation, with searchable book knowledge", async ({ page }) => {
  await open(page, '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 *');
  await expect(page.getByTestId("opening-variation")).toContainText("Najdorf");
  await expect(page.getByTestId("board-move-badge")).toHaveAccessibleName(/Book/);
  await page.getByText(/Browse 3,815 openings/).click();
  await page.getByLabel("Search openings", { exact: true }).fill("Najdorf");
  await expect(page.getByLabel("Opening search results").locator("li").first()).toContainText("Najdorf");
  expect(await page.getByLabel("Opening search results").locator("li").count()).toBeLessThanOrEqual(20);
  await page.getByRole("button", { name: "First position", exact: true }).click();
  await expect(page.getByTestId("board-move-badge")).toHaveCount(0);
  await page.getByRole("button", { name: "Main line 1. e4", exact: true }).click();
  await expect(page.getByTestId("opening-name")).toBeVisible();
  await expect(page.getByTestId("board-move-badge")).toHaveAccessibleName(/Book/);
});
for (const [label, fen, move] of [
  ["Missed Win", "7k/5K2/6Q1/8/8/8/8/8 w - - 0 1", "Qg5"],
  ["Forced", "7r/8/8/8/8/5k2/8/7K w - - 0 1", "Kg1"],
]) test(`${label} is an exact chess fact without starting Stockfish`, async ({ page }) => {
  const requests: string[] = []; page.on("request", (request) => { if (request.url().includes("/engines/")) requests.push(request.url()); });
  await open(page, `[SetUp "1"]\n[FEN "${fen}"]\n1. ${move} *`);
  await expect(page.getByTestId("board-move-badge")).toHaveAccessibleName(new RegExp(label));
  await expect(page.getByTestId("board-move-badge").locator("img")).toHaveAttribute("src", `/icons/moves/${label.toLowerCase().replaceAll(" ", "-")}.svg`);
  expect(requests).toEqual([]);
});
import { build } from "esbuild";
test("completed shallow analysis grades every non-book move provisionally", async ({ page }) => {
  const original = (await build({ entryPoints: ["tests/fixtures/game-analysis-worker.ts"], bundle: true, write: false, format: "iife", platform: "browser" })).outputFiles[0].text;
  expect(original).toContain("depth: 12");
  await page.route("**/engines/analysis-worker.js", (route) => route.fulfill({ contentType: "application/javascript", body: original.replaceAll("depth: 12", "depth: 3") }));
  await open(page, '[SetUp "1"]\n[FEN "r3k3/8/8/8/8/8/8/R3K3 w - - 0 1"]\n1. Ra2 Ra7 2. Ra3 Ra6 *');
  await page.getByRole("button", { name: "Analyze game", exact: true }).click();
  await page.getByRole("button", { name: "Start game analysis", exact: true }).click();
  await expect(page.getByTestId("queue-progress")).toContainText("completed", { timeout: 15_000 });
  for (const name of ["Main line 1. Ra2", "Main line 1... Ra7", "Main line 2. Ra3", "Main line 2... Ra6"]) {
    const move = page.getByRole("button", { name, exact: true });
    await expect(move).toContainText("provisional");
    await expect(move).not.toContainText("Pending");
    await move.click();
    await expect(page.getByTestId("board-move-badge")).toBeVisible();
  }
});
