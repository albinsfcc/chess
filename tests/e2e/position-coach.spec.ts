import { expect, test } from "@playwright/test";

test("coach follows the selected position and exposes the thinking routine", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Coach", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Position coach", exact: true })).toBeVisible();
  await expect(page.getByTestId("coach-summary")).toContainText("White to move");
  await page.getByTestId("square-e2").click();
  await page.getByTestId("square-e4").click();
  await expect(page.getByTestId("coach-summary")).toContainText("Black to move");
  await expect(page.getByText(/White played e4: the pawn/).first()).toBeVisible();
  await page.getByText("Pawn structure", { exact: true }).click();
  await expect(page.getByText(/White: no isolated, doubled, or passed pawns/)).toBeVisible();
  await page.getByText("Your five-step thinking routine", { exact: true }).click();
  await expect(page.getByText(/Before playing, picture the resulting board/)).toBeVisible();
  await page.getByRole("button", { name: "Undo move", exact: true }).click();
  await expect(page.getByTestId("coach-summary")).toContainText("White to move");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
