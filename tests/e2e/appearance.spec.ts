import { expect, test } from "@playwright/test";
import { BOARD_TEXTURES } from "../../src/lib/board-textures";

test("six supplied wooden boards preview, persist, and keep the board playable with an asset fallback", async ({ page }) => {
  await page.goto("/");
  for (const texture of BOARD_TEXTURES) {
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("button", { name: texture.name, exact: true }).click();
    await expect(page.getByLabel("Board and pieces preview").locator('[style*="/boards/"]')).toHaveCount(12);
    await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.getByTestId("chessboard")).toHaveCSS("background-image", new RegExp(texture.asset));
    await page.reload();
    await expect(page.getByTestId("chessboard")).toHaveCSS("background-image", new RegExp(texture.asset));
  }
  await page.getByTestId("square-e2").click(); await page.getByTestId("square-e4").click();
  await expect(page.getByTestId("square-e4")).toHaveAttribute("aria-label", "e4, White pawn");
  await expect(page.getByTestId("square-e4")).toHaveAttribute("data-last-move", "true");
  await page.getByRole("button", { name: "Flip", exact: true }).click();
  await expect(page.getByTestId("chessboard")).toHaveAttribute("data-orientation", "black");
  await expect(page.getByTestId("square-e4")).toHaveAttribute("aria-label", "e4, White pawn");
  await page.getByTestId("chessboard").screenshot({ path: `artifacts/supplied-wood-${page.viewportSize()?.width}.png` });
  await page.route("**/boards/smoked-oak.png", route => route.abort());
  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByText("Texture unavailable. Using matching square colours.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Smoked Oak", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByTestId("chessboard")).toHaveCSS("background-image", "none");
  await expect(page.getByTestId("board-playing-area")).toHaveCSS("margin-top", "0px");
  await expect(page.locator('[data-square="a8"]')).toHaveCSS("background-color", "rgb(209, 203, 187)");
});

test("wooden board and carved pieces preview live, survive reload, and fall back on asset failure", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Wooden", exact: true }).click();
  await page.getByRole("button", { name: "Carved", exact: true }).click();
  await expect(page.getByLabel("Board and pieces preview").locator("img")).toHaveCount(12);
  await expect(page.getByRole("button", { name: "Wooden", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByTestId("chessboard").locator('img[src="/pieces/carved/wK.svg"]')).toHaveCount(1);
  await page.reload();
  await expect(page.getByTestId("chessboard").locator('img[src="/pieces/carved/wK.svg"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("button", { name: "Carved", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Wooden", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Board and pieces preview").screenshot({ path: `artifacts/wooden-carved-${page.viewportSize()?.width}.png` });
  await page.route("**/pieces/carved/wK.svg", route => route.abort());
  await page.reload();
  await expect(page.getByTestId("chessboard").locator('img[src="/pieces/carved/bK.svg"]')).toHaveCount(1);
  await expect(page.getByTestId("square-e1").locator("svg")).toHaveCount(1);
  await expect(page.getByTestId("chessboard").locator('img[src="/pieces/carved/wK.svg"]')).toHaveCount(0);
});

test("sculpted classic pieces preview live, survive reload, and fall back on asset failure", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Wooden", exact: true }).click();
  await page.getByRole("button", { name: "Sculpted Classic", exact: true }).click();
  await expect(page.getByLabel("Board and pieces preview").locator("img")).toHaveCount(12);
  await expect(page.getByRole("button", { name: "Wooden", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByTestId("chessboard").locator('img[src="/pieces/sculpted/wK.svg"]')).toHaveCount(1);
  await page.reload();
  await expect(page.getByTestId("chessboard").locator('img[src="/pieces/sculpted/wK.svg"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sculpted Classic", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Wooden", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Board and pieces preview").screenshot({ path: `artifacts/sculpted-classic-${page.viewportSize()?.width}.png` });
  await page.route("**/pieces/sculpted/wK.svg", route => route.abort());
  await page.reload();
  await expect(page.getByTestId("chessboard").locator('img[src="/pieces/sculpted/bK.svg"]')).toHaveCount(1);
  await expect(page.getByTestId("square-e1").locator("svg")).toHaveCount(1);
  await expect(page.getByTestId("chessboard").locator('img[src="/pieces/sculpted/wK.svg"]')).toHaveCount(0);
});

test("soft classic pieces preview live, survive reload, and fall back on asset failure", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Wooden", exact: true }).click();
  await page.getByRole("button", { name: "Soft Classic", exact: true }).click();
  await expect(page.getByLabel("Board and pieces preview").locator("img")).toHaveCount(12);
  await expect(page.getByRole("button", { name: "Wooden", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByTestId("chessboard").locator('img[src="/pieces/soft-classic/wK.svg"]')).toHaveCount(1);
  await page.reload();
  await expect(page.getByTestId("chessboard").locator('img[src="/pieces/soft-classic/wK.svg"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("button", { name: "Soft Classic", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Wooden", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Board and pieces preview").screenshot({ path: `artifacts/soft-classic-${page.viewportSize()?.width}.png` });
  await page.route("**/pieces/soft-classic/wK.svg", route => route.abort());
  await page.reload();
  await expect(page.getByTestId("chessboard").locator('img[src="/pieces/soft-classic/bK.svg"]')).toHaveCount(1);
  await expect(page.getByTestId("square-e1").locator("svg")).toHaveCount(1);
  await expect(page.getByTestId("chessboard").locator('img[src="/pieces/soft-classic/wK.svg"]')).toHaveCount(0);
});

test("light appearance previews immediately, persists, and styles portal dialogs", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Light", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).toHaveCSS("color-scheme", "light");
  await expect(page.getByRole("button", { name: "Light", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
  await page.reload(); await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByTestId("square-e2").click(); await page.getByTestId("square-e4").click();
  await expect(page.getByTestId("square-e4")).toHaveAttribute("aria-label", "e4, White pawn");
  await page.screenshot({ path: `artifacts/light-workspace-${page.viewportSize()?.width}.png` });
  await page.getByRole("button", { name: "Play Computer", exact: true }).click();
  await page.screenshot({ path: `artifacts/light-setup-${page.viewportSize()?.width}.png` });
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload(); await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({ path: `artifacts/glass-dark-workspace-${page.viewportSize()?.width}.png` });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCSS("background-image", /linear-gradient/);
  await page.screenshot({ path: `artifacts/glass-dark-settings-${page.viewportSize()?.width}.png` });
  await page.getByRole("button", { name: "Light", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCSS("background-image", /linear-gradient/);
  await page.screenshot({ path: `artifacts/glass-light-settings-${page.viewportSize()?.width}.png` });
});



test("glass blur persists and custom selects support keyboard selection", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("slider", { name: /Glass blur/ }).fill("8");
  await expect(page.getByRole("dialog")).toHaveCSS("backdrop-filter", "blur(8px) saturate(1.4)");
  const preset = page.getByRole("combobox", { name: "Analysis preset", exact: true });
  await preset.click();
  await page.getByRole("option", { name: /Deep/ }).click();
  await expect(preset).toContainText("Deep");
  await preset.focus(); await page.keyboard.press("Enter");
  await page.keyboard.press("Home"); await page.keyboard.press("Enter");
  await expect(preset).toContainText("Quick");
  await page.getByRole("button", { name: "Light", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCSS("backdrop-filter", "blur(8px) saturate(1.4)");
  await preset.click();
  await page.screenshot({ path: `artifacts/glass-select-light-${page.viewportSize()?.width}.png` });
  await page.keyboard.press("Escape");
  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("slider", { name: /Glass blur/ })).toHaveValue("8");
  await expect(page.getByRole("combobox", { name: "Analysis preset", exact: true })).toContainText("Quick");
});

test("current opening follows moves and navigation without opening the tab", async ({ page }) => {
  await page.goto("/");
  for (const [from, to] of [["e2", "e4"], ["c7", "c5"], ["g1", "f3"], ["b8", "c6"]]) {
    await page.getByTestId(`square-${from}`).click(); await page.getByTestId(`square-${to}`).click();
  }
  await expect(page.getByLabel("Current opening", { exact: true })).toContainText("Sicilian");
  await expect(page.getByLabel("Current opening", { exact: true }).locator(".opening-variation")).toBeVisible();
  await page.screenshot({ path: `artifacts/current-opening-${page.viewportSize()?.width}.png` });
  await page.getByRole("button", { name: "Go to start", exact: true }).click();
  await expect(page.getByLabel("Current opening", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Go to latest move", exact: true }).click();
  await expect(page.getByLabel("Current opening", { exact: true })).toContainText("Old Sicilian");
});


test("focus mode keeps the live board and exits without losing moves", async ({ page }) => {
  // Exercise the fallback available on browsers that disallow fullscreen.
  await page.addInitScript(() => { document.documentElement.requestFullscreen = () => Promise.reject(new Error("unavailable")); });
  await page.goto("/");
  await page.getByTestId("square-e2").click(); await page.getByTestId("square-e4").click();
  await page.getByRole("button", { name: "Focus mode", exact: true }).click();
  await expect(page.locator(".workspace-shell")).toHaveAttribute("data-focus", "true");
  await expect(page.getByRole("button", { name: "Settings", exact: true })).toBeHidden();
  await expect(page.getByTestId("top-player")).toBeVisible();
  await expect(page.getByTestId("bottom-player")).toBeVisible();
  await page.getByTestId("square-e7").click(); await page.getByTestId("square-e5").click();
  await expect(page.getByTestId("square-e5")).toHaveAttribute("aria-label", "e5, Black pawn");
  await page.screenshot({ path: `artifacts/focus-mode-${page.viewportSize()?.width}.png` });
  await page.getByRole("button", { name: "Exit focus", exact: true }).click();
  await expect(page.getByRole("button", { name: "Settings", exact: true })).toBeVisible();
  await expect(page.getByTestId("square-e5")).toHaveAttribute("aria-label", "e5, Black pawn");
  await page.getByRole("button", { name: "Focus mode", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".workspace-shell")).toHaveAttribute("data-focus", "false");
});

test("castling accepts a king dragged beyond its destination", async ({ page }) => {
  await page.goto("/");
  for (const [from, to] of [["e2","e4"],["e7","e5"],["g1","f3"],["b8","c6"],["f1","c4"],["g8","f6"]]) {
    await page.getByTestId(`square-${from}`).click(); await page.getByTestId(`square-${to}`).click();
  }
  await page.getByTestId("square-e1").scrollIntoViewIfNeeded();
  const from = await page.getByTestId("square-e1").boundingBox(), to = await page.getByTestId("square-h1").boundingBox();
  await page.mouse.move(from!.x + from!.width/2, from!.y + from!.height/2);
  await page.mouse.down();
  await page.mouse.move(to!.x + to!.width/2, to!.y + to!.height/2, { steps: 15 });
  await page.mouse.up();
  await expect(page.getByTestId("square-g1")).toHaveAttribute("aria-label", "g1, White king");
  await expect(page.getByTestId("square-f1")).toHaveAttribute("aria-label", "f1, White rook");
});

test("dialogs animate gently and respect reduced motion", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCSS("animation-name", "modal-arrive");
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCSS("animation-name", "none");
});


test("focus requests browser fullscreen and exits cleanly", async ({ page }) => {
  await page.goto("/");
  test.skip(!await page.evaluate(() => document.fullscreenEnabled), "Browser does not expose fullscreen");
  await page.getByRole("button", { name: "Focus mode", exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === document.documentElement)).toBe(true);
  await page.getByRole("button", { name: "Exit focus", exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  await expect(page.locator(".workspace-shell")).toHaveAttribute("data-focus", "false");
});
