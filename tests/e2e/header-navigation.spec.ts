import { expect, test } from "@playwright/test";
import { build } from "esbuild";

test("imports collapse on desktop and the complete move list supports held navigation", async ({ page }, info) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  const worker = (await build({ entryPoints: ["tests/fixtures/game-analysis-worker.ts"], bundle: true, write: false, format: "iife", platform: "browser" })).outputFiles[0].text.replaceAll("900)", "1)").replaceAll("70)", "0)");
  await page.route("**/engines/analysis-worker.js", route => route.fulfill({ contentType: "application/javascript", body: worker }));
  await page.goto("/");
  await expect(page.locator("header").getByRole("button", { name: "Game library", exact: true })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Library", exact: true })).toBeVisible();
  if (info.project.name === "desktop") {
    await expect(page.getByRole("button", { name: "Paste PGN", exact: true })).toBeHidden();
    await page.getByRole("button", { name: "Import", exact: true }).hover();
    await expect(page.getByRole("button", { name: "Paste PGN", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Import", exact: true }).press("Escape");
    await expect(page.getByRole("button", { name: "Paste PGN", exact: true })).toBeHidden();
    await page.getByRole("button", { name: "Import", exact: true }).click();
  }
  await page.getByRole("button", { name: "Paste PGN", exact: true }).click();
  const line = Array.from({ length: 30 }, (_, i) => `${i * 2 + 1}. Nf3 Nf6 ${i * 2 + 2}. Ng1 Ng8`).join(" ");
  await page.getByLabel("PGN games", { exact: true }).fill(`[White "Navigation"]\n[Black "Test"]\n${line} 1/2-1/2`);
  await page.getByRole("button", { name: "Import 1 game", exact: true }).click();
  await page.getByRole("button", { name: "Close and pause", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Main line / })).toHaveCount(120);
  await expect(page.getByRole("navigation", { name: "Move list pages" })).toHaveCount(0);
  await page.keyboard.press("Home");
  // Native repeat events must not add steps on top of the 250 ms timer.
  const samples = await page.evaluate(async () => {
    const started = performance.now();
    const selected = () => document.querySelector('.move-cell[aria-current="step"]')?.getAttribute("aria-label") ?? "start";
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    const values = [{ label: selected(), ms: performance.now() - started }];
    for (let i = 0; i < 3; i++) {
      await new Promise(resolve => setTimeout(resolve, 85));
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", repeat: true, bubbles: true }));
      values.push({ label: selected(), ms: performance.now() - started });
    }
    window.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowRight", bubbles: true }));
    return values;
  });
  for (const sample of samples.slice(1)) {
    const number = Number(sample.label.match(/Main line (\d+)/)?.[1]);
    const ply = number * 2 - (sample.label.includes("...") ? 0 : 1);
    expect(ply).toBeLessThanOrEqual(1 + Math.floor(sample.ms / 250));
  }
  // More than 50 consecutive steps catches the reported React update-depth failure.
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(14000);
  await page.keyboard.up("ArrowRight");
  const selection = await page.locator('.move-cell[aria-current="step"]').getAttribute("aria-label");
  expect(Number(selection?.match(/Main line (\d+)/)?.[1])).toBeGreaterThan(25);
  await page.waitForTimeout(350);
  await expect(page.locator('.move-cell[aria-current="step"]')).toHaveAttribute("aria-label", selection!);
  await page.keyboard.down("ArrowLeft"); await page.waitForTimeout(550); await page.keyboard.up("ArrowLeft");
  await expect(page.locator('.move-cell[aria-current="step"]')).not.toHaveAttribute("aria-label", selection!);
  await page.getByRole("button", { name: "Last move", exact: true }).click();
  await page.keyboard.down("ArrowRight"); await page.waitForTimeout(600); await page.keyboard.up("ArrowRight");
  await expect(page.getByRole("button", { name: "Main line 60... Ng8", exact: true })).toHaveAttribute("aria-current", "step");
  expect(errors.filter(error => /same key|Maximum update depth/i.test(error))).toEqual([]);
});
