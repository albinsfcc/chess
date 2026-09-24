import { expect, test, type Page } from "@playwright/test";
import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import { annotatedPgn } from "../../src/lib/pgn/fixtures";

let worker: string;
test.beforeAll(async () => { worker = (await build({ entryPoints: ["tests/fixtures/game-analysis-worker.ts"], bundle: true, write: false, format: "iife", platform: "browser" })).outputFiles[0].text; });
async function close(page: Page) { await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).last().click(); }
async function paste(page: Page, pgn = annotatedPgn, count = 1) {
  await page.getByRole("button", { name: "Paste PGN", exact: true }).click();
  await page.getByLabel("PGN games", { exact: true }).fill(pgn);
  await page.getByRole("button", { name: "Validate", exact: true }).click();
  await page.getByRole("button", { name: `Import ${count} game${count === 1 ? "" : "s"}`, exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Validate", exact: true })).toBeEnabled();
  await close(page);
}
async function settings(page: Page) { await page.getByRole("button", { name: "Settings", exact: true }).click(); }

test("initial visit is engine-free; board keyboard moves and dialog focus work", async ({ page }) => {
  const engines: string[] = []; page.on("request", (request) => { if (request.url().includes("/engines/")) engines.push(request.url()); });
  await page.goto("/");
  await page.getByTestId("square-e2").focus(); await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowUp"); await page.keyboard.press("ArrowUp"); await page.keyboard.press("Enter");
  await expect(page.getByTestId("square-e4")).toHaveAttribute("aria-label", "e4, White pawn");
  await settings(page); await expect(page.getByRole("dialog")).toBeVisible();
  for (let i = 0; i < 40; i++) { await page.keyboard.press("Tab"); expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true); }
  await page.keyboard.press("Escape"); await expect(page.getByRole("button", { name: "Settings", exact: true })).toBeFocused();
  expect(engines).toEqual([]);
});

test("backup validates, restores analysis and preferences, and clearing is explicit", async ({ page }) => {
  test.setTimeout(90_000);
  await page.route("**/engines/analysis-worker.js", (route) => route.fulfill({ contentType: "application/javascript", body: worker }));
  await page.goto("/"); await paste(page);
  await page.getByRole("button", { name: "Open Alice vs Bob", exact: true }).click();
  await page.getByRole("button", { name: "Analyze game", exact: true }).click();
  await page.getByRole("button", { name: "Start game analysis", exact: true }).click();
  await expect(page.getByTestId("queue-progress")).toContainText("completed", { timeout: 20_000 });
  await settings(page); await page.getByLabel("Dark squares").fill("#234567");
  const download = page.waitForEvent("download"); await page.getByRole("button", { name: "Export local backup", exact: true }).click();
  const bytes = await readFile((await (await download).path())!); const backup = JSON.parse(bytes.toString());
  expect(backup.version).toBe(1); expect(backup.positions).toHaveLength(5); expect(backup.documents).toHaveLength(1);
  await page.getByRole("button", { name: "Clear analysis results", exact: true }).click();
  await page.getByRole("button", { name: "Confirm clear analysis", exact: true }).click();
  await expect(page.getByText("Analysis results cleared. Your games and profiles are kept.")).toBeVisible();
  await close(page); await expect(page.getByRole("button", { name: "Open Alice vs Bob", exact: true })).toBeVisible();
  await settings(page); await page.getByRole("button", { name: "Clear all local data", exact: true }).click();
  await page.getByRole("button", { name: "Keep local data", exact: true }).click();
  await page.getByRole("button", { name: "Clear all local data", exact: true }).click();
  await page.getByRole("button", { name: "Confirm clear all data", exact: true }).click();
  await expect(page.getByText("All local games, profiles, analysis and preferences were cleared.")).toBeVisible();
  await close(page); await page.reload(); await expect(page.getByText(/No saved games yet/)).toBeVisible();
  await settings(page); await page.getByLabel("Import local backup", { exact: true }).setInputFiles({ name: "backup.json", mimeType: "application/json", buffer: bytes });
  await page.getByRole("button", { name: "Restore validated backup", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Restored 1 games" })).toBeVisible();
  await expect(page.getByLabel("Dark squares")).toHaveValue("#234567");
  await page.getByLabel("Import local backup", { exact: true }).setInputFiles({ name: "bad.json", mimeType: "application/json", buffer: Buffer.from('{"version":999}') });
  await expect(page.getByRole("alert")).toContainText("Unsupported backup version");
  await expect(page.getByRole("button", { name: "Restore validated backup", exact: true })).toHaveCount(0);
  await close(page); await page.reload(); await page.getByRole("button", { name: /Open Main line analysis/ }).first().click();
  await expect(page.getByTestId("queue-progress")).toContainText("5 / 5 positions");
  await page.getByLabel("Navigate evaluation graph", { exact: true }).selectOption("2");
  await expect(page.getByTestId("square-e5")).toHaveAttribute("aria-label", "e5, Black pawn");
});

test("local games remain readable offline and engine failures offer recovery", async ({ page, context }) => {
  await page.goto("/"); await paste(page); await context.setOffline(true);
  await page.getByRole("button", { name: "Open Alice vs Bob", exact: true }).click();
  await page.getByRole("button", { name: "Main line 1. e4", exact: true }).click();
  await expect(page.getByTestId("square-e4")).toHaveAttribute("aria-label", "e4, White pawn");
  await page.getByRole("button", { name: "Import from Lichess", exact: true }).click();
  await page.getByLabel("Lichess username", { exact: true }).fill("alice"); await page.getByRole("button", { name: "Validate profile", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(/offline/i); await close(page); await context.setOffline(false);
  await page.route("**/engines/analysis-worker.js", (route) => route.fulfill({ status: 404, body: "Missing worker" }));
  await page.getByRole("button", { name: "Analyze Position", exact: true }).click();
  await expect(page.getByTestId("engine-status")).toHaveText("error");
  await page.unroute("**/engines/analysis-worker.js");
  await page.route("**/engines/analysis-worker.js", (route) => route.fulfill({ contentType: "application/javascript", body: worker }));
  await page.getByRole("button", { name: "Restart engine", exact: true }).click();
  await expect(page.getByTestId("engine-best-move")).toContainText("Best move:");
});

test("library pages bound rendering and responsive layouts retain square boards", async ({ page }) => {
  test.setTimeout(90_000); await page.goto("/");
  await paste(page, Array.from({ length: 30 }, (_, index) => `[White "${"LongName".repeat(18)}${index}"]\n[Black "B"]\n1. e4 e5 *`).join("\n\n"), 30);
  await expect(page.getByLabel("Saved games").locator(":scope > li")).toHaveCount(25);
  await page.getByRole("button", { name: "Next games", exact: true }).click();
  await expect(page.getByLabel("Saved games").locator(":scope > li")).toHaveCount(5);
  for (const [width, height] of [[320, 568], [667, 375], [768, 1024], [1366, 768], [1920, 1080]]) {
    await page.setViewportSize({ width, height });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const square = await page.locator('[data-square="a1"]').boundingBox(); expect(square).not.toBeNull(); expect(Math.abs(square!.height - square!.width)).toBeLessThan(2);
    await settings(page); const modal = await page.getByRole("dialog").boundingBox(); expect(modal!.height).toBeLessThan(height); await close(page);
  }
  await page.setViewportSize({ width: 390, height: 844 }); await page.evaluate(() => document.documentElement.style.fontSize = "32px");
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("long move lists and evaluation histories expose bounded accessible pages", async ({ page }) => {
  test.setTimeout(60_000);
  await page.route("**/engines/analysis-worker.js", (route) => route.fulfill({ contentType: "application/javascript", body: worker.replace(/900\)/g, "1)") }));
  await page.goto("/");
  const moves = Array.from({ length: 30 }, (_, i) => `${i * 2 + 1}. Nf3 Nf6 ${i * 2 + 2}. Ng1 Ng8`).join(" ");
  await paste(page, `[White "Window"]\n[Black "Opponent"]\n${moves} *`);
  await page.getByRole("button", { name: "Open Window vs Opponent", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Main line \d/ })).toHaveCount(100);
  await page.getByRole("button", { name: "Analyze game", exact: true }).click();
  await page.getByRole("button", { name: "Start game analysis", exact: true }).click();
  await expect(page.getByTestId("queue-progress")).toContainText("completed", { timeout: 40_000 });
  await expect(page.getByLabel("Navigate evaluation graph", { exact: true }).locator("option")).toHaveCount(100);
  await page.getByRole("button", { name: "Later positions", exact: true }).click();
  await expect(page.getByLabel("Navigate evaluation graph", { exact: true }).locator("option")).toHaveCount(21);
  await page.getByLabel("Navigate evaluation graph", { exact: true }).selectOption("120");
  await expect(page.getByRole("button", { name: "Main line 60... Ng8", exact: true })).toHaveAttribute("aria-current", "step");
  await expect(page.getByTestId("square-g8")).toHaveAttribute("aria-label", "g8, Black knight");
  await page.getByRole("button", { name: "Earlier positions", exact: true }).click();
  await expect(page.getByLabel("Navigate evaluation graph", { exact: true })).toHaveValue("0");
});
