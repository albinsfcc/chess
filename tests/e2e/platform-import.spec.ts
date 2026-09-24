import { expect, test, type Page } from "@playwright/test";
import { wireFixture } from "../../src/lib/platforms/fixtures";

async function mockPlatforms(page: Page) {
  await page.route("**/api/platforms/**", async (route) => {
    const url = new URL(route.request().url());
    const platform = url.pathname.includes("chesscom") ? "chesscom" : "lichess";
    const username = url.searchParams.get("username") ?? "alice";
    if (url.pathname.endsWith("/profile")) {
      if (username === "missing") return route.fulfill({ status: 404, json: { error: { code: "not_found", message: "Public profile was not found." } } });
      return route.fulfill({ json: { platform, username, canonicalUsername: username.toLowerCase(), displayName: `Player ${username}` } });
    }
    if (url.pathname.endsWith("/archives")) return route.fulfill({ json: { months: ["2026-08", "2026-09"] } });
    const games = [wireFixture, { ...wireFixture, externalId: "live:456", pgn: wireFixture.pgn.replaceAll("Alice", "Carol"), rated: false }];
    if (platform === "chesscom") return route.fulfill({ json: { games, warnings: [] } });
    return route.fulfill({ contentType: "application/x-ndjson", body: [...games.map((game, index) => ({ type: "game", game: { ...game, source: "lichess", externalId: `abcd123${index}`, externalUrl: `https://lichess.org/abcd123${index}` } })), { type: "complete", count: games.length, limited: false }].map((event) => JSON.stringify(event)).join("\n") + "\n" });
  });
}
async function saveProfile(page: Page, platform: string, username: string) {
  await page.getByLabel(`${platform} username`, { exact: true }).fill(username);
  await page.getByRole("button", { name: "Validate profile", exact: true }).click();
  await expect(page.getByLabel("Validated profile")).toContainText(`Player ${username}`);
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(page.getByRole("button", { name: "Refresh Games", exact: true })).toBeEnabled();
}
async function closeDialog(page: Page) {
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).last().click();
}

for (const platform of ["Chess.com", "Lichess"]) {
  test(`${platform}: save profile, discover, import selection, deduplicate refresh and change profile`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await mockPlatforms(page);
    await page.goto("/");
    await page.getByRole("button", { name: `Import from ${platform}`, exact: true }).click();
    await saveProfile(page, platform, "alice");
    await page.getByRole("button", { name: "Refresh Games", exact: true }).click();
    await expect(page.getByRole("checkbox", { name: "Select Alice vs Bob", exact: true })).toBeEnabled();
    await expect(page.getByLabel("Discovered games")).toContainText("Alice (1500) vs Bob (1450)");
    await page.getByLabel("Rated/casual", { exact: true }).selectOption("rated");
    await expect(page.getByRole("checkbox", { name: "Select Carol vs Bob", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Select visible", exact: true }).click();
    await page.getByRole("button", { name: "Import selected", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "1 imported" })).toBeVisible();
    await page.getByLabel("Rated/casual", { exact: true }).selectOption("all");
    await page.getByRole("button", { name: "Refresh Games", exact: true }).click();
    await expect(page.getByRole("checkbox", { name: "Select Alice vs Bob", exact: true })).toBeDisabled();
    await expect(page.getByText("Already imported", { exact: true }).last()).toBeVisible();
    await closeDialog(page);
    await expect(page.getByRole("button", { name: "Open Alice vs Bob", exact: true })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Open Carol vs Bob", exact: true })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("button", { name: "Open Alice vs Bob", exact: true })).toHaveCount(1);
    await page.getByRole("button", { name: `Import from ${platform}`, exact: true }).click();
    await expect(page.getByText("@alice", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Change Profile", exact: true }).click();
    await saveProfile(page, platform, "other");
    await expect(page.getByText("@other", { exact: true })).toBeVisible();
    await page.screenshot({ path: `artifacts/platform-${platform}-${page.viewportSize()?.width}.png`, fullPage: true });
    await closeDialog(page);
    await page.reload();
    await page.getByRole("button", { name: `Import from ${platform}`, exact: true }).click();
    await expect(page.getByText("@other", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Remove Profile", exact: true }).click();
    await page.getByRole("button", { name: "Remove saved profile", exact: true }).click();
    await expect(page.getByLabel(`${platform} username`, { exact: true })).toBeVisible();
    await closeDialog(page);
    await expect(page.getByRole("button", { name: "Open Alice vs Bob", exact: true })).toHaveCount(1);
    expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain("alice");
    expect(errors).toEqual([]);
  });
}

test("profile lookup errors preserve the username and allow retry", async ({ page }) => {
  await mockPlatforms(page); await page.goto("/");
  await page.getByRole("button", { name: "Import from Lichess", exact: true }).click();
  await page.getByLabel("Lichess username", { exact: true }).fill("missing");
  await page.getByRole("button", { name: "Validate profile", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("not found");
  await expect(page.getByLabel("Lichess username", { exact: true })).toHaveValue("missing");
  await saveProfile(page, "Lichess", "alice");
});
