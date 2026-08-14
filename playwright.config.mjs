import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  use: {
    baseURL: "http://127.0.0.1:7082",
    browserName: "chromium",
  },
  webServer: {
    command: "npm run dev:cloudflare",
    url: "http://127.0.0.1:7082",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
