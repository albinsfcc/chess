import { expect, test } from "@playwright/test";

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
