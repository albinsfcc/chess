import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// Run `npm run build` first. Production measurements exclude dev-tool overhead.
export default defineConfig({
  ...base,
  testMatch: "navigation-performance.spec.ts",
  use: { ...base.use, baseURL: "http://localhost:3001" },
  webServer: { command: "npm run start -- --port 3001", url: "http://localhost:3001", reuseExistingServer: false, timeout: 60000 },
});
