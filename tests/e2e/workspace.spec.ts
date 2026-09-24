import { expect, test, type Page } from "@playwright/test";

async function clickMove(page: Page, from: string, to: string) {
  await page.getByTestId(`square-${from}`).click();
  await page.getByTestId(`square-${to}`).click();
}

async function dragMove(page: Page, from: string, to: string) {
  await page.getByTestId(`square-${from}`).scrollIntoViewIfNeeded();
  const source = await page.getByTestId(`square-${from}`).boundingBox();
  const target = await page.getByTestId(`square-${to}`).boundingBox();
  if (!source || !target) throw new Error("Board squares are not visible");
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(source.x + source.width / 2 + 10, source.y + source.height / 2, { steps: 3 });
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 12 });
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("square-e2")).toHaveAttribute("aria-label", "e2, White pawn");
});

test("standard board, coordinates, placeholders and responsive layout", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Workspace", exact: true })).toBeVisible();
  await expect(page.getByTestId("game-status")).toHaveText("White to move");
  await expect(page.locator('[data-square="a1"]')).toContainText("a");
  await expect(page.locator('[data-square="a8"]')).toContainText("8");
  for (const name of ["Start analysis"]) {
    await expect(page.getByRole("button", { name, exact: true })).toBeEnabled();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: `artifacts/workspace-${page.viewportSize()?.width}.png`, fullPage: true });
});

test("click moves, illegal move rejection, undo, redo, flip and reset", async ({ page }) => {
  await clickMove(page, "e2", "e5");
  await expect(page.getByTestId("square-e2")).toHaveAttribute("aria-label", "e2, White pawn");
  await page.getByTestId("square-e4").click();
  await expect(page.getByTestId("square-e4")).toHaveAttribute("aria-label", "e4, White pawn");
  await expect(page.getByTestId("square-e4")).toHaveAttribute("data-last-move", "true");
  await expect(page.getByTestId("square-e4")).toHaveCSS("background-image", /linear-gradient/);
  await page.getByRole("button", { name: "Undo move", exact: true }).click();
  await expect(page.getByTestId("square-e2")).toHaveAttribute("aria-label", "e2, White pawn");
  await page.getByRole("button", { name: "Redo move", exact: true }).click();
  await expect(page.getByTestId("square-e4")).toHaveAttribute("aria-label", "e4, White pawn");
  await page.getByRole("button", { name: "Flip", exact: true }).click();
  await expect(page.getByTestId("chessboard")).toHaveAttribute("data-orientation", "black");
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page.getByTestId("square-e2")).toHaveAttribute("aria-label", "e2, White pawn");
  await expect(page.getByRole("button", { name: "Redo move", exact: true })).toBeDisabled();
});

test("drag moves accept legal destinations and reject illegal ones", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Mouse drag is tested on desktop; touch moves are tested separately.");
  await dragMove(page, "e2", "e5");
  await expect(page.getByTestId("square-e2")).toHaveAttribute("aria-label", "e2, White pawn");
  await dragMove(page, "e2", "e4");
  await expect(page.getByTestId("square-e4")).toHaveAttribute("aria-label", "e4, White pawn");
});

test("promotion can be cancelled, chosen and undone", async ({ page }, testInfo) => {
  for (const [from, to] of [["a2", "a4"], ["h7", "h5"], ["a4", "a5"], ["h5", "h4"], ["a5", "a6"], ["h4", "h3"], ["a6", "b7"], ["h3", "g2"]]) {
    await clickMove(page, from, to);
  }
  await clickMove(page, "b7", "a8");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Cancel move" }).click();
  await expect(page.getByTestId("square-b7")).toHaveAttribute("aria-label", "b7, White pawn");
  if (testInfo.project.name === "desktop") await dragMove(page, "b7", "a8");
  else await clickMove(page, "b7", "a8");
  await page.getByRole("button", { name: "Knight", exact: true }).click();
  await expect(page.getByTestId("square-a8")).toHaveAttribute("aria-label", "a8, White knight");
  await page.getByRole("button", { name: "Undo move", exact: true }).click();
  await expect(page.getByTestId("square-b7")).toHaveAttribute("aria-label", "b7, White pawn");
  await page.getByRole("button", { name: "Redo move", exact: true }).click();
  await expect(page.getByTestId("square-a8")).toHaveAttribute("aria-label", "a8, White knight");
});

test("checked king is highlighted", async ({ page }) => {
  for (const [from, to] of [["f2", "f3"], ["e7", "e5"], ["g2", "g4"], ["d8", "h4"]]) await clickMove(page, from, to);
  await expect(page.getByTestId("game-status")).toHaveText("Checkmate · Black wins");
  await expect(page.getByTestId("square-e1")).toHaveAttribute("data-check", "true");
  await expect(page.getByTestId("square-e1")).toHaveCSS("background-image", /radial-gradient/);
});

test("board preferences survive reload without persisting the game", async ({ page }) => {
  await clickMove(page, "e2", "e4");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Light squares").fill("#ffffff");
  await page.getByLabel("Dark squares").fill("#234567");
  await page.getByRole("switch", { name: "Show coordinates" }).click();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.reload();
  await expect(page.getByTestId("square-e2")).toHaveAttribute("aria-label", "e2, White pawn");
  await expect(page.locator('[data-square="a8"]')).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(page.locator('[data-square="a1"]')).toHaveCSS("background-color", "rgb(35, 69, 103)");
  await expect(page.locator('[data-square="a1"]')).not.toContainText("a");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("switch", { name: "Show coordinates" })).not.toBeChecked();
});

test("touch tap moves work", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Touch input is tested on mobile.");
  await page.getByTestId("square-d2").tap();
  await page.getByTestId("square-d4").tap();
  await expect(page.getByTestId("square-d4")).toHaveAttribute("aria-label", "d4, White pawn");
});
