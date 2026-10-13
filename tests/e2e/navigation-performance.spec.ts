import { expect, test } from "@playwright/test";
import { build } from "esbuild";
import { Chess } from "chess.js";

test("rapid review navigation stays responsive and settles on the latest position", async ({ page }, info) => {
  test.setTimeout(60000);
  const worker = (await build({ entryPoints: ["tests/fixtures/game-analysis-worker.ts"], bundle: true, write: false, format: "iife", platform: "browser" })).outputFiles[0].text.replaceAll("900)", "1)").replaceAll("70)", "0)");
  await page.route("**/engines/analysis-worker.js", route => route.fulfill({ contentType: "application/javascript", body: worker }));
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  if (await page.getByRole("button", { name: "Import", exact: true }).isVisible()) await page.getByRole("button", { name: "Import", exact: true }).click();
  await page.getByRole("button", { name: "Paste PGN", exact: true }).click();
  const line = Array.from({ length: 20 }, (_, i) => `${i * 2 + 1}. Nf3 Nf6 ${i * 2 + 2}. Ng1 Ng8`).join(" ");
  await page.getByLabel("PGN games", { exact: true }).fill(`[White "Performance"]\n[Black "Test"]\n${line} 1/2-1/2`);
  await page.getByRole("button", { name: "Import 1 game", exact: true }).click();
  await page.getByRole("button", { name: "Start review", exact: true }).click({ timeout: 40000 });
  await page.getByRole("button", { name: "Last move", exact: true }).click();
  await expect(page.getByRole("button", { name: "Main line 40... Ng8", exact: true })).toHaveAttribute("aria-current", "step");
  await page.waitForTimeout(400);
  const profiler = process.env.NAV_PROFILE ? await page.context().newCDPSession(page) : null;
  if (profiler) { await profiler.send("Profiler.enable"); await profiler.send("Profiler.start"); }
  const timing = await page.evaluate(async () => {
    const frames: number[] = [], actions: number[] = [];
    let last = performance.now(), active = true;
    function frame(now: number) { frames.push(now - last); last = now; if (active) requestAnimationFrame(frame); }
    requestAnimationFrame(frame);
    for (let i = 0; i < 30; i++) {
      const start = performance.now();
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
      window.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowLeft", bubbles: true }));
      actions.push(performance.now() - start);
      await new Promise(resolve => setTimeout(resolve, 60));
    }
    await new Promise(resolve => setTimeout(resolve, 400)); active = false;
    const sorted = frames.slice(2).sort((a, b) => a - b);
    return { p95FrameMs: sorted[Math.floor(sorted.length * .95)], maxFrameMs: Math.max(...sorted), meanActionMs: actions.reduce((a, b) => a + b, 0) / actions.length, frames: frames.length };
  });
  console.log(`${info.project.name} navigation timing: ${JSON.stringify(timing)}`);
  if (info.project.use.baseURL?.endsWith(":3001")) {
    expect(timing.p95FrameMs, "Production navigation should avoid sustained frame stalls").toBeLessThan(50);
    expect(timing.meanActionMs, "Navigation handlers should not replay the full game").toBeLessThan(5);
  }
  if (profiler) {
    const { profile } = await profiler.send("Profiler.stop");
    const counts = new Map<number, number>();
    profile.samples?.forEach((id: number, index: number) => counts.set(id, (counts.get(id) ?? 0) + (profile.timeDeltas?.[index] ?? 0)));
    console.log(profile.nodes.map(node => ({ name: node.callFrame.functionName, file: node.callFrame.url.split("/").at(-1), ms: (counts.get(node.id) ?? 0) / 1000 })).sort((a, b) => b.ms - a.ms).slice(0, 18));
    await info.attach("navigation-cpu-profile", { body: JSON.stringify(profile), contentType: "application/json" });
  }
  await expect(page.getByRole("button", { name: "Main line 25... Nf6", exact: true })).toHaveAttribute("aria-current", "step");
  await expect(page.locator('[data-square="f3"] [data-piece="wN"]')).toHaveCount(1);
  await expect(page.locator('[data-square="f6"] [data-piece="bN"]')).toHaveCount(1);
});

test("interrupted animations preserve captures, castling, promotion and reduced motion", async ({ page }) => {
  test.setTimeout(60000);
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  const worker = (await build({ entryPoints: ["tests/fixtures/game-analysis-worker.ts"], bundle: true, write: false, format: "iife", platform: "browser" })).outputFiles[0].text.replaceAll("900)", "1)").replaceAll("70)", "0)");
  await page.route("**/engines/analysis-worker.js", route => route.fulfill({ contentType: "application/javascript", body: worker }));
  await page.emulateMedia({ reducedMotion: "no-preference" }); await page.goto("/");
  for (const [name, fen, line] of [
    ["Capture", new Chess().fen(), "1. e4 d5 2. exd5 Qxd5 *"],
    ["Castle", "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1", "1. O-O O-O-O *"],
    ["Promotion", "r6k/1P6/8/8/8/8/8/7K w - - 0 1", "1. bxa8=Q+ *"],
  ]) {
    if (await page.getByRole("button", { name: "Import", exact: true }).isVisible()) await page.getByRole("button", { name: "Import", exact: true }).click();
  await page.getByRole("button", { name: "Paste PGN", exact: true }).click();
    await page.getByLabel("PGN games", { exact: true }).fill(`[White "${name}"]\n[SetUp "1"]\n[FEN "${fen}"]\n${line}`);
    await page.getByRole("button", { name: "Import 1 game", exact: true }).click();
    await page.getByRole("button", { name: "Start review", exact: true }).click();
    await page.getByTestId("chessboard").evaluate(element => element.setAttribute("data-mount-probe", "retained"));
    await page.evaluate(async () => {
      for (const key of ["ArrowRight", "ArrowRight", "ArrowLeft", "End", "Home", "End", "Home"]) {
        window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
        window.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
        await new Promise(resolve => setTimeout(resolve, 45));
      }
    });
    await page.waitForTimeout(450);
    const pieces = new Chess(fen).board().flat().filter(piece => piece !== null);
    for (const piece of pieces) await expect(page.locator(`[data-square="${piece.square}"] [data-piece="${piece.color}${piece.type.toUpperCase()}"]`)).toHaveCount(1);
    await expect(page.getByTestId("chessboard").locator("[data-piece]")).toHaveCount(pieces.length);
    await expect(page.getByTestId("chessboard")).toHaveAttribute("data-mount-probe", "retained");
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Last move", exact: true }).click();
  await expect(page.locator('[data-square="a8"] [data-piece="wQ"]')).toHaveCount(1);
  await page.getByRole("button", { name: "First position", exact: true }).click();
  await expect(page.locator('[data-square="b7"] [data-piece="wP"]')).toHaveCount(1);
  expect(errors).toEqual([]);
});
