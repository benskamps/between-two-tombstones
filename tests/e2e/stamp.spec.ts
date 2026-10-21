import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { seedHaunt } from "./fixtures/haunt";

// The Stamp Kit end to end: fixture photo → corners (keyboard) → three renders,
// timing under 4× CPU throttling, kit sheet / story downloads, and the
// "Read with Claude" error and success paths (route mocked; Lane 3a owns it).
//
// SAVE_STAMP_SAMPLES=1 also writes the downloads to tests/fixtures/stones/out/.

const STONES = path.resolve("tests/fixtures/stones");
type Pt = { x: number; y: number };
const CORNERS: Record<string, { corners: Pt[] }> = JSON.parse(readFileSync(path.join(STONES, "corners.json"), "utf8"));

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("btt-etiquette-seen", "1");
    } catch {
      // ignore
    }
  });
  // The Stamp Kit opens once you have a haunt (decision 18e).
  await seedHaunt(page);
});

async function currentJob(page: Page) {
  return Number((await page.getByTestId("previews").getAttribute("data-job")) || 0);
}

/** Wait until a render newer than `after` has landed in the previews. */
async function waitForRender(page: Page, after: number, timeout = 30000) {
  await expect.poll(() => currentJob(page), { timeout }).toBeGreaterThan(after);
  await expect(page.getByTestId("previews")).toHaveAttribute("aria-busy", "false", { timeout });
  return currentJob(page);
}

async function openPhoto(page: Page, file: string) {
  await page.goto("/stamp");
  await page.locator("#stamp-photo").setInputFiles(path.join(STONES, file));
  await expect(page.getByTestId("framer")).toBeVisible({ timeout: 15000 });
}

/** Move each corner handle onto the target with the arrow keys only (Shift = 10 px). */
async function setCornersByKeyboard(page: Page, target: Pt[]) {
  for (let i = 0; i < 4; i++) {
    const handle = page.locator(`[data-corner="${i}"]`);
    await handle.focus();
    for (const axis of ["x", "y"] as const) {
      const now = Number(await handle.getAttribute(`data-${axis}`));
      const d = target[i][axis] - now;
      const key = axis === "x" ? (d > 0 ? "ArrowRight" : "ArrowLeft") : d > 0 ? "ArrowDown" : "ArrowUp";
      for (let k = 0; k < Math.floor(Math.abs(d) / 10); k++) await page.keyboard.press(`Shift+${key}`);
      for (let k = 0; k < Math.abs(d) % 10; k++) await page.keyboard.press(key);
    }
    await expect(handle).toHaveAttribute("data-x", String(target[i].x));
    await expect(handle).toHaveAttribute("data-y", String(target[i].y));
  }
}

type PixelStats = { width: number; height: number; inked: number; cornerAlpha: number; opaque: number };

/** Decode a preview <img> into pixels and measure how much of it isn't background. */
async function renderPixels(page: Page, kind: "rubbing" | "ink" | "postage"): Promise<PixelStats> {
  return page.evaluate(async (k) => {
    const img = document.querySelector<HTMLImageElement>(`img[data-render="${k}"]`)!;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const g = c.getContext("2d")!;
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const n = d.length / 4;
    const hist = new Uint32Array(256);
    for (let j = 0; j < d.length; j += 4) hist[(0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2]) | 0]++;
    let acc = 0;
    let median = 0;
    for (; median < 256; median++) if ((acc += hist[median]) * 2 >= n) break;
    let inked = 0;
    let opaque = 0;
    for (let j = 0; j < d.length; j += 4) {
      if (d[j + 3] > 200) opaque++;
      const l = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2];
      if (d[j + 3] > 64 && Math.abs(l - median) > 48) inked++;
    }
    return { width: c.width, height: c.height, inked: inked / n, cornerAlpha: d[3], opaque: opaque / n };
  }, kind);
}

async function expectThreeRenders(page: Page) {
  const rubbing = await renderPixels(page, "rubbing");
  const ink = await renderPixels(page, "ink");
  const postage = await renderPixels(page, "postage");
  // Rubbing: opaque paper with a lot of dark wax.
  expect(rubbing.opaque).toBeGreaterThan(0.99);
  expect(rubbing.inked).toBeGreaterThan(0.2);
  // Ink stamp: transparent background, some ink.
  expect(ink.cornerAlpha).toBe(0);
  expect(ink.opaque).toBeGreaterThan(0.01);
  expect(ink.opaque).toBeLessThan(0.6);
  // Postage stamp: perforated (transparent corner bite), engraved lines.
  expect(postage.cornerAlpha).toBe(0);
  expect(postage.inked).toBeGreaterThan(0.1);
  return { rubbing, ink, postage };
}

for (const file of ["WashingtonIrvingGrave.jpg", "AlfredIversonJrGrave.jpg", "SamuelSpencerGrave.jpg"]) {
  test(`${file}: framed by keyboard, makes three non-blank renders`, async ({ page }) => {
    await openPhoto(page, file);
    const first = await waitForRender(page, 0);
    await setCornersByKeyboard(page, CORNERS[file].corners);
    await waitForRender(page, first);
    const stats = await expectThreeRenders(page);
    expect(Math.max(stats.rubbing.width, stats.rubbing.height)).toBeGreaterThan(1000); // 1000 px face + paper margin
    const maskPixels = Number(await page.getByTestId("previews").getAttribute("data-mask-pixels"));
    expect(maskPixels).toBeGreaterThan(2000);
  });
}

/**
 * Full re-render (a corner move invalidates every cache: warp, relief, mask and all
 * three renders + PNG encoding) timed from the key press to the previews landing,
 * under CDP `Emulation.setCPUThrottlingRate` 4×.
 */
async function timeRenders(page: Page, label: string) {
  await openPhoto(page, "WashingtonIrvingGrave.jpg");
  let job = await waitForRender(page, 0);
  const unthrottled = Number(await page.getByTestId("previews").getAttribute("data-render-ms"));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const handle = page.locator('[data-corner="0"]');
  const runs: { wall: number; engine: number }[] = [];
  for (let i = 0; i < 3; i++) {
    await handle.focus();
    const t0 = Date.now();
    await page.keyboard.press(i % 2 ? "ArrowLeft" : "ArrowRight");
    job = await waitForRender(page, job, 60000);
    const wall = Date.now() - t0;
    runs.push({ wall, engine: Number(await page.getByTestId("previews").getAttribute("data-render-ms")) });
  }
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  const summary = `${label}: unthrottled engine ${unthrottled} ms; 4x throttled: ${runs
    .map((r) => `wall ${r.wall} ms (incl. 250 ms debounce), engine ${r.engine} ms`)
    .join("; ")}`;
  console.log(`[stamp timing] ${summary}`);
  return { unthrottled, runs };
}

test("render time, worker path (Chromium can't throttle workers, so this is page-side only)", async ({ page }) => {
  test.setTimeout(120000);
  const { unthrottled, runs } = await timeRenders(page, "worker");
  for (const r of runs) expect(r.wall).toBeLessThan(5000);
  // CDP answers "Operation is only supported for pages, not workers" for worker targets: the
  // worker runs at full speed, so its time stays near the unthrottled one.
  expect(Math.min(...runs.map((r) => r.engine))).toBeLessThan(unthrottled * 2.5);
});

test("render time under 4× CPU throttling, same engine on the main thread", async ({ page }) => {
  test.setTimeout(120000);
  await page.addInitScript(() => {
    delete (window as { Worker?: unknown }).Worker;
  });
  const { runs } = await timeRenders(page, "main thread");
  await expect(page.getByTestId("main-thread-note")).toBeVisible();
  for (const r of runs) expect(r.wall).toBeLessThan(5000);
});

test("keyboard-only: mode, sliders, words, then save the kit sheet and story", async ({ page }) => {
  test.setTimeout(60000);
  await openPhoto(page, "WashingtonIrvingGrave.jpg");
  let job = await waitForRender(page, 0);
  await setCornersByKeyboard(page, CORNERS["WashingtonIrvingGrave.jpg"].corners);
  job = await waitForRender(page, job);

  // Mode radios: arrow keys move the selection inside the group.
  await page.getByRole("radio", { name: /Dark letters/ }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: /Light letters/ })).toBeChecked();
  await waitForRender(page, job);
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("radio", { name: /Dark letters/ })).toBeChecked();

  // Sliders.
  await page.getByLabel(/Grit/).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByLabel(/Grit/)).toHaveValue("45");
  await page.getByLabel(/Stroke weight/).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByLabel(/Stroke weight/)).toHaveValue("1");

  // Words: the age fills itself from the two years.
  await page.getByLabel("Name on the stone").focus();
  await page.keyboard.type("Washington Irving");
  await page.keyboard.press("Tab");
  await page.keyboard.type("April 3, 1783");
  await page.keyboard.press("Tab");
  // Renders in flight when a field changes are discarded, so the first one to land after this is the final text.
  const beforeLastField = await currentJob(page);
  await page.keyboard.type("November 28, 1859");
  await expect(page.getByLabel("Age at death")).toHaveValue("76");
  await waitForRender(page, beforeLastField);
  await expectThreeRenders(page);

  const outDir = path.join(STONES, "out");
  const save = !!process.env.SAVE_STAMP_SAMPLES;
  if (save) mkdirSync(outDir, { recursive: true });

  for (const [button, size, name] of [
    ["Save kit sheet", [1080, 1350], "kit-sheet"],
    ["Save story size", [1080, 1920], "story"],
  ] as const) {
    await page.getByRole("button", { name: button }).focus();
    const [download] = await Promise.all([page.waitForEvent("download"), page.keyboard.press("Enter")]);
    expect(download.suggestedFilename()).toBe(`washington-irving-${name}.png`);
    const file = await download.path();
    const png = readFileSync(file);
    expect(png.readUInt32BE(16)).toBe(size[0]);
    expect(png.readUInt32BE(20)).toBe(size[1]);
    if (save) await download.saveAs(path.join(outDir, `sample-${name}.png`));
  }

  for (const kind of ["rubbing", "ink stamp", "postage stamp"]) {
    const link = page.getByRole("link", { name: `Save ${kind}` });
    await link.focus();
    const [download] = await Promise.all([page.waitForEvent("download"), page.keyboard.press("Enter")]);
    expect(download.suggestedFilename()).toBe(`washington-irving-${kind.replace(" ", "-")}.png`);
    if (save) await download.saveAs(path.join(outDir, `sample-${kind.replace(" ", "-")}.png`));
  }
});

test("share falls back to saving the kit sheet when files can't be shared", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "canShare", { value: () => false, configurable: true });
  });
  await openPhoto(page, "SamuelSpencerGrave.jpg");
  await waitForRender(page, 0);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Share" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("headstone-kit-sheet.png");
  await expect(page.getByTestId("stamp-status")).toContainText("can't share files");
});

test("share uses the Web Share API with files when it can", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __shared: { files: number; names: string[] } | null };
    w.__shared = null;
    Object.defineProperty(navigator, "canShare", { value: () => true, configurable: true });
    Object.defineProperty(navigator, "share", {
      value: async (data: { files: File[] }) => {
        w.__shared = { files: data.files.length, names: data.files.map((f) => f.name) };
      },
      configurable: true,
    });
  });
  await openPhoto(page, "SamuelSpencerGrave.jpg");
  await waitForRender(page, 0);
  await page.getByRole("button", { name: "Share" }).click();
  await expect(page.getByTestId("stamp-status")).toHaveText("Shared.");
  const shared = await page.evaluate(() => (window as unknown as { __shared: unknown }).__shared);
  expect(shared).toEqual({
    files: 4,
    names: [
      "headstone-kit-sheet.png",
      "headstone-rubbing.png",
      "headstone-ink-stamp.png",
      "headstone-postage-stamp.png",
    ],
  });
});

test.describe("Read with Claude", () => {
  test("says plainly when the reader isn't there (404 page, then network down)", async ({ page }) => {
    let calls = 0;
    await page.route("**/api/read-stone", (route) =>
      calls++ === 0
        ? route.fulfill({ status: 404, contentType: "text/html", body: "<!doctype html><h1>404</h1>" })
        : route.abort("internetdisconnected"),
    );
    await openPhoto(page, "WashingtonIrvingGrave.jpg");
    await expect(page.getByText("Your photo is sent to Claude only when you tap this, and is not stored.")).toBeVisible();
    const alert = page.getByTestId("reading").getByRole("alert");
    await page.getByRole("button", { name: "Read with Claude" }).click();
    await expect(alert).toHaveText("Couldn't reach the reader.", { timeout: 30000 });
    await page.getByRole("button", { name: "Read with Claude" }).click();
    await expect(page.getByRole("button", { name: "Read with Claude" })).toBeEnabled({ timeout: 30000 });
    await expect(alert).toHaveText("Couldn't reach the reader.");
    expect(calls).toBe(2);
  });

  test("shows the route's error message as-is (the local no-key 503)", async ({ page }) => {
    await page.route("**/api/read-stone", (route) =>
      route.fulfill({
        status: 503,
        json: {
          error: { source: "Claude", code: "no_key", message: "Reading stones is switched off: the server has no API key." },
        },
      }),
    );
    await openPhoto(page, "WashingtonIrvingGrave.jpg");
    await page.getByRole("button", { name: "Read with Claude" }).click();
    await expect(page.getByTestId("reading").getByRole("alert")).toHaveText(
      "Reading stones is switched off: the server has no API key.",
    );
  });

  test("a 422 too_blurry shows its message and the reading it carries", async ({ page }) => {
    await page.route("**/api/read-stone", (route) =>
      route.fulfill({
        status: 422,
        json: {
          error: { source: "Claude", code: "too_blurry", message: "Too blurry to read all of it. Try a sharper photo." },
          reading: { people: [], symbols: [], legibility: "poor", transcription: "W[?]SHINGTON [?]RVING", checks: [] },
        },
      }),
    );
    await openPhoto(page, "WashingtonIrvingGrave.jpg");
    await page.getByRole("button", { name: "Read with Claude" }).click();
    const reading = page.getByTestId("reading");
    await expect(reading.getByRole("alert")).toHaveText("Too blurry to read all of it. Try a sharper photo.");
    await expect(reading.getByText("W[?]SHINGTON [?]RVING")).toBeVisible();
  });

  test("posts two JPEGs ≤ 1600 px and shows the transcript", async ({ page }) => {
    let body: Buffer | null = null;
    let contentType = "";
    await page.route("**/api/read-stone", async (route) => {
      body = route.request().postDataBuffer();
      contentType = (await route.request().allHeaders())["content-type"] ?? "";
      await route.fulfill({
        status: 200,
        json: {
          reading: {
            people: [{ name: "Washington Irving", birth: "April 3, 1783", death: "Nov. 28, 1859" }],
            symbols: [],
            material: "marble",
            legibility: "clear",
            transcription: "WASHINGTON IRVING\nBORN\nApril 3, 1783.\nDIED\nNov. 28, 1859.",
            checks: ["The 3 in April 3 is worn; check it by eye."],
          },
          cached: false,
        },
      });
    });
    await openPhoto(page, "WashingtonIrvingGrave.jpg");
    await page.getByRole("button", { name: "Read with Claude" }).click();
    const reading = page.getByTestId("reading");
    await expect(reading.getByText("What the stone says")).toBeVisible();
    await expect(reading.getByText(/WASHINGTON IRVING\s+BORN/)).toBeVisible();
    await expect(reading.getByText("Washington Irving · born April 3, 1783 · died Nov. 28, 1859")).toBeVisible();
    await expect(reading.getByRole("listitem")).toHaveText("The 3 in April 3 is worn; check it by eye.");
    expect(contentType).toContain("multipart/form-data");
    const text = body!.toString("latin1");
    expect(text).toContain('name="straightened"; filename="straightened.jpg"');
    expect(text).toContain('name="contrast"; filename="contrast.jpg"');
    expect(text.match(/Content-Disposition: form-data; name=/g)?.length).toBe(2);
    expect(body!.length).toBeLessThan(4 * 1024 * 1024);
    expect(text.match(/Content-Type: image\/jpeg/g)?.length).toBe(2);
    // JPEG SOF0/SOF2 frame header holds the size: check both are ≤ 1600 px on the long side.
    const sizes: number[][] = [];
    for (let i = 0; i < body!.length - 9; i++) {
      if (body![i] === 0xff && (body![i + 1] === 0xc0 || body![i + 1] === 0xc2)) {
        sizes.push([body!.readUInt16BE(i + 7), body!.readUInt16BE(i + 5)]);
      }
    }
    expect(sizes.length).toBe(2);
    for (const [w, h] of sizes) expect(Math.max(w, h)).toBeLessThanOrEqual(1600);
  });
});
