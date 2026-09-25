import { expect, test } from "@playwright/test";
import { build } from "esbuild";
import { platformPgn, wireFixture } from "../../src/lib/platforms/fixtures";

test.beforeEach(async ({ page }) => {
  const worker = (await build({ entryPoints: ["tests/fixtures/game-analysis-worker.ts"], bundle: true, write: false, format: "iife", platform: "browser" })).outputFiles[0].text;
  await page.route("**/engines/analysis-worker.js", route => route.fulfill({ contentType: "application/javascript", body: worker }));
});

test("PGN validates automatically and a single import opens review", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Paste PGN", exact: true }).click();
  await page.getByLabel("PGN games", { exact: true }).fill(platformPgn);
  await expect(page.getByRole("button", { name: "Validate", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Import 1 game", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Reviewing game" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Review game", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Close and pause" }).click();
  await page.getByRole("button", { name: "Game library", exact: true }).click();
  await page.getByRole("button", { name: "Open Alice vs Bob", exact: true }).click();
  await expect(page.getByRole("button", { name: "Review game", exact: true })).toBeVisible();
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
