import { expect, test } from "@playwright/test";
import { build } from "esbuild";
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0;
    const searches: { fen: string; bot?: unknown }[] = [];
    Object.assign(window, { computerSearches: searches });
    const send = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function(message, transfer: Transferable[] | StructuredSerializeOptions = []) {
      if (message?.type === "search") searches.push(message.request);
      return send.call(this, message, Array.isArray(transfer) ? { transfer } : transfer);
    };
  });
});
let worker: string;
test.beforeAll(async () => { worker = (await build({ entryPoints: ["tests/fixtures/computer-worker.ts"], bundle: true, write: false, format: "iife", platform: "browser" })).outputFiles[0].text; });

test("right-click circles and right-drag arrows toggle and clear when a move is made", async ({ page }) => {
  await page.goto("/");
  const board = page.getByTestId("chessboard"), e4 = page.getByTestId("square-e4"), e2 = page.getByTestId("square-e2");
  await e4.click({ button: "right" }); await expect(e4).toHaveAttribute("data-annotated", "true");
  await e4.click({ button: "right" }); await expect(board).toHaveAttribute("data-circle-count", "0");
  const from = await e2.boundingBox(), to = await e4.boundingBox();
  for (const expected of ["1", "0", "1"]) {
    await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
    await page.mouse.down({ button: "right" });
    await page.mouse.move(to!.x + to!.width / 2, to!.y + to!.height / 2, { steps: 8 });
    await page.mouse.up({ button: "right" });
    await expect(board).toHaveAttribute("data-user-arrow-count", expected);
    await expect(board).toHaveAttribute("data-circle-count", "0");
  }
  await e2.click(); await e4.click();
  await expect(board).toHaveAttribute("data-user-arrow-count", "0");
  await expect(e4).toHaveAttribute("aria-label", "e4, White pawn");
});

test("queues a Black premove during the bot turn and plays it after the animated reply", async ({ page }) => {
  await page.route("**/engines/analysis-worker.js", route => route.fulfill({ contentType: "application/javascript", body: worker }));
  await page.goto("/"); await page.evaluate(() => { Math.random = () => .25; });
  await page.getByRole("button", { name: "Play Computer", exact: true }).click();
  await page.getByRole("radio", { name: "Black", exact: true }).check();
  await page.getByLabel("Show move feedback").uncheck();
  await page.getByRole("button", { name: "Start Game", exact: true }).click();
  await page.getByTestId("square-g8").click(); await page.getByTestId("square-f6").click();
  await expect(page.getByTestId("chessboard")).toHaveAttribute("data-premove", "g8f6");
  await expect(page.getByTestId("square-g8")).toHaveAttribute("aria-label", "g8, Black knight");
  await page.getByRole("button", { name: "Cancel premove", exact: true }).click();
  await expect(page.getByTestId("chessboard")).not.toHaveAttribute("data-premove", "g8f6");
  const from = await page.getByTestId("square-g8").boundingBox(), to = await page.getByTestId("square-f6").boundingBox();
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down(); await page.mouse.move(to!.x + to!.width / 2, to!.y + to!.height / 2, { steps: 10 }); await page.mouse.up();
  await expect(page.getByTestId("chessboard")).toHaveAttribute("data-premove", "g8f6");
  await expect(page.getByTestId("square-f6")).toHaveAttribute("aria-label", "f6, Black knight");
  await expect(page.getByTestId("chessboard")).not.toHaveAttribute("data-premove", "g8f6");
});
test("computer terminal move opens the shared review with accuracy, move details and persistence", async ({ page }) => {
  await page.route("**/engines/analysis-worker.js", (route) => route.fulfill({ contentType: "application/javascript", body: worker }));
  await page.goto("/"); await page.getByRole("button", { name: "Play Computer", exact: true }).click();
  await expect(page.getByLabel("Choose bot").locator('button[aria-pressed="false"]')).toHaveCount(5);
  await expect(page.getByLabel("Assisted game")).not.toBeChecked();
  await expect(page.getByLabel("Show move feedback")).toBeChecked();
  await page.getByRole("button", { name: /Atlas Master/ }).click();
  await page.getByRole("button", { name: "Start Game", exact: true }).click();
  await page.getByTestId("square-f2").click(); await page.getByTestId("square-f3").click();
  await expect(page.getByTestId("computer-status")).toHaveText("Move feedback");
  expect(await page.evaluate(() => (window as unknown as { computerSearches: { bot?: unknown }[] }).computerSearches.some(row => row.bot))).toBe(false);
  await expect(page.getByTestId("human-feedback-1")).toBeVisible();
  await expect(page.getByTestId("computer-status")).toContainText("thinking");
  await expect(page.getByTestId("chessboard")).toHaveAttribute("data-input-locked", "true");
  await expect(page.getByTestId("square-e5")).toHaveAttribute("aria-label", "e5, Black pawn");
  await expect(page.getByTestId("chessboard")).toHaveAttribute("data-input-locked", "false");
  await page.getByTestId("square-g2").click(); await page.getByTestId("square-g4").click();
  // Already collected positions produce a ready review immediately, without another full pass.
  await expect(page.getByRole("button", { name: "Start review", exact: true })).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole("dialog").getByLabel("White accuracy", { exact: true })).toHaveText(/\d+\.\d/);
  await expect(page.getByRole("dialog").getByLabel("Black accuracy", { exact: true })).toHaveText(/\d+\.\d/);
  const modal = page.getByRole("dialog");
  const layout = await modal.evaluate(el => {
    const box = el.getBoundingClientRect(), header = el.querySelector('.review-dialog-header')!.getBoundingClientRect(), title = el.querySelector('[data-slot="dialog-title"]')!.getBoundingClientRect();
    return { inset: title.top - header.top, height: box.height, viewport: innerHeight, overflow: el.scrollWidth > el.clientWidth, blur: getComputedStyle(document.querySelector('[data-slot="dialog-overlay"]')!).backdropFilter };
  });
  expect(layout.inset).toBeGreaterThan(12); expect(layout.height).toBeLessThan(layout.viewport);
  expect(layout.overflow).toBe(false); expect(layout.blur).toContain("blur(12px)");
  await page.screenshot({ path: `artifacts/review-modal-${page.viewportSize()?.width}.png` });
  const searches = await page.evaluate(() => (window as unknown as { computerSearches: { fen: string; bot?: unknown }[] }).computerSearches);
  const reviewSearches = searches.filter(row => !row.bot);
  // A quick human move can cancel and restart an unfinished position search.
  // Completed positions are reused; terminal mate requires no search.
  expect(new Set(reviewSearches.map(row => row.fen)).size).toBe(4);
  const countAtReview = searches.length;
  await page.getByRole("button", { name: "Start review", exact: true }).click();
  await expect(page.getByRole("region", { name: "Game review card", exact: true })).toContainText("4 / 4 moves graded");
  expect(await page.evaluate(() => (window as unknown as { computerSearches: unknown[] }).computerSearches.length)).toBe(countAtReview);
  await page.getByLabel("Navigate evaluation graph", { exact: true }).click(); await page.getByRole("option", { name: /^Ply 4\b/ }).click();
  await expect(page.getByTestId("square-h4")).toHaveAttribute("aria-label", "h4, Black queen");
  await page.getByRole("tab", { name: "Engine", exact: true }).click();
  await expect(page.getByLabel("Played move evaluation", { exact: true })).toContainText("Qh4#");
  await expect(page.getByLabel("Played move evaluation", { exact: true })).toContainText(/Before:.*After:/);
  await expect(page.getByLabel("Move assessment", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Moves", exact: true }).click();
  await page.getByLabel("Navigate evaluation graph", { exact: true }).click(); await page.getByRole("option", { name: /^Ply 1\b/ }).click();
  await page.getByRole("tab", { name: "Engine", exact: true }).click();
  await expect(page.getByLabel("Saved principal variations", { exact: true }).locator("li")).not.toHaveCount(0);
  const saved = await page.evaluate(() => new Promise<{ source: string; result: string; black: string; details: number }>((resolve) => {
    const request = indexedDB.open("chess-review"); request.onsuccess = () => {
      const db = request.result, transaction = db.transaction(["games", "positionAnalyses"]), games = transaction.objectStore("games").getAll(), positions = transaction.objectStore("positionAnalyses").getAll();
      transaction.oncomplete = () => { resolve({ ...games.result[0], details: positions.result.filter((row) => row.result && row.ply > 0).length }); db.close(); };
    };
  }));
  expect(saved).toMatchObject({ source: "computer", result: "0-1", black: "Atlas", details: 4 });
  await page.reload(); await expect(page.getByTestId("computer-status")).toHaveCount(0);
  await page.getByRole("button", { name: "Game library", exact: true }).click();
  await expect(page.getByRole("dialog").getByLabel("Saved games")).toContainText("Computer"); await expect(page.getByRole("dialog").getByLabel("Saved games")).toContainText("Atlas");
});

test("Black starts locked, abandonment is confirmed, and assistance resets for a new game", async ({ page }) => {
  await page.route("**/engines/analysis-worker.js", (route) => route.fulfill({ contentType: "application/javascript", body: worker }));
  await page.goto("/"); await page.getByRole("button", { name: "Play Computer", exact: true }).click();
  await page.getByRole("radio", { name: "Black", exact: true }).check(); await page.getByLabel("Assisted game").check();
  await page.getByRole("button", { name: "Start Game", exact: true }).click();
  await expect(page.getByTestId("chessboard")).toHaveAttribute("data-orientation", "black");
  await expect(page.getByTestId("chessboard")).toHaveAttribute("data-input-locked", "true");
  await page.getByRole("button", { name: "New Game", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Abandon unfinished game?" })).toBeVisible();
  await page.getByRole("button", { name: "Abandon game", exact: true }).click();
  await expect(page.getByRole("dialog").getByLabel("Assisted game")).not.toBeChecked();
});

test("assistance highlights current attacks and clears evaluations and arrows when disabled", async ({ page }) => {
  await page.route("**/engines/analysis-worker.js", (route) => route.fulfill({ contentType: "application/javascript", body: worker.replace('"e7e5"', '"d7d5"') }));
  await page.goto("/"); await page.getByRole("button", { name: "Play Computer", exact: true }).click();
  await page.getByRole("button", { name: /Atlas Master/ }).click(); await page.getByLabel("Assisted game").check();
  await page.getByRole("button", { name: "Start Game", exact: true }).click();
  await expect(page.getByLabel("Position evaluation", { exact: true })).toBeVisible();
  await page.getByTestId("square-e2").click(); await page.getByTestId("square-e4").click();
  await expect(page.getByTestId("chessboard")).toHaveAttribute("data-arrow-count", "0");
  await expect(page.getByTestId("square-d5")).toHaveAttribute("aria-label", "d5, Black pawn");
  await expect(page.getByTestId("square-e4")).toHaveAttribute("data-attacked", "true");
  await expect(page.getByLabel("Position evaluation", { exact: true })).toBeVisible();
  await page.getByLabel("Assisted game").uncheck();
  await expect(page.getByTestId("chessboard")).toHaveAttribute("data-attacked-count", "0");
  await expect(page.getByTestId("chessboard")).toHaveAttribute("data-arrow-count", "0");
  await expect(page.getByLabel("Position evaluation", { exact: true })).toHaveCount(0);
});

test("bundled Stockfish starts and makes a legal opening move", async ({ page }) => {
  await page.goto("/"); await page.getByRole("button", { name: "Play Computer", exact: true }).click();
  await page.getByRole("radio", { name: "Black", exact: true }).check();
  await page.getByRole("button", { name: "Start Game", exact: true }).click();
  await expect(page.getByTestId("computer-status")).toHaveText("Your turn", { timeout: 20000 });
  await expect(page.getByLabel("Move history")).toBeVisible();
  await expect(page.getByTestId("chessboard")).toHaveAttribute("data-input-locked", "false");
  await expect(page.getByRole("alert")).toBeEmpty();
});
