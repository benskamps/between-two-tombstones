import { defineConfig, devices } from "@playwright/test";

// BASE_URL points the suite at a deployed URL (preview or prod); otherwise it
// starts a local production server (run `pnpm build` first).
const baseURL = process.env.BASE_URL ?? "http://localhost:3100";
// Against a deployed URL from a sandbox whose egress goes through an HTTPS
// proxy, route Playwright's browser and request client through it too.
const remote = !/^https?:\/\/(localhost|127\.0\.0\.1)\b/.test(baseURL);
const proxyServer = remote ? (process.env.HTTPS_PROXY ?? process.env.https_proxy) : undefined;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30000,
  retries: 0,
  workers: 2,
  use: { baseURL, ...devices["Pixel 7"], ...(proxyServer ? { proxy: { server: proxyServer } } : {}) },
  webServer: process.env.BASE_URL
    ? undefined
    : { command: "pnpm start -p 3100", url: baseURL, timeout: 60000, reuseExistingServer: true },
});
