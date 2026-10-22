// Lane 2: the tour. Run against a local production server:
//   pnpm build && NODE_USE_ENV_PROXY=1 pnpm start -p 3102
//   BASE_URL=http://localhost:3102 pnpm test:e2e tests/e2e/tour.spec.ts
// The outage tests start their own `next start` with DISABLE_WIKIDATA=1 and
// SIMULATE_SLOW_BURIALS=Q216344,Q1950358:6000 on port 3199 (needs a local
// build), or use OUTAGE_BASE_URL if set: a server started with both flags.
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";

const OAKLAND = "/cemetery/Q2008469";
/** Arlington National Cemetery: the outage server makes its burials time out (SIMULATE_SLOW_BURIALS). */
const SLOW_QID = "Q216344";
/** Mount Auburn: the outage server holds it 6 s before timing out, so the loading screen can be read. */
const HELD_QID = "Q1950358";
const HOLD_MS = 6_000;

test.beforeEach(async ({ context }) => {
  // Skip the first-run etiquette dialog (a modal that would cover the page).
  await context.addInitScript(() => {
    try {
      localStorage.setItem("btt-etiquette-seen", "1");
    } catch {
      // Storage blocked: the dialog shows; tests would fail loudly.
    }
  });
});

async function expectStoryCards(page: Page, count = 12): Promise<Locator> {
  const cards = page.getByTestId("story-card");
  await expect(cards).toHaveCount(count, { timeout: 25_000 });
  for (let i = 0; i < count; i++) {
    const card = cards.nth(i);
    await expect(card.getByTestId("story-name")).not.toBeEmpty();
    const story = (await card.getByTestId("story-text").innerText()).trim();
    expect(story.length, `story text on card ${i + 1}`).toBeGreaterThan(40);
  }
  return cards;
}

test.describe("Oakland Cemetery tour", () => {
  test("renders 12 cards, each with a name and story text", async ({ page }) => {
    await page.goto(OAKLAND);
    await expect(page.getByRole("heading", { level: 1, name: "Oakland Cemetery" })).toBeVisible({ timeout: 25_000 });
    const cards = await expectStoryCards(page);
    const first = cards.first();
    await expect(first.getByRole("link", { name: "From Wikipedia, CC BY-SA 4.0" })).toHaveAttribute("href", /^https:\/\/en\.wikipedia\.org\/wiki\//);
    await expect(first.getByRole("link", { name: /Find a Grave/ })).toHaveAttribute("href", /^https:\/\/www\.findagrave\.com\/memorial\//);
    await expect(page.getByRole("link", { name: "Find a Grave cemetery page" })).toHaveAttribute("href", "https://www.findagrave.com/cemetery/35955");
    await expect(page.getByRole("button", { name: "Greatest hits" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "Walk through time" })).toBeVisible();
  });

  test("a recent death renders in the plain style, older ones carved", async ({ page }) => {
    await page.goto(OAKLAND);
    await expectStoryCards(page);
    // Show every stop, then find Maynard Jackson (died 2003).
    const more = page.getByRole("button", { name: /^Show \d+ more stops/ });
    for (let i = 0; i < 10 && (await more.count()) > 0; i++) await more.click();
    const jackson = page.getByTestId("story-card").filter({ has: page.getByTestId("story-name").filter({ hasText: "Maynard Jackson" }) });
    await expect(jackson).toHaveAttribute("data-style", "plain");
    await expect(jackson.getByText("Notable death")).toHaveCount(0);
    await expect(page.getByTestId("story-card").first()).toHaveAttribute("data-style", "carved");
  });

  test("walk through time keeps the same stops, ordered by birth", async ({ page }) => {
    await page.goto(OAKLAND);
    const cards = await expectStoryCards(page);
    const hits = await cards.evaluateAll((els) => els.map((e) => e.getAttribute("data-qid")).sort());
    await page.getByRole("button", { name: "Walk through time" }).click();
    await expect(page.getByRole("button", { name: "Walk through time" })).toHaveAttribute("aria-pressed", "true");
    const time = await cards.evaluateAll((els) => els.map((e) => e.getAttribute("data-qid")).sort());
    expect(time).toEqual(hits);
  });
});

test.describe("links that can't lead to a tour", () => {
  // An item Wikidata doesn't have (Q99999999999) takes the same path once Wikidata answers; checked by
  // hand on a local build, since this suite shouldn't depend on a live query for it.
  test("a malformed ID is the app's not-found page, marked noindex", async ({ page }) => {
    for (const path of ["/cemetery/abc", "/cemetery/Q2008469x", "/cemetery/Q0"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: "Page not found" }), path).toBeVisible();
      await expect(page.locator('meta[name="robots"][content*="noindex"]').first(), path).toBeAttached();
      await expect(page.getByTestId("story-card"), path).toHaveCount(0);
    }
  });
});

test.describe("offline", () => {
  test("a downloaded tour still renders every card after an offline reload", async ({ page, context }) => {
    await page.goto(OAKLAND);
    await expectStoryCards(page);
    // The service worker registers in production builds; wait until it's ready.
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.getByRole("button", { name: "Download this tour" }).click();
    await expect(page.getByTestId("offline-status")).toContainText("Saved for offline use", { timeout: 30_000 });

    await context.setOffline(true);
    try {
      await page.reload();
      expect(await page.evaluate(() => navigator.onLine)).toBe(false);
      // The page came from the service worker's cache, not the network.
      expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
      await expectStoryCards(page);
      await expect(page.getByRole("status").filter({ hasText: "You're offline" })).toBeVisible();

      // The offline shell renders the same tour straight from IndexedDB.
      await page.goto("/cemetery/saved?qid=Q2008469");
      await expect(page.getByRole("heading", { level: 1, name: "Oakland Cemetery" })).toBeVisible();
      await expectStoryCards(page);
    } finally {
      await context.setOffline(false);
    }
  });
});

test.describe("walking route", () => {
  test.use({ permissions: ["geolocation"], geolocation: { latitude: 33.7487, longitude: -84.3713, accuracy: 5 } });

  test("pinning graves with 'I found it' turns on the best walking route", async ({ page, context }) => {
    await page.goto(OAKLAND);
    const cards = await expectStoryCards(page);
    const routeButton = page.getByRole("button", { name: "Best walking route" });
    // Wikidata locates fewer than 3 of Oakland's graves (2 on Oct 20), so the route is off.
    await expect(routeButton).toHaveCount(0);
    await expect(page.getByTestId("route-hint")).toContainText(/\([0-2] of 3 so far\)/);

    const spots = [
      { latitude: 33.7481, longitude: -84.3721 },
      { latitude: 33.7486, longitude: -84.3709 },
      { latitude: 33.7492, longitude: -84.3716 },
    ];
    const pinned: string[] = [];
    for (let i = 0; i < spots.length; i++) {
      await context.setGeolocation({ ...spots[i], accuracy: 6 });
      const card = cards.nth(i);
      pinned.push((await card.getAttribute("data-qid"))!);
      await card.getByRole("button", { name: /^I found it/ }).click();
      await expect(card.getByTestId("pinned")).toContainText("Pinned here (±6 m)");
    }

    await expect(routeButton).toBeVisible();
    await routeButton.click();
    await expect(routeButton).toHaveAttribute("aria-pressed", "true");
    const routeQids = await page.getByTestId("story-card").evaluateAll((els) => els.map((e) => e.getAttribute("data-qid")));
    expect(routeQids.length).toBeGreaterThanOrEqual(3);
    for (const q of pinned) expect(routeQids).toContain(q);

    // Pins live in IndexedDB on the phone: still there after a reload.
    await page.reload();
    await expectStoryCards(page);
    await expect(page.getByRole("button", { name: "Best walking route" })).toBeVisible();
  });
});

test.describe("Wikidata outage (DISABLE_WIKIDATA=1)", () => {
  test.describe.configure({ mode: "serial" });
  let server: ChildProcess | undefined;
  let base = process.env.OUTAGE_BASE_URL ?? "";

  test.beforeAll(async () => {
    if (base) return;
    test.skip(!existsSync(".next/BUILD_ID"), "Needs a local `pnpm build`, or OUTAGE_BASE_URL pointing at a server started with DISABLE_WIKIDATA=1.");
    const port = 3199;
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port)], {
      env: { ...process.env, DISABLE_WIKIDATA: "1", SIMULATE_SLOW_BURIALS: `${SLOW_QID},${HELD_QID}:${HOLD_MS}` },
      stdio: "ignore",
    });
    base = `http://localhost:${port}`;
    for (let i = 0; i < 60; i++) {
      try {
        const res = await fetch(`${base}/cemetery/saved`);
        if (res.ok) return;
      } catch {
        // Not up yet.
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error("The DISABLE_WIKIDATA server didn't start within 30 s.");
  });

  test.afterAll(() => {
    server?.kill();
  });

  test("/near names the failure and offers next steps, never an empty list", async ({ page }) => {
    await page.goto(`${base}/near?lat=47.6339&lon=-122.3158`);
    const failure = page.getByTestId("source-failure");
    await expect(failure).toBeVisible();
    await expect(page.getByTestId("failure-message")).toHaveText("Couldn't reach Wikidata. Try again in a minute, or open a saved tour.");
    await expect(failure.getByRole("link", { name: "Try again" })).toBeVisible();
    await expect(failure.getByRole("link", { name: /Oakland Cemetery/ })).toBeVisible();
    await expect(page.getByText(/No cemeteries with Wikidata entries/)).toHaveCount(0);
  });

  test("/near with a good fix at Oakland still names the failure and opens nothing on its own", async ({ page }) => {
    await page.goto(`${base}/near?lat=33.7489&lon=-84.3718&acc=20`);
    await expect(page.getByTestId("source-failure")).toBeVisible();
    await expect(page.getByTestId("failure-message")).toHaveText("Couldn't reach Wikidata. Try again in a minute, or open a saved tour.");
    expect(new URL(page.url()).pathname).toBe("/near");
    await expect(page.getByTestId("near-best")).toHaveCount(0);
    await expect(page.getByText(/no one listed yet/)).toHaveCount(0);
  });

  test("a tour that isn't a sample names the outage, with no slow-cemetery retry (Gate 8)", async ({ page }) => {
    await page.goto(`${base}/cemetery/Q872253?via=near&n=200`);
    const failure = page.getByTestId("source-failure");
    await expect(failure).toBeVisible({ timeout: 15_000 });
    await expect(failure.getByRole("heading", { name: "Wikidata didn’t answer" })).toBeVisible();
    await expect(page.getByTestId("failure-message")).toHaveText("Couldn't reach Wikidata. Try again in a minute, or open a saved tour.");
    await expect(page.getByTestId("slow-cemetery")).toHaveCount(0);
  });

  test.describe("a big cemetery that times out (review pass 2, N1)", () => {
    // page.route must see the browser's retry, not a service worker.
    test.use({ serviceWorkers: "block" });

    test("retries once from the browser, says how big, then blames the size", async ({ page }) => {
      let retries = 0;
      await page.route(`**/api/cemeteries/${SLOW_QID}/burials`, async (route) => {
        retries++;
        await new Promise((r) => setTimeout(r, 1_500)); // hold it so the "still loading" line can be read
        await route.continue();
      });
      await page.goto(`${base}/cemetery/${SLOW_QID}?via=near&n=4359`);
      await expect(page.getByTestId("slow-cemetery-message")).toHaveText("Still loading. This cemetery is big (4,359 people listed).");
      const failure = page.getByTestId("source-failure");
      await expect(failure).toBeVisible({ timeout: 15_000 });
      await expect(failure.getByRole("heading", { name: "This cemetery is big" })).toBeVisible();
      await expect(page.getByTestId("failure-message")).toHaveText("This cemetery is big and Wikidata didn't answer in time. Try again in a minute.");
      await expect(failure.getByRole("link", { name: "Try again" })).toHaveAttribute("href", `/cemetery/${SLOW_QID}`);
      expect(retries).toBe(1);
    });
  });

  test("a slow first load says a big cemetery can take half a minute, and nothing moves (review pass 4)", async ({ page }) => {
    // Don't wait for the page to finish: the server holds it on purpose.
    await page.goto(`${base}/cemetery/${HELD_QID}?via=near&n=1415`, { waitUntil: "commit" });
    const loading = page.getByTestId("tour-loading");
    await expect(loading).toContainText("Most cemeteries take a few seconds the first time.");
    await expect(loading).not.toContainText("This takes a few seconds");
    // The size comes from the link; the line shows 3 s in (8 s without a size), in space held from the start.
    const note = page.getByTestId("loading-note");
    await expect(note).toHaveText("This cemetery is big (1,415 people listed), so the first load can take half a minute.");
    await expect(note).toHaveCSS("opacity", "0");
    const before = await note.boundingBox();
    await expect(note).toHaveCSS("opacity", "1", { timeout: HOLD_MS - 1_000 });
    expect(await note.boundingBox()).toEqual(before);
    const shift = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          let total = 0;
          new PerformanceObserver((list) => {
            for (const e of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) if (!e.hadRecentInput) total += e.value;
          }).observe({ type: "layout-shift", buffered: true });
          setTimeout(() => resolve(total), 200);
        }),
    );
    expect(shift).toBe(0);
    // Then the server gives up and the browser asks once more, saying why.
    await expect(page.getByTestId("slow-cemetery-message")).toHaveText("Still loading. This cemetery is big (1,415 people listed).", { timeout: HOLD_MS + 5_000 });
  });

  test("the API answers 503 with the source named", async ({ request }) => {
    const near = await request.get(`${base}/api/cemeteries/near?lat=47.6339&lon=-122.3158`);
    expect(near.status()).toBe(503);
    expect(await near.json()).toEqual({ error: { source: "Wikidata", message: "Couldn't reach Wikidata. Try again in a minute, or open a saved tour." } });
    const search = await request.get(`${base}/api/cemeteries/search?q=lake%20view%20cemetery`);
    expect(search.status()).toBe(503);
    const burials = await request.get(`${base}/api/cemeteries/Q872253/burials`);
    expect(burials.status()).toBe(503);
    expect((await burials.json()).error.source).toBe("Wikidata");
  });

  test("a sample tour falls back to its saved copy and says when it was saved", async ({ page, request }) => {
    const api = await request.get(`${base}/api/cemeteries/Q360779/burials`);
    expect(api.status()).toBe(200);
    const body = await api.json();
    expect(body.origin).toBe("saved");
    expect(body.people.length).toBeGreaterThanOrEqual(50);

    await page.goto(`${base}/cemetery/Q360779`);
    await expect(page.getByText(/Couldn't reach Wikidata, so this is the copy saved on \w{3} \d{1,2}, \d{4}\./)).toBeVisible();
    await expectStoryCards(page);
  });
});
