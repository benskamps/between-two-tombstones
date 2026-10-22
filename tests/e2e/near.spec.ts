// /near, /search and story text fixes from the UI/UX review (F2, F17, F18, F19, F20).
// Live Wikidata, like tour.spec.ts. Run against a local production server:
//   pnpm build && NODE_USE_ENV_PROXY=1 pnpm start -p 3130
//   BASE_URL=http://localhost:3130 pnpm test:e2e tests/e2e/near.spec.ts
import { expect, test } from "@playwright/test";

const OAKLAND_POINT = "lat=33.7489&lon=-84.3718"; // inside Oakland Cemetery, Atlanta (115 people listed)
const CHARLESTON_POINT = "lat=32.8040&lon=-79.9470"; // 1.7 km from Magnolia Cemetery, 30 churchyards nearer

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    try {
      localStorage.setItem("btt-etiquette-seen", "1");
    } catch {
      // Storage blocked: the dialog shows; tests would fail loudly.
    }
  });
});

test.describe("/near", () => {
  test("without a location, asks in plain words and offers both ways in", async ({ page }) => {
    await page.goto("/near");
    const ask = page.getByTestId("near-no-location");
    await expect(ask).toContainText("Tap below to use your location, or search by name.");
    await expect(page.getByText(/lat \(−90 to 90\)/)).toHaveCount(0);
    // Same words as home's door (L10.4: NearMeButton's default label is "I’m here. Haunt me.").
    await expect(ask.getByRole("button", { name: /^I.m here\. Haunt me\.$/ })).toBeVisible();
    await expect(ask.getByRole("search")).toBeVisible();
  });

  test("pins the best stories nearby and folds the cemeteries with no one listed (Charleston)", async ({ page }) => {
    await page.goto(`/near?${CHARLESTON_POINT}`);
    const best = page.getByTestId("near-best");
    await expect(best).toBeVisible({ timeout: 25_000 });
    await expect(best.getByRole("link")).toContainText("Magnolia Cemetery");
    await expect(best.getByRole("link")).toHaveAttribute("href", /^\/cemetery\/Q12061438\?via=near&n=\d+$/);

    // A card only for 5+ people (review 4, #5), and every link says it came from the near list.
    const links = page.getByTestId("cemetery-list").getByRole("link");
    expect(await links.count()).toBeGreaterThan(0);
    for (const href of await links.evaluateAll((els) => els.map((e) => e.getAttribute("href")))) expect(href).toMatch(/^\/cemetery\/Q\d+\?via=near&n=([5-9]|[1-9]\d+)$/);
    await expect(page.getByTestId("cemetery-list")).not.toContainText("No burials listed");
    await expect(page.getByTestId("cemetery-list")).not.toContainText("Bethany Cemetery");

    // The rest are folded and closed. One to four people: a link that says the count;
    // no one: plain text, never a link to an empty tour.
    const fold = page.getByTestId("near-unlisted");
    await expect(fold).not.toHaveAttribute("open", "");
    await expect(fold.locator("summary")).toHaveText(/^\d+ more nearby with fewer than 5 people listed$/);
    await fold.locator("summary").click();
    const short = fold.getByTestId("near-few").getByRole("link");
    for (const href of await short.evaluateAll((els) => els.map((e) => e.getAttribute("href")))) expect(href).toMatch(/^\/cemetery\/Q\d+\?via=near&n=[1-4]$/);
    await expect(short.filter({ hasText: "Bethany Cemetery" })).toContainText("1 person listed on Wikidata");
    for (const box of await short.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) expect(box).toBeGreaterThanOrEqual(48);
    await expect(fold.getByText("Wilson-Shepheard Family Cemetery")).toBeVisible();
    await expect(fold.getByRole("link", { name: /Wilson-Shepheard/ })).toHaveCount(0);
  });

  test("I'm here with a good fix: opens the tour straight away", async ({ page }) => {
    await page.goto(`/near?${OAKLAND_POINT}&acc=20`);
    // Three decimals in the hub's URL (P0-1): people share hub links, so they never carry the exact fix.
    await page.waitForURL(/\/cemetery\/Q2008469\?via=here&lat=33\.749&lon=-84\.372&n=\d+$/, { timeout: 25_000 });
    await expect(page.getByRole("heading", { level: 1, name: "Oakland Cemetery" })).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId("story-card")).toHaveCount(12, { timeout: 25_000 });
  });

  test("never opens a tour on its own without acc, with list=1, or with a rough fix", async ({ page }) => {
    for (const q of [OAKLAND_POINT, `${OAKLAND_POINT}&acc=20&list=1`]) {
      await page.goto(`/near?${q}`);
      await expect(page.getByTestId("near-best")).toBeVisible({ timeout: 25_000 });
      expect(new URL(page.url()).pathname).toBe("/near");
      await expect(page.getByTestId("near-best").getByRole("link")).toHaveAttribute("href", /^\/cemetery\/Q2008469\?via=near&n=\d+$/);
      await expect(page.getByTestId("near-approx")).toHaveCount(0);
    }

    await page.goto(`/near?${OAKLAND_POINT}&acc=1234`);
    await expect(page.getByTestId("near-approx")).toContainText("Your location is approximate (±1.2 km).", { timeout: 25_000 });
    expect(new URL(page.url()).pathname).toBe("/near");
    await expect(page.getByTestId("near-best")).toContainText("Oakland Cemetery");
  });
});

test.describe("/search", () => {
  test('"oakland" also searches "oakland cemetery" and puts Atlanta first', async ({ page }) => {
    await page.goto("/search?q=oakland");
    const links = page.getByTestId("cemetery-list").getByRole("link");
    await expect(links.first()).toHaveAttribute("href", "/cemetery/Q2008469", { timeout: 25_000 });
    await expect(links.first()).toContainText("Atlanta");
    expect(await links.count()).toBeGreaterThan(5);
  });
});

test.describe("story text", () => {
  test("Oakland's cards carry no template debris and no ID for a name", async ({ page }) => {
    await page.goto("/cemetery/Q2008469");
    await expect(page.getByTestId("story-card")).toHaveCount(12, { timeout: 25_000 });
    const more = page.getByRole("button", { name: /^Show \d+ more stops/ });
    for (let i = 0; i < 10 && (await more.count()) > 0; i++) await more.click();

    const card = (name: string) => page.getByTestId("story-card").filter({ has: page.getByTestId("story-name").filter({ hasText: name }) });
    await expect(card("John B. Gordon").getByTestId("story-text")).toContainText("John Brown Gordon (February 6, 1832 – January 9, 1904) was");
    await expect(card("Charles Collier").getByTestId("story-text")).toContainText("Charles Augustus Collier (July 19, 1848 – September 28, 1900) was");

    const texts = await page.getByTestId("story-text").allInnerTexts();
    expect(texts.length).toBeGreaterThan(50);
    expect(texts.filter((t) => /\(\d{4}-\d{2}-\d{2}\)|\(\s*;|\(\(|\(\s*\)/.test(t))).toEqual([]);
    const names = await page.getByTestId("story-name").allInnerTexts();
    expect(names.filter((n) => /^Q\d+$/.test(n.trim()))).toEqual([]);
    // No English label on Wikidata, so they're named by their Wikipedia articles (F20).
    expect(names).toEqual(expect.arrayContaining(["Nedom L. Angier", "Ira O. McDaniel"]));

    // "aged N" never breaks across lines.
    const aged = card("Charles Collier").locator("span", { hasText: /aged 52/ });
    expect(await aged.evaluate((el) => getComputedStyle(el).whiteSpace)).toBe("nowrap");
  });
});
