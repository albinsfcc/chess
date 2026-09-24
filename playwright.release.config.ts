import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig(base, {
  timeout: 45_000,
  use: { ...base.use, baseURL: "http://localhost:3106" },
  webServer: { command: "node node_modules/next/dist/bin/next start --port 3106", url: "http://localhost:3106", reuseExistingServer: false, timeout: 60_000 },
});
