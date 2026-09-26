import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// Isolated production server avoids accidentally testing an older workspace on :3000.
export default defineConfig({
  ...base,
  testMatch: /(?:computer|import-review|appearance)\.spec\.ts/,
  use: { ...base.use, baseURL: "http://localhost:3102" },
  webServer: { command: "npm run start -- --port 3102", url: "http://localhost:3102", reuseExistingServer: false, timeout: 120_000 },
});
