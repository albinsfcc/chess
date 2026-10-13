import { expect, test } from "@playwright/test";

test("recorded move sounds play during moves, backward/forward navigation and focus", async ({ page }) => {
  await page.addInitScript(() => {
    const events: { source: string; result: string }[] = [];
    Object.assign(window, { soundEvents: events });
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      const result = play.call(this);
      void result.then(() => events.push({ source: this.src, result: "played" }), error => events.push({ source: this.src, result: error.name }));
      return result;
    };
  });
  await page.goto("/");
  await page.getByTestId("square-e2").click(); await page.getByTestId("square-e4").click();
  const sounds = () => page.evaluate(() => (window as unknown as { soundEvents: { source: string; result: string }[] }).soundEvents);
  await expect.poll(sounds).toEqual([{ source: expect.stringContaining("/sounds/move-self.mp3"), result: "played" }]);
  await page.getByRole("button", { name: "Undo move", exact: true }).click();
  await expect.poll(async () => (await sounds()).filter(event => event.result === "played").length).toBe(2);
  await page.getByRole("button", { name: "Focus mode", exact: true }).click();
  await page.getByRole("button", { name: "Redo move", exact: true }).click();
  await expect.poll(async () => (await sounds()).filter(event => event.result === "played").length).toBe(3);
  await page.getByRole("button", { name: "Exit focus", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("switch", { name: "Sound effects", exact: true }).click();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Undo move", exact: true }).click();
  await page.waitForTimeout(200);
  expect((await sounds()).filter(event => event.result === "played")).toHaveLength(3);
});
