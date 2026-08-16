import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: /desktop-search-failure\.spec\.mjs/,
  use: {
    baseURL: "http://127.0.0.1:7079",
    browserName: "chromium",
  },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:7079",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
