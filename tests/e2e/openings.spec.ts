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
  await page.getByRole("button", { name: "Review game", exact: true }).click();
  await page.getByRole("button", { name: "Start review", exact: true }).click();
  await expect(page.getByTestId("queue-progress")).toContainText("completed", { timeout: 15_000 });
  for (const name of ["Main line 1. Ra2", "Main line 1... Ra7", "Main line 2. Ra3", "Main line 2... Ra6"]) {
    const move = page.getByRole("button", { name, exact: true });
    await expect(move).toContainText("provisional");
    await expect(move).not.toContainText("Pending");
    await move.click();
    await expect(page.getByTestId("board-move-badge")).toBeVisible();
  }
});
test("supplied game displays its two brilliant and three critical moves", async ({ page }) => {
  const worker = (await build({ entryPoints: ["tests/fixtures/recorded-grades-worker.ts"], bundle: true, write: false, format: "iife", platform: "browser" })).outputFiles[0].text;
  await page.route("**/engines/analysis-worker.js", (route) => route.fulfill({ contentType: "application/javascript", body: worker }));
  await open(page, '1. e4 e5 2. Nf3 Nc6 3. Bc4 h6 4. c3 Nf6 5. d4 exd4 6. e5 Nh7 7. O-O dxc3 8. Nxc3 Bc5 9. Bxf7+ Kxf7 10. Qd5+ Kg6 11. Qxc5 Nf8 12. Nd5 Ne6 13. Qc2+ Kf7 14. Qf5+ Kg8 15. Nf6+ gxf6 16. Qg6+ Kf8 17. exf6 Qe8 18. Bxh6+ Rxh6 19. Qxh6+ Kg8 20. Ng5 Ncd8 21. Qh7+ Kf8 22. Qh8# 1-0');
  await page.getByRole("button", { name: "Review game", exact: true }).click();
  await page.getByRole("button", { name: "Start review", exact: true }).click();
  await expect(page.getByTestId("queue-progress")).toContainText("completed", { timeout: 25_000 });
  for (const [move, label] of [["9. Bxf7+", "Brilliant"], ["15. Nf6+", "Brilliant"], ["10. Qd5+", "Great"], ["16. Qg6+", "Great"], ["18. Bxh6+", "Great"]]) {
    const button = page.getByRole("button", { name: `Main line ${move}`, exact: true });
    await expect(button).toContainText(label); await button.click();
    await expect(page.getByTestId("board-move-badge")).toHaveAccessibleName(new RegExp(label));
  }
});
test("quiet moves and ordinary exchanges from the screenshot are not Brilliant", async ({ page }) => {
  const worker = (await build({ entryPoints: ["tests/fixtures/recorded-grades-worker.ts"], bundle: true, write: false, format: "iife", platform: "browser" })).outputFiles[0].text;
  await page.route("**/engines/analysis-worker.js", (route) => route.fulfill({ contentType: "application/javascript", body: worker }));
  await open(page, '1. e4 c5 2. Bc4 Nc6 3. Nf3 g6 4. d3 Bg7 5. Nc3 d6 6. O-O e6 7. Bg5 Qd7 8. Re1 Nge7 9. a3 a6 10. Ba2 O-O 11. Qd2 Re8 12. Bh6 Bh8 13. Nd1 b5 14. c3 Bb7 15. Ne3 Rad8 16. Ng4 Qc7 17. Qf4 e5 18. Nf6+ *');
  await page.getByRole("button", { name: "Review game", exact: true }).click();
  await page.getByRole("button", { name: "Start review", exact: true }).click();
  await expect(page.getByTestId("queue-progress")).toContainText("completed", { timeout: 25_000 });
  for (const move of ["7... Qd7", "8... Nge7", "9... a6", "13. Nd1"]) {
    const button = page.getByRole("button", { name: `Main line ${move}`, exact: true });
    await expect(button).not.toContainText("Brilliant"); await expect(button).not.toContainText("Pending");
    await button.click(); await expect(page.getByTestId("board-move-badge")).toBeVisible();
    await expect(page.getByTestId("board-move-badge")).not.toHaveAccessibleName(/Brilliant/);
  }
});
