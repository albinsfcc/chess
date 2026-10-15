import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("chess-review:sound:v1", "false");
    const events: string[] = [];
    Object.defineProperty(window, "coachSpeechEvents", { value: events });
    const voices = [{ voiceURI: "local-test", name: "Test local English", lang: "en-US", localService: true, default: true }];
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: { getVoices: () => voices, addEventListener() {}, removeEventListener() {}, cancel() { events.push("cancel"); }, speak(utterance: SpeechSynthesisUtterance) { events.push(utterance.text); utterance.onstart?.({} as SpeechSynthesisEvent); } } });
    Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, value: class { constructor(public text: string) {} } });
  });
  await page.goto("/");
});

test("comments on moves, speaks on request, and cancels stale speech", async ({ page }, testInfo) => {
  await expect(page.getByRole("complementary", { name: "Move commentary coach" })).toBeVisible();
  await page.getByRole("button", { name: "Enable coach voice", exact: true }).click();
  await page.getByTestId("square-e2").click(); await page.getByTestId("square-e4").click();
  await expect(page.getByTestId("coach-comment")).toContainText("e4 — A classic first move!");
  await expect.poll(() => page.evaluate(() => (window as unknown as { coachSpeechEvents: string[] }).coachSpeechEvents.some(text => text.includes("pawn to e 4")))).toBe(true);
  await page.screenshot({ path: `artifacts/floating-coach-${testInfo.project.name}.png`, fullPage: true });
  await page.getByRole("button", { name: "Mute coach voice", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { coachSpeechEvents: string[] }).coachSpeechEvents.at(-1))).toBe("cancel");
  await page.getByRole("button", { name: "Minimize coach commentary", exact: true }).click();
  await expect(page.getByTestId("coach-comment")).toBeHidden();
  const avatar = await page.getByRole("button", { name: "Open Maia's commentary", exact: true }).boundingBox();
  expect(avatar!.x + avatar!.width).toBeGreaterThan(page.viewportSize()!.width - 30);
  await page.getByRole("button", { name: "Undo move", exact: true }).click();
  await expect(page.getByTestId("coach-comment")).toContainText("I'm here to help");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Explain position", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Position coach", exact: true })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Move commentary coach" })).toBeHidden();
});

test("selects avatars, previews a voice, persists settings, and hides the coach", async ({ page }) => {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const iris = page.getByRole("button", { name: /Iris Bright & curious/ });
  await iris.click(); await expect(iris).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Iris’s voice", { exact: false }).selectOption("local-test");
  await page.getByRole("button", { name: "Preview Iris’s voice" }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { coachSpeechEvents: string[] }).coachSpeechEvents.some(text => text.includes("Hi, I'm Iris")))).toBe(true);
  await page.reload();
  await expect(page.getByRole("button", { name: "Minimize Iris's commentary", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByLabel("Iris’s voice", { exact: false })).toHaveValue("local-test");
  await page.getByRole("switch", { name: "Show chess coach" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("complementary", { name: "Move commentary coach" })).toBeHidden();
});
