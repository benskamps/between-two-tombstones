// TEMPORARY profiling spec; deleted before commit.
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

test.use({ viewport: { width: 412, height: 915 } });

const job = async (page: Page) => Number(await page.getByTestId("previews").getAttribute("data-job"));
async function next(page: Page, after: number) {
  await expect.poll(() => job(page), { timeout: 90000 }).toBeGreaterThan(after);
  return job(page);
}

for (const mainThread of [false, true]) {
  for (const throttle of mainThread ? [1, 4] : [1]) {
    for (const file of ["AlfredIversonJrGrave.jpg", "WashingtonIrvingGrave.jpg"]) {
      test(`${mainThread ? "main" : "worker"} x${throttle} ${file}`, async ({ page }) => {
        test.setTimeout(180000);
        await page.addInitScript((m) => {
          localStorage.setItem("btt-etiquette-seen", "1");
          if (m) delete (window as { Worker?: unknown }).Worker;
        }, mainThread);
        const cdp = await page.context().newCDPSession(page);
        await page.goto("/stamp");
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle });
        const out: string[] = [];
        const record = async (label: string, t0: number) =>
          out.push(`  ${label.padEnd(12)} wall=${Date.now() - t0}ms ${await page.getByTestId("previews").getAttribute("data-timings")}`);

        let t0 = Date.now();
        await page.locator("#stamp-photo").setInputFiles(path.resolve("tests/fixtures/stones", file));
        let j = await next(page, 0);
        await record("first", t0);

        await page.locator('[data-corner="0"]').focus();
        t0 = Date.now();
        await page.keyboard.press("ArrowRight");
        j = await next(page, j);
        await record("corner", t0);

        await page.getByLabel(/Grit/).focus();
        t0 = Date.now();
        await page.keyboard.press("ArrowRight");
        j = await next(page, j);
        await record("grit", t0);

        await page.getByLabel("Name on the stone").focus();
        t0 = Date.now();
        await page.keyboard.type("A");
        j = await next(page, j);
        await record("words", t0);

        console.log(`[profile] ${mainThread ? "main" : "worker"} x${throttle} ${file}\n${out.join("\n")}`);
      });
    }
  }
}
