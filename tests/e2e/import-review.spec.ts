import { expect, test } from "@playwright/test";
import { build } from "esbuild";
import { platformPgn, wireFixture } from "../../src/lib/platforms/fixtures";

test.beforeEach(async ({ page }) => {
  const worker = (await build({ entryPoints: ["tests/fixtures/game-analysis-worker.ts"], bundle: true, write: false, format: "iife", platform: "browser" })).outputFiles[0].text;
  await page.route("**/engines/analysis-worker.js", route => route.fulfill({ contentType: "application/javascript", body: worker }));
});

test("PGN validates automatically and a single import opens review", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Play Computer", exact: true })).toBeVisible();
  await expect(page.getByTestId("library-count")).toHaveText("0");
  await expect(page.getByRole("button", { name: "Game library", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Paste PGN", exact: true }).click();
  await page.getByLabel("PGN games", { exact: true }).fill(platformPgn);
  await expect(page.getByRole("button", { name: "Validate", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Import 1 game", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Reviewing game" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Review game", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Close and pause" }).click();
  await expect(page.getByTestId("library-count")).toHaveText("1");
  await page.getByRole("button", { name: "Game library", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Saved games", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Open Alice vs Bob", exact: true }).click();
  await expect(page.getByRole("button", { name: "Review game", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Game library", exact: true }).click();
  await page.getByRole("dialog", { name: "Saved games", exact: true }).getByRole("button", { name: "Delete Alice vs Bob", exact: true }).click();
  await page.getByRole("button", { name: "Delete game", exact: true }).click();
  await expect(page.getByTestId("library-count")).toHaveText("0");
  await page.getByRole("dialog", { name: "Saved games", exact: true }).getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("button", { name: "Game library", exact: true })).toBeDisabled();
});

for (const platform of ["Chess.com", "Lichess"]) {
  test(`${platform}: load another batch, then click a game to review`, async ({ page }) => {
    await page.route("**/api/platforms/**", async route => {
      const url = new URL(route.request().url()), source = platform === "Chess.com" ? "chesscom" : "lichess";
      if (url.pathname.endsWith("/profile")) return route.fulfill({ json: { platform: source, username: "alice", canonicalUsername: "alice" } });
      if (url.pathname.endsWith("/archives")) return route.fulfill({ json: { months: ["2026-09"] } });
      const games = Array.from({ length: 10 }, (_, index) => ({ ...wireFixture, source, externalId: source === "lichess" ? `abcd123${index}` : `live:${100 + index}`, externalUrl: source === "lichess" ? `https://lichess.org/abcd123${index}` : `https://www.chess.com/game/live/${100 + index}`, pgn: platformPgn.replaceAll("Alice", `Player${index}`), playedAtMs: wireFixture.playedAtMs! - index * 1000 }));
      if (source === "chesscom") return route.fulfill({ json: { games, warnings: [] } });
      const selected = games.slice(0, Number(url.searchParams.get("max") ?? 5));
      return route.fulfill({ contentType: "application/x-ndjson", body: [...selected.map(game => ({ type: "game", game })), { type: "complete", count: selected.length, limited: true }].map(event => JSON.stringify(event)).join("\n") + "\n" });
    });
    await page.goto("/");
    await page.getByRole("button", { name: `Import from ${platform}`, exact: true }).click();
    await page.getByLabel(`${platform} username`, { exact: true }).fill("alice");
    await page.getByRole("button", { name: "Validate profile" }).click();
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByLabel("Discovered games").locator("li")).toHaveCount(5);
    await page.getByRole("button", { name: "Load 5 more games" }).click();
    await expect(page.getByLabel("Discovered games").locator("li")).toHaveCount(10);
    await page.getByRole("button", { name: "Import and review Player0 vs Bob", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Reviewing game" })).toBeVisible();
    await page.getByRole("button", { name: "Close and pause" }).click();
    await page.getByRole("button", { name: `Import from ${platform}`, exact: true }).click();
    await expect(page.getByRole("checkbox", { name: "Select Player0 vs Bob", exact: true })).toBeDisabled();
  });
}

 test("clear all confirms deletion and updates the header count", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Paste PGN", exact: true }).click();
  await page.getByLabel("PGN games", { exact: true }).fill(platformPgn);
  await page.getByRole("button", { name: "Import 1 game", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Reviewing game" })).toBeVisible();
  await page.getByRole("button", { name: "Close and pause" }).click();
  await page.getByRole("button", { name: "Game library", exact: true }).click();
  await page.getByRole("button", { name: "Clear all", exact: true }).click();
  await page.getByRole("dialog", { name: "Clear all games?", exact: true }).getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByTestId("library-count")).toHaveText("1");
  await page.getByRole("button", { name: "Clear all", exact: true }).click();
  await page.getByRole("button", { name: "Clear all games", exact: true }).click();
  await expect(page.getByTestId("library-count")).toHaveText("0");
  await expect(page.getByRole("button", { name: "Clear all", exact: true })).toBeDisabled();
  await page.getByRole("dialog", { name: "Saved games", exact: true }).getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("button", { name: "Game library", exact: true })).toBeDisabled();
  await page.reload();
  await expect(page.getByTestId("library-count")).toHaveText("0");
 });

test("analysis follows review deviations and navigation controls are centered", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Paste PGN", exact: true }).click();
  await page.getByLabel("PGN games", { exact: true }).fill(platformPgn);
  await page.getByRole("button", { name: "Import 1 game", exact: true }).click();
  await page.getByRole("button", { name: "Start review", exact: true }).click();
  const nav = page.getByTestId("board-navigation");
  const boxes = await nav.evaluate(el => {
    const center = (node: Element) => { const r = node.getBoundingClientRect(); return r.x + r.width / 2; };
    return { center: center(el), arrows: center(el.querySelector('.board-history-controls')!), left: center(el.querySelector('.board-mode-control')!), right: center(el.querySelector('.board-flip-control')!) };
  });
  expect(Math.abs(boxes.center - boxes.arrows)).toBeLessThan(2);
  expect(boxes.left).toBeLessThan(boxes.arrows); expect(boxes.right).toBeGreaterThan(boxes.arrows);
  await page.getByRole("tab", { name: "Engine", exact: true }).click();
  await page.getByRole("button", { name: "Start analysis", exact: true }).click();
  await expect(page.getByTestId("engine-status")).toHaveText("ready");
  await page.getByTestId("square-d2").click(); await page.getByTestId("square-d4").click();
  await expect(page.getByLabel("Position evaluation", { exact: true })).toHaveText("-0.10");
  await expect(page.getByTestId("engine-status")).toHaveText("ready");
  await page.getByTestId("square-d7").click(); await page.getByTestId("square-d5").click();
  await expect(page.getByLabel("Position evaluation", { exact: true })).toHaveText("+0.30");
  await page.getByRole("button", { name: "Stop analysis", exact: true }).click();
  await page.getByTestId("square-c2").click(); await page.getByTestId("square-c4").click();
  await expect(page.getByTestId("engine-status")).toHaveText("stopped");
  await page.screenshot({ path: `artifacts/continuous-analysis-${page.viewportSize()?.width}.png` });
});

test("completed games copy their saved PGN and report clipboard failures", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text: string) => {
      if (sessionStorage.getItem("deny-copy")) throw new Error("Denied");
      sessionStorage.setItem("copied-pgn", text);
    } } });
  });
  const pgn = '[White "Copy Test"]\n[Black "Opponent"]\n[Result "1-0"]\n\n1. e4 e5 1-0';
  await page.goto("/");
  await page.getByRole("button", { name: "Paste PGN", exact: true }).click();
  await page.getByLabel("PGN games", { exact: true }).fill(pgn);
  await page.getByRole("button", { name: "Import 1 game", exact: true }).click();
  await page.getByRole("button", { name: "Start review", exact: true }).click();
  await page.getByRole("button", { name: "Copy PGN", exact: true }).click();
  await expect(page.getByText("PGN copied to clipboard.", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("copied-pgn"))).toContain('1. e4 e5 1-0');
  expect(await page.evaluate(() => sessionStorage.getItem("copied-pgn"))).toContain('[White "Copy Test"]');
  await page.evaluate(() => sessionStorage.setItem("deny-copy", "yes"));
  await page.getByRole("button", { name: "Copy PGN", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Could not copy PGN" })).toBeVisible();
});

test("light appearance keeps completed reviews readable", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("chess-review:theme:v1", "light"));
  await page.goto("/");
  await page.getByRole("button", { name: "Paste PGN", exact: true }).click();
  await page.getByLabel("PGN games", { exact: true }).fill(platformPgn);
  await page.getByRole("button", { name: "Import 1 game", exact: true }).click();
  await expect(page.getByRole("button", { name: "Start review", exact: true })).toBeVisible({ timeout: 15000 });
  const modal = page.getByRole("dialog");
  await expect(modal).toHaveCSS("background-color", "rgba(248, 251, 250, 0.81)");
  await expect(modal.getByLabel("White accuracy", { exact: true })).toHaveCSS("color", "rgb(23, 53, 47)");
  await page.screenshot({ path: `artifacts/light-review-${page.viewportSize()?.width}.png` });
});

