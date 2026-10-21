import { expect, test, type BrowserContext, type Page } from "@playwright/test";

// Lane 10 (decision 18): the home page's doors, the haunt (the cemetery you
// picked, kept on the phone), the tool pages that wait for one, and the links
// someone sent, which never do.

const SLEEPY = { qid: "Q360779", name: "Sleepy Hollow Cemetery", place: "Sleepy Hollow", at: "2026-10-21T00:00:00.000Z" };
const GATED = ["/stamp", "/spirit", "/games", "/games/bingo", "/games/party", "/games/evp", "/calendar"];

function seenEtiquette() {
  try {
    localStorage.setItem("btt-etiquette-seen", "1");
  } catch {
    // ignore
  }
}

async function seedHaunt(context: BrowserContext, haunt: object) {
  await context.addInitScript((h) => {
    try {
      localStorage.setItem("btt-haunt", JSON.stringify(h));
    } catch {
      // ignore
    }
  }, haunt);
}

async function storedHaunt(page: Page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem("btt-haunt");
    return raw ? (JSON.parse(raw) as Record<string, string>) : null;
  });
}

const nav = (page: Page) => page.getByRole("navigation", { name: "Main" });
const badge = (page: Page) => page.getByRole("banner").getByRole("link", { name: /^Haunting:/ });

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

test.beforeEach(async ({ context }) => {
  await context.addInitScript(seenEtiquette);
});

test.describe("home", () => {
  test("opens on two doors: search (location first, then by name) and plan a date", async ({ page }) => {
    const hydration = watchHydration(page);
    await page.goto("/");
    const doors = page.getByTestId("doors");
    const titles = doors.getByRole("heading", { level: 2 });
    await expect(titles).toHaveText(["Search a graveyard", "Plan a date"]);

    const search = page.getByRole("region", { name: "Search a graveyard" });
    const hauntMe = search.getByRole("button", { name: /^I.m here\. Haunt me\.$/ });
    await expect(hauntMe).toBeVisible();
    await expect(hauntMe).toHaveAccessibleDescription("Uses your location");
    await expect(search.getByText("or search by name")).toBeVisible();
    await expect(search.getByLabel("Cemetery name")).toBeVisible();
    await expect(search.getByRole("button", { name: "Search", exact: true })).toBeVisible();

    const date = page.getByRole("region", { name: "Plan a date" });
    await expect(date.getByRole("link", { name: "Open the Gravitator" })).toHaveAttribute("href", "/gravitator");

    // The samples stay, quietly, below the doors.
    await expect(page.getByRole("heading", { name: "or start with a famous one" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Oakland Cemetery/ })).toHaveAttribute("href", "/cemetery/Q2008469");
    await expect(page.getByRole("link", { name: /Sleepy Hollow Cemetery/ })).toHaveAttribute("href", "/cemetery/Q360779");

    // No haunt: no badge, and the nav is the ways in.
    await expect(badge(page)).toHaveCount(0);
    await expect(nav(page).getByRole("link")).toHaveText(["Search", "Gravitator", "Saved"]);
    await expect(nav(page).getByRole("link", { name: "Saved" })).toHaveAttribute("href", "/gravitator/saved");
    for (const link of await nav(page).getByRole("link").all()) {
      const box = await link.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(48);
      expect(box!.width).toBeGreaterThanOrEqual(48);
    }
    // The name stands alone: no tagline, no theme toggle.
    await expect(page.getByRole("banner")).toHaveText(/^\s*Skip to content\s*Between Two Tombstones\s*$/);
    await expect(page.getByRole("button", { name: /theme|daylight|dark/i })).toHaveCount(0);
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
    await page.getByRole("button", { name: /^I.m here\. Haunt me\.$/ }).click();
    expect(await page.evaluate(() => (window as unknown as { __geoCalls: number }).__geoCalls)).toBe(1);
    await expect(page.getByRole("alert").filter({ hasText: "Location is turned off for this site" })).toContainText("search by name below");
    await expect(page).toHaveURL(/\/$/);
  });

  test("“I’m here. Haunt me.” opens the nearby list for where you are", async ({ page, context }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: 33.7487, longitude: -84.3713 });
    // Only the navigation matters here; the list itself is the tour spec's job.
    await page.route("**/near?**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<p>near</p>" }));
    await page.goto("/");
    await page.getByRole("button", { name: /^I.m here\. Haunt me\.$/ }).click();
    await expect(page).toHaveURL(/\/near\?lat=33\.7487\d*&lon=-84\.3713\d*$/);
  });
});

test.describe("the haunt", () => {
  test("opening a cemetery makes it the haunt: header, hub toolkit, nav and home all follow", async ({ page }) => {
    const hydration = watchHydration(page);
    await page.goto("/cemetery/Q2008469");
    await expect(page.getByRole("heading", { level: 1, name: "Oakland Cemetery" })).toBeVisible({ timeout: 25_000 });

    await expect(badge(page)).toHaveText(/Haunting:\s*Oakland Cemetery/);
    await expect(badge(page)).toHaveAttribute("href", "/cemetery/Q2008469");
    const stored = await storedHaunt(page);
    expect(stored).toMatchObject({ qid: "Q2008469", name: "Oakland Cemetery" });
    expect(Number.isNaN(Date.parse(stored!.at))).toBe(false);

    // The hub's toolkit: every tool, carrying the cemetery; the tour header's old links folded in.
    const kit = page.getByRole("region", { name: "Your haunt" });
    const q = /cemetery=Q2008469&name=Oakland\+Cemetery/;
    await expect(kit.getByRole("link", { name: "Stamp Kit" })).toHaveAttribute("href", new RegExp(`^/stamp\\?${q.source}`));
    await expect(kit.getByRole("link", { name: "Spirit Box" })).toHaveAttribute("href", new RegExp(`^/spirit\\?${q.source}`));
    await expect(kit.getByRole("link", { name: "Séance" })).toHaveAttribute("href", new RegExp(`^/spirit\\?${q.source}.*#seance$`));
    await expect(kit.getByRole("link", { name: "Tombstone Bingo" })).toHaveAttribute("href", new RegExp(`^/games/bingo\\?${q.source}`));
    await expect(kit.getByRole("link", { name: "Graveyard Party" })).toHaveAttribute("href", new RegExp(`^/games/party\\?${q.source}`));
    await expect(kit.getByRole("link", { name: "Haunted Calendar" })).toHaveAttribute("href", new RegExp(`^/calendar\\?${q.source}`));
    await expect(page.getByRole("link", { name: "Start a séance here" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Haunt my calendar" })).toHaveCount(0);
    // The tour is still the page's main thing.
    await expect(page.getByTestId("story-card")).toHaveCount(12, { timeout: 25_000 });

    await expect(nav(page).getByRole("link")).toHaveText(["Haunt", "Stamp", "Spirit", "Games"]);
    await expect(nav(page).getByRole("link", { name: "Haunt" })).toHaveAttribute("aria-current", "page");
    await expect(nav(page).getByRole("link", { name: "Haunt" })).toHaveAttribute("href", "/cemetery/Q2008469");

    // A tool from the toolkit opens on the haunt.
    await kit.getByRole("link", { name: "Spirit Box" }).click();
    await expect(page.getByText(/people buried at Oakland Cemetery died 75 or more years ago/)).toBeVisible();
    await expect(nav(page).getByRole("link", { name: "Spirit" })).toHaveAttribute("aria-current", "page");

    // "Change haunt" goes back to the doors; home offers the way back too.
    await page.goto("/cemetery/Q2008469");
    await page.getByRole("link", { name: "Change haunt" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId("doors")).toBeVisible();
    await expect(page.getByTestId("haunt-return")).toContainText("Oakland Cemetery");
    await expect(page.getByTestId("haunt-return").getByRole("link", { name: "Back to it" })).toHaveAttribute("href", "/cemetery/Q2008469");
    expect(hydration).toEqual([]);
  });

  test("a haunt seeded before load renders without hydration errors on home and a tool page", async ({ page, context }) => {
    await seedHaunt(context, SLEEPY);
    const hydration = watchHydration(page);
    await page.goto("/", { waitUntil: "networkidle" });
    await expect(badge(page)).toHaveText(/Haunting:\s*Sleepy Hollow Cemetery/);
    await expect(nav(page).getByRole("link")).toHaveText(["Haunt", "Stamp", "Spirit", "Games"]);
    await page.goto("/stamp", { waitUntil: "networkidle" });
    await expect(page.getByTestId("pick-haunt")).toHaveCount(0);
    await expect(page.locator("#stamp-photo")).toBeAttached();
    expect(hydration).toEqual([]);
  });

  test("the spirit box starts on the haunt, not on Oakland", async ({ page, context }) => {
    await seedHaunt(context, SLEEPY);
    // The saved copy, so this doesn't depend on live Wikidata.
    await page.route("**/api/cemeteries/*/burials", (route) => route.fulfill({ status: 404, body: "not found" }));
    await page.goto("/spirit");
    await expect(page.getByLabel(/Sleepy Hollow Cemetery/)).toBeChecked();
    await expect(page.getByText(/people buried at Sleepy Hollow Cemetery died 75 or more years ago/)).toBeVisible();
  });

  test("a haunt that isn't a sample is offered as “Your haunt” on the spirit box and the calendar", async ({ page, context }) => {
    await seedHaunt(context, { qid: "Q872253", name: "Lake View Cemetery", place: "Seattle", at: "2026-10-21T00:00:00.000Z" });
    await page.route("**/api/calendar/Q872253*", (route) =>
      route.fulfill({ status: 200, contentType: "text/calendar; charset=utf-8", body: "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n" }),
    );
    await page.route("**/api/cemeteries/Q872253/burials", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { source: "Wikidata", message: "test outage" } }) }));
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
    await page.goto("/cemetery/Q2008469");
    // Storage blocked means the first-run card can't remember it was seen: it shows, and closes.
    await page.getByRole("dialog", { name: "Before you go in" }).getByRole("button", { name: "Got it" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Oakland Cemetery" })).toBeVisible({ timeout: 25_000 });
    await expect(badge(page)).toHaveText(/Haunting:\s*Oakland Cemetery/);
    // Client-side navigation keeps it; the toolkit's links also carry the cemetery, so the tool opens either way.
    await page.getByRole("region", { name: "Your haunt" }).getByRole("link", { name: "Stamp Kit" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Stamp Kit" })).toBeVisible();
    await expect(page.getByTestId("pick-haunt")).toHaveCount(0);
    await expect(page.locator("#stamp-photo")).toBeAttached();
  });
});

test.describe("tool pages without a haunt", () => {
  for (const path of GATED) {
    test(`${path} says to pick a haunt first and shows the doors`, async ({ page }) => {
      await page.goto(path);
      const gate = page.getByTestId("pick-haunt");
      await expect(gate.getByRole("heading", { level: 2, name: "Pick a haunt first" })).toBeVisible();
      await expect(gate.getByTestId("doors").getByRole("heading", { level: 3 })).toHaveText(["Search a graveyard", "Plan a date"]);
      await expect(gate.getByRole("button", { name: /^I.m here\. Haunt me\.$/ })).toBeVisible();
      await expect(gate.getByLabel("Cemetery name")).toBeVisible();
      await expect(gate.getByRole("link", { name: /Oakland Cemetery/ })).toBeVisible();
      // The page still says what it is.
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    });
  }

  test("a cemetery in the link opens the tool and becomes the haunt", async ({ page }) => {
    await page.goto("/stamp?cemetery=Q872253&name=Lake%20View%20Cemetery&place=Seattle");
    await expect(page.getByTestId("pick-haunt")).toHaveCount(0);
    await expect(page.locator("#stamp-photo")).toBeAttached();
    await expect(badge(page)).toHaveText(/Haunting:\s*Lake View Cemetery/);
    expect(await storedHaunt(page)).toMatchObject({ qid: "Q872253", name: "Lake View Cemetery", place: "Seattle" });
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
  test("a séance link", async ({ page }) => {
    await page.route("**/api/cemeteries/*/burials", (route) => route.fulfill({ status: 404, body: "not found" }));
    await page.goto("/spirit?seance=KXMPRT&cemetery=Q2008469");
    await expect(page.getByRole("heading", { name: "Séance KXMPRT" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Join the séance" })).toBeVisible();
    await expect(page.getByTestId("pick-haunt")).toHaveCount(0);
  });

  test("a séance link without a cemetery", async ({ page }) => {
    await page.route("**/api/cemeteries/*/burials", (route) => route.fulfill({ status: 404, body: "not found" }));
    await page.goto("/spirit?seance=KXMPRT");
    await expect(page.getByRole("heading", { name: "Séance KXMPRT" })).toBeVisible();
    await expect(page.getByTestId("pick-haunt")).toHaveCount(0);
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
