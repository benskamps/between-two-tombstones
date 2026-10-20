// TEMPORARY probe: does a background (hidden) page slow the render? Deleted before commit.
import path from "node:path";
import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 412, height: 915 } });

for (const mainThread of [false, true]) {
  test(`hidden page, ${mainThread ? "main" : "worker"}`, async ({ page, context }) => {
    test.setTimeout(120000);
    await page.addInitScript((m) => {
      localStorage.setItem("btt-etiquette-seen", "1");
      if (m) delete (window as { Worker?: unknown }).Worker;
    }, mainThread);
    await page.goto("/stamp");
    const other = await context.newPage();
    await other.goto("about:blank");
    await other.bringToFront();
    const vis = await page.evaluate(() => document.visibilityState);
    await page.locator("#stamp-photo").setInputFiles(path.resolve("tests/fixtures/stones/AlfredIversonJrGrave.jpg"));
    await expect
      .poll(async () => Number(await page.getByTestId("previews").getAttribute("data-job")), { timeout: 90000 })
      .toBeGreaterThan(0);
    const timings = await page.getByTestId("previews").getAttribute("data-timings");
    console.log(`[hidden] ${mainThread ? "main" : "worker"} visibility=${vis} ${timings}`);
  });
}
