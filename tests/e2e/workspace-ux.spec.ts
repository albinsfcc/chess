import { expect, test, type Page } from "@playwright/test";
import { build } from "esbuild";
import { wireFixture } from "../../src/lib/platforms/fixtures";
async function importPgn(page: Page) {
  await page.getByRole("button", { name: "Paste PGN", exact: true }).click();
  await page.getByLabel("PGN games", { exact: true }).fill('[White "Explorer"]\n[Black "Opponent"]\n[TimeControl "300"]\n1. e4 {[%clk 0:04:59.25]} e5 2. Nf3 *');
  await page.getByRole("button", { name: "Validate", exact: true }).click(); await page.getByRole("button", { name: "Import 1 game", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).last().click();
  await page.getByRole("button", { name: "Open Explorer vs Opponent", exact: true }).click();
}
for (const platform of ["chesscom", "lichess"] as const) test(`${platform} automatically loads recent games, keeps imports, retries and cancels`, async ({ page }) => {
  const name = platform === "chesscom" ? "Chess.com" : "Lichess";
  let fail = false, slow = false; const requests: string[] = [];
  await page.route("**/api/platforms/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("profile")) return route.fulfill({ json: { platform, username: "alice", canonicalUsername: "alice" } });
    if (url.pathname.endsWith("archives")) return route.fulfill({ json: { months: ["2026-08", "2026-09"] } });
    requests.push(url.search);
    if (slow) await new Promise((resolve) => setTimeout(resolve, 800));
    if (fail) return route.fulfill({ status: 503, json: { error: { code: "service", message: "Service unavailable. Please retry." } } });
    const count = platform === "chesscom" ? (url.searchParams.get("month") === "09" ? 2 : 4) : 5;
    const base = platform === "chesscom" && url.searchParams.get("month") === "08" ? 0 : 10;
    const games = Array.from({ length: count }, (_, index) => ({ ...wireFixture, source: platform, externalId: String(base + index), playedAtMs: base + index, pgn: wireFixture.pgn.replaceAll("Alice", `Player${base + index}`) }));
    return platform === "chesscom" ? route.fulfill({ json: { games, warnings: [] } }) : route.fulfill({ contentType: "application/x-ndjson", body: [...games.map((game) => ({ type: "game", game })), { type: "complete", count: 5, limited: false }].map((event) => JSON.stringify(event)).join("\n") });
  });
  await page.goto("/"); await page.getByRole("button", { name: `Import from ${name}`, exact: true }).click();
  await page.getByLabel(`${name} username`, { exact: true }).fill("alice"); await page.getByRole("button", { name: "Validate profile", exact: true }).click(); await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(page.getByLabel("Discovered games").locator("li")).toHaveCount(5);
  await expect(page.getByLabel("Rated/casual", { exact: true })).not.toBeVisible();
  expect(platform === "chesscom" ? requests.some((url) => url.includes("month=08")) : requests.every((url) => url.includes("max=5"))).toBe(true);
  const first = page.getByLabel("Discovered games").getByRole("checkbox").first(); await first.check(); await page.getByRole("button", { name: "Import selected", exact: true }).click(); await expect(first).toBeDisabled();
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).last().click();
  await page.reload(); slow = true; await page.getByRole("button", { name: `Import from ${name}`, exact: true }).click();
  await expect(page.getByRole("status", { name: "Loading recent games" })).toBeVisible();
  await expect(page.getByLabel("Discovered games").locator("li")).toHaveCount(5); await expect(page.getByLabel("Discovered games").getByRole("checkbox").first()).toBeDisabled();
  fail = true; slow = false; await page.getByRole("button", { name: "Refresh Games", exact: true }).click();
  await expect(page.getByRole("button", { name: "Refresh Games", exact: true })).toBeEnabled();
  await expect(page.getByRole("dialog")).toContainText(platform === "chesscom" ? "discovery/import notices" : "Service unavailable");
  fail = false; slow = true; await page.getByRole("button", { name: "Refresh Games", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).last().click();
  await page.getByRole("button", { name: `Import from ${name}`, exact: true }).click();
  await expect(page.getByLabel("Discovered games").locator("li")).toHaveCount(5);
});

test("local variations preserve the PGN, follow engine analysis and survive reload", async ({ page }) => {
  const worker = (await build({ entryPoints: ["tests/fixtures/game-analysis-worker.ts"], bundle: true, write: false, format: "iife", platform: "browser" })).outputFiles[0].text;
  await page.route("**/engines/analysis-worker.js", (route) => route.fulfill({ contentType: "application/javascript", body: worker }));
  await page.goto("/"); await importPgn(page);
  await page.getByTestId("square-e2").click(); await page.getByTestId("square-e4").click();
  await expect(page.getByRole("button", { name: "Main line 1. e4", exact: true })).toHaveAttribute("aria-current", "step");
  await expect(page.getByText(/Local variation 1 from/)).toHaveCount(0);
  await page.getByTestId("square-d7").click(); await page.getByTestId("square-d5").click();
  await expect(page.getByRole("button", { name: "Variation 1... d5", exact: true })).toHaveAttribute("aria-current", "step");
  await page.getByRole("button", { name: "Analyze Position", exact: true }).click(); await expect(page.getByTestId("evaluation-bar")).toHaveText("+0.30");
  await page.getByTestId("square-e4").click(); await page.getByTestId("square-d5").click();
  await expect(page.getByLabel("White captured: pawn", { exact: true })).toBeVisible(); await expect(page.getByTestId("evaluation-bar")).toHaveText("\u2014");
  await page.getByRole("button", { name: "Previous move", exact: true }).click();
  await expect(page.getByTestId("square-e4")).toHaveAttribute("aria-label", "e4, White pawn");
  await page.getByRole("button", { name: "Return to main line", exact: true }).click();
  await expect(page.getByRole("button", { name: "Main line 1. e4", exact: true })).toHaveAttribute("aria-current", "step");
  await expect(page.getByLabel("White clock: 4:59.25", { exact: true })).toBeVisible(); await expect(page.getByLabel("Black clock: 5:00", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next move", exact: true }).click();
  await expect(page.getByTestId("square-e5")).toHaveAttribute("aria-label", "e5, Black pawn");
  await page.reload(); await page.getByRole("button", { name: "Open Explorer vs Opponent", exact: true }).click();
  await page.getByText("Local variation 1 from ply 1", { exact: true }).click();
  await page.getByRole("button", { name: "Variation 2. exd5", exact: true }).click(); await expect(page.getByLabel("White captured: pawn", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Main line 2. Nf3", exact: true })).toBeVisible();
});

test("board-first layout uses desktop space and stacks without mobile overflow", async ({ page }) => {
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 1024, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport); await page.goto("/");
    const board = page.getByTestId("chessboard"); await expect(board).toBeVisible();
    const area = (await board.boundingBox())!, panels = (await page.getByLabel("Game workspace panels").boundingBox())!;
    expect(Math.abs(area.width - area.height)).toBeLessThan(2);
    if (viewport.width >= 900) { expect(panels.x).toBeGreaterThan(area.x + area.width); if (viewport.width === 1920) expect(area.width).toBeGreaterThan(700); }
    else expect(panels.y).toBeGreaterThan(area.y + area.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/workspace-layout-${viewport.width}.png`, fullPage: true });
  }
});
