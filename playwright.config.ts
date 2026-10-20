import { defineConfig, devices } from "@playwright/test";

// BASE_URL points the suite at a deployed URL (preview or prod); otherwise it
// starts a local production server (run `pnpm build` first).
const baseURL = process.env.BASE_URL ?? "http://localhost:3100";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30000,
  retries: 0,
  workers: 2,
  use: { baseURL, ...devices["Pixel 7"] },
  webServer: process.env.BASE_URL
    ? undefined
    : { command: "pnpm start -p 3100", url: baseURL, timeout: 60000, reuseExistingServer: true },
});
