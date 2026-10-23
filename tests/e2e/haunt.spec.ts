import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { SLEEPY_HOLLOW_HAUNT, seedHaunt } from "./fixtures/haunt";

// Lane 10 (decision 18): the home page's doors, the haunt (the cemetery you
// picked, kept on the phone, fresh for 12 hours), the cemetery page as its hub,
// the tool pages that wait for one, and the links someone sent, which never do.

const GATED = ["/stamp", "/spirit", "/games", "/games/bingo", "/games/party", "/games/evp", "/calendar"];
const OAKLAND = "/cemetery/Q2008469";

function seenEtiquette() {
  try {
    localStorage.setItem("btt-etiquette-seen", "1");
  } catch {
    // ignore
  }
}

/** A haunt set `hoursAgo` hours before the page loads (12+ is stale). */
async function seedOldHaunt(context: BrowserContext, hoursAgo: number) {
  await context.addInitScript((h) => {
    try {
      if (!localStorage.getItem("btt-haunt"))
        localStorage.setItem(
          "btt-haunt",
          JSON.stringify({ qid: "Q360779", name: "Sleepy Hollow Cemetery", place: "Sleepy Hollow", at: new Date(Date.now() - h * 3_600_000).toISOString() }),
        );
    } catch {
      // ignore
    }
  }, hoursAgo);
}

async function storedHaunt(page: Page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem("btt-haunt");
    return raw ? (JSON.parse(raw) as Record<string, string>) : null;
  });
}

const nav = (page: Page) => page.getByRole("navigation", { name: "Main" });
const badge = (page: Page) => page.getByRole("banner").getByRole("link", { name: /^Haunting:/ });
const kit = (page: Page) => page.getByTestId("haunt-toolkit");
const HAUNT_ME = /^I.m here\. Haunt me\.$/;

/** React's production hydration errors (#418 text, #423 recoverable, #425 text content) and dev wording. */
function watchHydration(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && /hydrat|#418|#423|#425|did not match/i.test(m.text())) errors.push(m.text());
  });
  page.on("pageerror", (e) => {
    if (/hydrat|#418|#423|#425/i.test(e.message)) errors.push(e.message);
  });
  return errors;
}

async function openOakland(page: Page, query = "") {
  await page.goto(`${OAKLAND}${query}`);
  await expect(page.getByRole("heading", { level: 1, name: "Oakland Cemetery" })).toBeVisible({ timeout: 25_000 });
}

test.describe("home", () => {
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(seenEtiquette);
  });

  test("opens on two doors: search (location first, then by name) and plan a date", async ({ page }) => {
    const hydration = watchHydration(page);
    await page.goto("/");
    const doors = page.getByTestId("doors");
    await expect(doors.getByRole("heading", { level: 2 })).toHaveText(["Search a graveyard", "Plan a date"]);

    const search = page.getByRole("region", { name: "Search a graveyard" });
    const hauntMe = search.getByRole("button", { name: HAUNT_ME });
    await expect(hauntMe).toBeVisible();
    await expect(hauntMe).toHaveAccessibleDescription("Uses your location");
    // The name search is the fallback, with a visible label.
    await expect(search.getByLabel("Or type the cemetery’s name")).toBeVisible();
    await expect(search.getByRole("button", { name: "Search", exact: true })).toBeVisible();

    const date = page.getByRole("region", { name: "Plan a date" });
    await expect(date.getByRole("link", { name: "Open the Gravitator" })).toHaveAttribute("href", "/gravitator");

    // The samples stay, quietly, below the doors.
    await expect(page.getByRole("heading", { name: "Or start with a famous one" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Oakland Cemetery/ })).toHaveAttribute("href", OAKLAND);
    await expect(page.getByRole("link", { name: /Sleepy Hollow Cemetery/ })).toHaveAttribute("href", "/cemetery/Q360779");

    // No haunt: no badge, one nav for the whole night, and the kit wears a lock.
    await expect(badge(page)).toHaveCount(0);
    await expect(nav(page).getByRole("link")).toHaveText(["Swipe", "Matches", "Kit", "Passport"]);
    await expect(nav(page).getByRole("link", { name: "Matches" })).toHaveAttribute("href", "/gravitator/saved");
    await expect(nav(page).getByTestId("kit-lock")).toHaveCount(1);
    for (const link of await nav(page).getByRole("link").all()) {
      const box = await link.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(48);
      expect(box!.width).toBeGreaterThanOrEqual(48);
    }
    // The name stands alone: no tagline, no theme toggle, and nothing covers the first tap (F6).
    await expect(page.getByRole("banner")).toHaveText(/^\s*Skip to content\s*Between Two Tombstones\s*$/);
    await expect(page.getByRole("button", { name: /theme|daylight|dark/i })).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(hydration).toEqual([]);
  });

  test("location is asked for on the tap, never on load, and a refusal points at the name search", async ({ page, context }) => {
    await context.addInitScript(() => {
      const w = window as unknown as { __geoCalls: number };
      w.__geoCalls = 0;
      const deny = (_ok: unknown, fail?: (e: { code: number; message: string }) => void) => {
        w.__geoCalls += 1;
        fail?.({ code: 1, message: "denied" });
      };
      Object.defineProperty(navigator, "geolocation", {
        value: { getCurrentPosition: deny, watchPosition: () => 0, clearWatch() {} },
        configurable: true,
      });
    });
    await page.goto("/", { waitUntil: "networkidle" });
    expect(await page.evaluate(() => (window as unknown as { __geoCalls: number }).__geoCalls)).toBe(0);
    await page.getByRole("button", { name: HAUNT_ME }).click();
    expect(await page.evaluate(() => (window as unknown as { __geoCalls: number }).__geoCalls)).toBe(1);
    await expect(page.getByRole("alert").filter({ hasText: "Location is turned off for this site" })).toContainText("search by name below");
    // The way on is the name field right below, so the cursor goes there (REVIEW-2 N7).
    await expect(page.getByLabel("Or type the cemetery’s name")).toBeFocused();
    await expect(page).toHaveURL(/\/$/);
  });

  // These two mock /near to test only the hand-off. A request that goes through the
  // service worker (home registers it, F16) skips page.route, so block it here.
  test.describe("hand-off to /near", () => {
    test.use({ serviceWorkers: "block" });

    test("“I’m here. Haunt me.” opens the nearby list with the fix and its accuracy (F17)", async ({ page, context }) => {
      await context.grantPermissions(["geolocation"]);
      await context.setGeolocation({ latitude: 33.7487, longitude: -84.3713, accuracy: 35 });
      // Only the hand-off matters here; the list itself is the data lane's.
      await page.route("**/near?**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<p>near</p>" }));
      await page.goto("/", { waitUntil: "networkidle" });
      await page.getByRole("button", { name: HAUNT_ME }).click();
      await expect(page).toHaveURL(/\/near\?lat=33\.749&lon=-84\.371&acc=35$/);
    });

    test("a tap before React hydrates still goes to the nearby list (F5)", async ({ page, context }) => {
      await context.grantPermissions(["geolocation"]);
      await context.setGeolocation({ latitude: 33.7487, longitude: -84.3713, accuracy: 12 });
      await page.route("**/near?**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<p>near</p>" }));
      // Hold every script chunk back (not the CSS) until the tap has gone through, so React never owns the
      // button here. A deployed build serves them from /_next/static/immutable/chunks/ (Vercel's immutable
      // assets), a local one from /_next/static/chunks/; matching only the second let React hydrate on prod.
      // The hold is capped so a stuck run still ends.
      let release = () => {};
      const released = new Promise<void>((r) => (release = r));
      let held = 0;
      await page.route(
        (url) => /^\/_next\/static\/(immutable\/)?chunks\/.+\.js$/.test(url.pathname),
        async (route) => {
          held += 1;
          await Promise.race([released, new Promise((r) => setTimeout(r, 20_000))]);
          await route.continue().catch(() => {});
        },
      );
      try {
        await page.goto("/", { waitUntil: "commit" });
        const button = page.getByRole("button", { name: HAUNT_ME });
        await expect(button).toBeVisible();
        await expect.poll(() => held, { message: "the page's script chunks are held back" }).toBeGreaterThan(0);
        await expect(button).not.toHaveAttribute("data-ready", "");
        await button.click();
        await expect(page).toHaveURL(/\/near\?lat=33\.749&lon=-84\.371&acc=12$/, { timeout: 5000 });
      } finally {
        release();
      }
    });
  });

  test("with no signal, the button says so and points at the saved tours (F16)", async ({ page, context }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.locator("[data-locate]")).toHaveAttribute("data-ready", "");
    await context.setOffline(true);
    try {
      await page.getByRole("button", { name: HAUNT_ME }).click();
      const alert = page.getByRole("alert").filter({ hasText: "No signal. Your saved tours still open." });
      await expect(alert).toBeVisible();
      await expect(alert.getByRole("link", { name: "Open saved tours" })).toHaveAttribute("href", "/cemetery/saved");
    } finally {
      await context.setOffline(false);
    }
  });

  test("a fresh haunt sits above the doors; a stale one is “Last time” below them (F10)", async ({ browser, baseURL }) => {
    const fresh = await browser.newContext({ baseURL });
    await fresh.addInitScript(seenEtiquette);
    await seedHaunt(fresh, SLEEPY_HOLLOW_HAUNT);
    const pf = await fresh.newPage();
    await pf.goto("/");
    const back = pf.getByTestId("haunt-return");
    await expect(back).toContainText("Sleepy Hollow Cemetery");
    const [backBox, doorsBox] = [await back.boundingBox(), await pf.getByTestId("doors").boundingBox()];
    expect(backBox!.y).toBeLessThan(doorsBox!.y);
    await expect(badge(pf)).toHaveText(/Haunting:\s*Sleepy Hollow Cemetery/);
    await expect(nav(pf).getByRole("link")).toHaveText(["Swipe", "Matches", "Kit", "Passport"]);
    await expect(nav(pf).getByTestId("kit-lock")).toHaveCount(0);
    await fresh.close();

    const stale = await browser.newContext({ baseURL });
    await stale.addInitScript(seenEtiquette);
    await seedOldHaunt(stale, 13);
    const ps = await stale.newPage();
    await ps.goto("/");
    const last = ps.getByTestId("haunt-last");
    await expect(last).toContainText("Last time: Sleepy Hollow Cemetery");
    await expect(last.getByRole("link", { name: "Back to it" })).toHaveAttribute("href", "/cemetery/Q360779");
    expect((await last.boundingBox())!.y).toBeGreaterThan((await ps.getByTestId("doors").boundingBox())!.y);
    await expect(ps.getByTestId("haunt-return")).toHaveCount(0);
    await expect(badge(ps)).toHaveCount(0);
    await expect(nav(ps).getByTestId("kit-lock")).toHaveCount(1);
    // A stale haunt doesn't open the tools either.
    await ps.goto("/stamp");
    await expect(ps.getByTestId("pick-haunt")).toBeVisible();
    await stale.close();
  });
});

test.describe("the hub", () => {
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(seenEtiquette);
  });

  test("opening a cemetery with no haunt makes it the haunt: header, toolkit, nav and home follow", async ({ page }) => {
    const hydration = watchHydration(page);
    await openOakland(page);

    await expect(badge(page)).toHaveText(/Haunting:\s*Oakland Cemetery/);
    await expect(badge(page)).toHaveAttribute("href", OAKLAND);
    const stored = await storedHaunt(page);
    expect(stored).toMatchObject({ qid: "Q2008469", name: "Oakland Cemetery" });
    expect(Number.isNaN(Date.parse(stored!.at))).toBe(false);

    // The toolkit: compact chips, each carrying the cemetery; the tour header's old links folded in.
    await expect(kit(page).getByRole("heading", { name: "Your haunt" })).toBeVisible();
    const q = "cemetery=Q2008469&name=Oakland\\+Cemetery";
    const chips: [string, string][] = [
      ["Stamp", `^/stamp\\?${q}`],
      ["Spirit", `^/spirit\\?${q}`],
      ["Séance", `^/spirit\\?${q}.*#seance$`],
      ["Bingo", `^/games/bingo\\?${q}`],
      ["Party", `^/games/party\\?${q}`],
      ["Calendar", `^/calendar\\?${q}`],
    ];
    for (const [name, href] of chips) await expect(kit(page).getByRole("link", { name, exact: true })).toHaveAttribute("href", new RegExp(href));
    await expect(page.getByRole("link", { name: "Start a séance here" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Haunt my calendar" })).toHaveCount(0);

    await expect(nav(page).getByRole("link")).toHaveText(["Swipe", "Matches", "Kit", "Passport"]);
    await expect(nav(page).getByRole("link", { name: "Kit" })).toHaveAttribute("aria-current", "page");
    await expect(nav(page).getByRole("link", { name: "Kit" })).toHaveAttribute("href", "/kit");

    // A tool from the toolkit opens on the haunt. The names line waits on the live burials route: the
    // spirit box gives it up to 5 s once /spirit has rendered, then uses the saved copy (lib/spirit/load.ts).
    // So the line can come at nav + 5 s + render (5.9 s measured with the route held 6 s or 12 s), past
    // the default 5 s from the click, whenever the server's live load is cold or queued behind other
    // Wikimedia calls. Allow that cap plus the usual 5 s for the page itself.
    await kit(page).getByRole("link", { name: "Spirit", exact: true }).click();
    await expect(page.getByText(/people buried at Oakland Cemetery died 75 or more years ago/)).toBeVisible({ timeout: 10_000 });
    await expect(nav(page).getByRole("link", { name: "Kit" })).toHaveAttribute("aria-current", "page");

    // "Change haunt" goes back to the doors; home offers the way back too, above them.
    await openOakland(page);
    await kit(page).getByRole("link", { name: "Change haunt" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId("doors")).toBeVisible();
    await expect(page.getByTestId("haunt-return").getByRole("link", { name: "Back to it" })).toHaveAttribute("href", OAKLAND);
    expect(hydration).toEqual([]);
  });

  test("stories come first: stops 1–3 sit above the toolkit and the walk/save row (F1)", async ({ page }) => {
    await openOakland(page);
    const cards = page.getByTestId("story-card");
    await expect(cards).toHaveCount(12, { timeout: 25_000 });
    // Measure a settled page: every web font swapped in and two frames of layout after that.
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    });
    await expect(page.getByRole("button", { name: "Download this tour" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Start the walk/ })).toBeVisible();
    await expect(kit(page)).toBeVisible();
    // Read every position in one frame. Separate boundingBox() calls can straddle a reflow above the
    // row (a photo that fails swaps its reserved box for a one-line note), which reads as a wrap.
    const { third, fourth, toolkit, download, walk } = await page.evaluate(() => {
      const top = (el: Element | null | undefined) => ({ y: el!.getBoundingClientRect().top });
      const cardEls = document.querySelectorAll('[data-testid="story-card"]');
      const buttons = [...document.querySelectorAll("button")];
      return {
        third: top(cardEls[2]),
        fourth: top(cardEls[3]),
        toolkit: top(document.querySelector('[data-testid="haunt-toolkit"]')),
        download: top(buttons.find((b) => b.textContent?.trim() === "Download this tour")),
        walk: top(buttons.find((b) => b.textContent?.startsWith("Start the walk"))),
      };
    });
    expect(toolkit.y).toBeGreaterThan(third.y);
    expect(toolkit.y).toBeLessThan(fourth.y);
    expect(download.y).toBeGreaterThan(third.y);
    // Walk and save share one row.
    expect(Math.abs(download.y - walk.y)).toBeLessThan(8);
    // On a Pixel 7 the first story starts on the first screen.
    expect((await cards.first().boundingBox())!.y).toBeLessThan(page.viewportSize()!.height);
  });

  test("a fresh haunt elsewhere isn't replaced by browsing: the hub offers “Make this my haunt” (F11)", async ({ page, context }) => {
    await seedHaunt(context, SLEEPY_HOLLOW_HAUNT);
    await openOakland(page);
    await expect(badge(page)).toHaveText(/Haunting:\s*Sleepy Hollow Cemetery/);
    const offer = page.getByTestId("make-haunt");
    await expect(offer).toContainText("Your haunt is Sleepy Hollow Cemetery.");
    expect(await storedHaunt(page)).toMatchObject({ qid: "Q360779" });
    // The tools here still work on this cemetery.
    await expect(kit(page).getByRole("link", { name: "Spirit", exact: true })).toHaveAttribute("href", /cemetery=Q2008469/);
    await offer.getByRole("button", { name: "Make this my haunt" }).click();
    await expect(badge(page)).toHaveText(/Haunting:\s*Oakland Cemetery/);
    await expect(page.getByTestId("make-haunt")).toHaveCount(0);
    expect(await storedHaunt(page)).toMatchObject({ qid: "Q2008469" });
  });

  test("coming from the near list or “I’m here” does switch the haunt; “here” also offers the others (F11)", async ({ page, context }) => {
    await seedHaunt(context, SLEEPY_HOLLOW_HAUNT);
    await openOakland(page, "?via=near");
    await expect(badge(page)).toHaveText(/Haunting:\s*Oakland Cemetery/);
    await expect(page.getByRole("link", { name: "Not here? See the others" })).toHaveCount(0);

    await openOakland(page, "?via=here&lat=33.7487&lon=-84.3713");
    await expect(page.getByRole("link", { name: "Not here? See the others" })).toHaveAttribute("href", "/near?lat=33.749&lon=-84.371&list=1");
  });

  test("a tool that asked for a haunt first is offered again once you have one (F12)", async ({ page }) => {
    await page.goto("/stamp");
    const gate = page.getByTestId("pick-haunt");
    await expect(gate).toBeVisible();
    await expect(gate).toContainText("you’ll come back to the Stamp Kit");
    await gate.getByRole("link", { name: /Oakland Cemetery/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Oakland Cemetery" })).toBeVisible({ timeout: 25_000 });
    const go = page.getByTestId("continue-to");
    await expect(go).toHaveText("Continue to the Stamp Kit");
    await go.click();
    await expect(page).toHaveURL(/\/stamp\?cemetery=Q2008469/);
    await expect(page.locator("#stamp-photo")).toBeAttached();
  });

  test("Oakland has people for the spirit box and the calendar, so their chips show (F14)", async ({ page }) => {
    await openOakland(page);
    for (const name of ["Spirit", "Séance", "Calendar"]) await expect(kit(page).getByRole("link", { name, exact: true })).toBeVisible();
    await expect(kit(page).getByText(/No one listed here died/)).toHaveCount(0);
  });

  test("plain cards for recent deaths carry no motifs (F26)", async ({ page }) => {
    await openOakland(page);
    await expect(page.getByTestId("story-card")).toHaveCount(12, { timeout: 25_000 });
    const more = page.getByRole("button", { name: /^Show \d+ more stops/ });
    for (let i = 0; i < 10 && (await more.count()) > 0; i++) await more.click();
    const plain = page.locator('[data-testid="story-card"][data-style="plain"]');
    expect(await plain.count()).toBeGreaterThan(0);
    await expect(plain.locator(":is(.arch, .bezel, .instrument, .sym-orbit, .sym-flame, .fence, .orbit-divider)")).toHaveCount(0);
  });

  test("a haunt seeded before load renders without hydration errors on home and a tool page", async ({ page, context }) => {
    await seedHaunt(context, SLEEPY_HOLLOW_HAUNT);
    const hydration = watchHydration(page);
    await page.goto("/", { waitUntil: "networkidle" });
    await expect(badge(page)).toHaveText(/Haunting:\s*Sleepy Hollow Cemetery/);
    await page.goto("/stamp", { waitUntil: "networkidle" });
    await expect(page.getByTestId("pick-haunt")).toHaveCount(0);
    await expect(page.locator("#stamp-photo")).toBeAttached();
    expect(hydration).toEqual([]);
  });

  test("the spirit box starts on the haunt, not on Oakland", async ({ page, context }) => {
    await seedHaunt(context, SLEEPY_HOLLOW_HAUNT);
    // The saved copy, so this doesn't depend on live Wikidata.
    await page.route("**/api/cemeteries/*/burials", (route) => route.fulfill({ status: 404, body: "not found" }));
    await page.goto("/spirit");
    await expect(page.getByLabel(/Sleepy Hollow Cemetery/)).toBeChecked();
    await expect(page.getByText(/people buried at Sleepy Hollow Cemetery died 75 or more years ago/)).toBeVisible();
  });

  test("a haunt that isn't a sample is offered as “Your haunt” on the spirit box and the calendar", async ({ page, context }) => {
    await seedHaunt(context, { qid: "Q872253", name: "Lake View Cemetery", place: "Seattle" });
    await page.route("**/api/calendar/Q872253*", (route) =>
      route.fulfill({ status: 200, contentType: "text/calendar; charset=utf-8", body: "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n" }),
    );
    await page.route("**/api/cemeteries/Q872253/burials", (route) =>
      route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { source: "Wikidata", message: "test outage" } }) }),
    );
    await page.goto("/spirit");
    await expect(page.getByLabel(/Your haunt/)).toBeChecked();
    await expect(page.getByLabel(/Your haunt/)).toHaveAccessibleName(/Lake View Cemetery/);
    await page.goto("/calendar");
    await expect(page.getByRole("radio", { name: /Lake View Cemetery/ })).toBeChecked();
  });

  test("with storage blocked, the haunt still holds for the page view", async ({ page, context }) => {
    await context.addInitScript(() => {
      Object.defineProperty(window, "localStorage", {
        get() {
          throw new DOMException("blocked", "SecurityError");
        },
        configurable: true,
      });
    });
    await openOakland(page);
    await expect(badge(page)).toHaveText(/Haunting:\s*Oakland Cemetery/);
    // Client-side navigation keeps it; the toolkit's links also carry the cemetery, so the tool opens either way.
    await kit(page).getByRole("link", { name: "Stamp", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Stamp Kit" })).toBeVisible();
    await expect(page.getByTestId("pick-haunt")).toHaveCount(0);
    await expect(page.locator("#stamp-photo")).toBeAttached();
  });
});

test.describe("first-run rules (F6)", () => {
  test("show once as a card on the first hub, after the first stories, never as a popup", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await openOakland(page);
    const card = page.getByTestId("etiquette");
    await expect(card).toBeVisible();
    await expect(card).toContainText("Before you go in");
    // It doesn't push the first story off the first screen.
    await expect(page.getByTestId("story-card").first()).toBeVisible({ timeout: 25_000 });
    expect((await page.getByTestId("story-card").first().boundingBox())!.y).toBeLessThan(page.viewportSize()!.height);
    await card.getByText("Read the four rules").click();
    await expect(card.getByText(/Check the closing time/)).toBeVisible();
    await card.getByRole("button", { name: "Got it" }).click();
    await expect(card).toBeHidden();
    expect(await page.evaluate(() => localStorage.getItem("btt-etiquette-seen"))).toBe("1");
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Oakland Cemetery" })).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId("etiquette")).toBeHidden();
  });
});

test.describe("tool pages without a haunt", () => {
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(seenEtiquette);
  });

  for (const path of GATED) {
    test(`${path} says to pick a haunt first and shows the doors`, async ({ page }) => {
      await page.goto(path);
      const gate = page.getByTestId("pick-haunt");
      await expect(gate.getByRole("heading", { level: 2, name: "Pick a haunt first" })).toBeVisible();
      await expect(gate.getByTestId("doors").getByRole("heading", { level: 3 })).toHaveText(["Search a graveyard", "Plan a date"]);
      await expect(gate.getByRole("button", { name: HAUNT_ME })).toBeVisible();
      await expect(gate.getByLabel("Or type the cemetery’s name")).toBeVisible();
      await expect(gate.getByRole("link", { name: /Oakland Cemetery/ })).toBeVisible();
      // The page still says what it is.
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    });
  }

  test("a cemetery in the link opens the tool and becomes the haunt", async ({ page }) => {
    await page.route("**/api/cemeteries/Q872253/burials", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ cemetery: { qid: "Q872253", name: "Lake View Cemetery", locatedIn: "Seattle" }, people: [] }) }),
    );
    await page.goto("/stamp?cemetery=Q872253&name=Lake%20View%20Cemetery&place=Seattle");
    await expect(page.getByTestId("pick-haunt")).toHaveCount(0);
    await expect(page.locator("#stamp-photo")).toBeAttached();
    await expect(badge(page)).toHaveText(/Haunting:\s*Lake View Cemetery/);
    expect(await storedHaunt(page)).toMatchObject({ qid: "Q872253", name: "Lake View Cemetery", place: "Seattle" });
  });

  test("a cemetery in the link opens the tool but doesn't replace a fresh haunt (F11)", async ({ page, context }) => {
    await seedHaunt(context, SLEEPY_HOLLOW_HAUNT);
    await page.goto("/stamp?cemetery=Q872253&name=Lake%20View%20Cemetery&place=Seattle");
    await expect(page.locator("#stamp-photo")).toBeAttached();
    await expect(badge(page)).toHaveText(/Haunting:\s*Sleepy Hollow Cemetery/);
  });

  test("a spirit box link to a cemetery it has to look up becomes the haunt once its names load", async ({ page }) => {
    await page.route("**/api/cemeteries/*/burials", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          cemetery: { qid: "Q999999", name: "Test Hill Cemetery" },
          fetchedAt: "2026-10-20T00:00:00Z",
          sources: {},
          people: [{ qid: "Q1", name: "Eleanor Oldfield", death: "1899-03-01T00:00:00Z", deathPrecision: 11, occupations: [] }],
        }),
      }),
    );
    await page.goto("/spirit?cemetery=Q999999");
    await expect(page.getByTestId("pick-haunt")).toHaveCount(0);
    await expect(page.getByText(/1 person buried at Test Hill Cemetery died 75 or more years ago/)).toBeVisible();
    await expect(badge(page)).toHaveText(/Haunting:\s*Test Hill Cemetery/);
    expect(await storedHaunt(page)).toMatchObject({ qid: "Q999999", name: "Test Hill Cemetery" });
  });

  test("a spirit box link whose cemetery can't load opens but doesn't become the haunt", async ({ page }) => {
    await page.route("**/api/cemeteries/*/burials", (route) =>
      route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { source: "Wikidata", message: "Couldn't reach Wikidata." } }) }),
    );
    await page.goto("/spirit?cemetery=Q999999");
    await expect(page.getByText(/Couldn.t load the burials for this cemetery/)).toBeVisible();
    await expect(badge(page)).toHaveCount(0);
    expect(await storedHaunt(page)).toBeNull();
  });
});

test.describe("links someone sent open straight in, with no haunt", () => {
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(seenEtiquette);
    await context.route("**/api/cemeteries/*/burials", (route) => route.fulfill({ status: 404, body: "not found" }));
  });

  test("a séance link", async ({ page }) => {
    await page.goto("/spirit?seance=KXMPRT&cemetery=Q2008469");
    await expect(page.getByRole("heading", { name: "Séance KXMPRT" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Join the séance" })).toBeVisible();
    await expect(page.getByTestId("pick-haunt")).toHaveCount(0);
  });

  test("a séance link without a cemetery", async ({ page }) => {
    await page.goto("/spirit?seance=KXMPRT");
    await expect(page.getByRole("heading", { name: "Séance KXMPRT" })).toBeVisible();
    await expect(page.getByTestId("pick-haunt")).toHaveCount(0);
  });

  test("a broken séance link leads to the room-code box on the host's cemetery, not a gate (F13)", async ({ page }) => {
    await page.goto("/spirit?seance=ABC&cemetery=Q360779");
    await expect(page.getByRole("alert").filter({ hasText: "This séance link has a broken room code" })).toBeVisible();
    await page.getByRole("link", { name: "Type the room code" }).click();
    await expect(page).toHaveURL(/\/spirit\?join=1&cemetery=Q360779#seance$/);
    await expect(page.getByTestId("pick-haunt")).toHaveCount(0);
    await expect(page.getByLabel("Séance room code")).toBeFocused();
    await expect(page.getByLabel(/Sleepy Hollow Cemetery/)).toBeChecked();
    await page.getByLabel("Séance room code").fill("KXMPRT");
    await page.getByRole("button", { name: "Join", exact: true }).click();
    await expect(page).toHaveURL(/\/spirit\?seance=KXMPRT&cemetery=Q360779$/);
  });

  test("joining a friend's party by code needs no haunt either (F13)", async ({ page }) => {
    await page.goto("/games/party");
    await page.getByTestId("pick-haunt").getByRole("link", { name: /Joining a friend’s party\? Type the room code/ }).click();
    await expect(page).toHaveURL(/\/games\/party\?join=1$/);
    await expect(page.getByTestId("pick-haunt")).toHaveCount(0);
    await expect(page.getByLabel("Room code")).toBeFocused();
    await page.getByLabel("Room code").fill("kxm-prt");
    await page.getByRole("button", { name: "Join" }).click();
    await expect(page).toHaveURL(/\/games\/bingo\?party=KXMPRT$/);
    await expect(page.getByTestId("bingo-card").getByRole("button")).toHaveCount(25);
  });

  test("the spirit box gate offers the séance code box (F13)", async ({ page }) => {
    await page.goto("/spirit");
    await page.getByTestId("pick-haunt").getByRole("link", { name: /Joining a friend’s séance\? Type the room code/ }).click();
    await expect(page.getByTestId("pick-haunt")).toHaveCount(0);
    await expect(page.getByLabel("Séance room code")).toBeFocused();
  });

  test("a party room link", async ({ page }) => {
    await page.goto("/games/bingo?party=KXMPRT");
    await expect(page.getByTestId("bingo-card").getByRole("button")).toHaveCount(25);
    await expect(page.getByText(/Party KXMPRT\./)).toBeVisible();
    await expect(page.getByTestId("pick-haunt")).toHaveCount(0);
  });

  test("a calendar link, which also becomes the haunt", async ({ page }) => {
    await page.route("**/api/calendar/Q872253*", (route) =>
      route.fulfill({ status: 200, contentType: "text/calendar; charset=utf-8", body: "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n" }),
    );
    await page.route("**/api/cemeteries/Q872253/burials", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ cemetery: { qid: "Q872253", name: "Lake View Cemetery", locatedIn: "Seattle" }, people: [] }) }),
    );
    await page.goto("/calendar?cemetery=Q872253&name=Lake%20View%20Cemetery&place=Seattle");
    await expect(page.getByRole("radio", { name: /Lake View Cemetery/ })).toBeChecked();
    await expect(page.getByTestId("pick-haunt")).toHaveCount(0);
    await expect(badge(page)).toHaveText(/Haunting:\s*Lake View Cemetery/);
  });

  test("the pages that are never gated", async ({ page }) => {
    for (const path of ["/gravitator", "/near", "/search", "/gravitator/saved"]) {
      await page.goto(path);
      await expect(page.getByTestId("pick-haunt"), path).toHaveCount(0);
    }
  });
});

test.describe("the Kit tab and the Ghost pass (decision 29)", () => {
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(seenEtiquette);
  });

  test("the kit is locked without a haunt; the Ghost pass opens it at Sleepy Hollow and says so", async ({ page }) => {
    await page.goto("/kit");
    await expect(page.getByTestId("kit-locked")).toBeVisible();
    await expect(page.getByRole("link", { name: "Stamp Kit" })).toHaveCount(0);

    await page.getByRole("button", { name: "Take the Ghost pass" }).click();
    await expect(page.getByTestId("ghost-pass")).toContainText("Ghost pass: you’re at Sleepy Hollow Cemetery in spirit.");
    await expect(page.getByTestId("haunt-badge")).toHaveText(/Ghost pass:\s*Sleepy Hollow Cemetery/);
    expect(await storedHaunt(page)).toMatchObject({ qid: "Q360779", ghost: true });
    await expect(nav(page).getByRole("link", { name: "Kit" })).toHaveAttribute("aria-current", "page");
    await expect(nav(page).getByTestId("kit-lock")).toHaveCount(0);
    await expect(page.getByRole("link", { name: /^Stamp Kit/ })).toHaveAttribute("href", /^\/stamp\?cemetery=Q360779/);

    // Opening the haunt's own hub keeps the pass; ending it locks the kit again.
    await page.goto("/cemetery/Q360779");
    await expect(page.getByRole("heading", { level: 1, name: "Sleepy Hollow Cemetery" })).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId("haunt-badge")).toHaveText(/Ghost pass:/);
    await page.goto("/kit");
    await page.getByRole("button", { name: "End the Ghost pass" }).click();
    await expect(page.getByTestId("kit-locked")).toBeVisible();
    await expect(page.getByTestId("haunt-badge")).toHaveCount(0);
  });

  test("a tool that asks for a haunt offers the Ghost pass and opens on it, sample headstone included", async ({ page }) => {
    await page.goto("/stamp");
    await expect(page.getByTestId("pick-haunt")).toBeVisible();
    await page.getByRole("button", { name: "Take the Ghost pass" }).click();
    await expect(page).toHaveURL(/\/stamp$/);
    await expect(page.getByTestId("pick-haunt")).toHaveCount(0);
    await page.getByRole("button", { name: "No headstone handy? Use a sample" }).click();
    await expect(page.getByTestId("sample-credit")).toContainText("CC BY 2.0");
    await expect(page.getByTestId("stamp-status")).toContainText(/Photo ready|Stamps ready/);
    await expect(page.locator("#stamp-name")).toHaveValue("Washington Irving");
  });
});
