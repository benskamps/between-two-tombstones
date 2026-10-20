import { expect, test, type Page } from "@playwright/test";

// Lane 7: the Gravitator swipe deck. The deck API is mocked with page.route so
// the suite never touches Wikidata; the cards are real ones from a live deck
// pulled 2026-10-20 (lat 33.75, lon -84.37), plus one synthetic family
// cemetery that must never reach the screen.

const OAKLAND = {
  qid: "Q2008469",
  name: "Oakland Cemetery",
  place: "Atlanta",
  lat: 33.748722,
  lon: -84.371333,
  distanceKm: 0.188,
  image: "https://commons.wikimedia.org/wiki/Special:FilePath/Oakland_Cemetery_and_Atlanta_Skyscrapers.jpg?width=500",
  imageFile: "Oakland Cemetery and Atlanta Skyscrapers.jpg",
  established: { year: 1850, precision: 9 },
  acres: 48,
  heritage: ["National Register of Historic Places listed place"],
  typeIds: ["Q39614"],
  types: [],
  findAGraveId: "35955",
  enwiki: "Oakland Cemetery (Atlanta)",
  bio: {
    intro:
      "Oakland Cemetery is one of the largest cemetery green spaces in Atlanta, Georgia, U.S. Founded as Atlanta Cemetery in 1850 on six acres (2.4 hectares) of land southeast of the city, it was renamed in 1872 to reflect the large number of oak and magnolia trees growing in the area. By that time, the city had grown and the cemetery had enlarged correspondingly to the current 48 acres (190,000 m2).",
    url: "https://en.wikipedia.org/wiki/Oakland_Cemetery_(Atlanta)",
  },
  notable: {
    count: 114,
    top: [
      { qid: "Q173540", name: "Margaret Mitchell", deathYear: 1949, recent: false },
      { qid: "Q437526", name: "Bobby Jones", deathYear: 1971, recent: false },
      { qid: "Q118774", name: "John B. Gordon", deathYear: 1904, recent: false },
    ],
  },
};

const FAMILY = {
  // Synthetic: a family cemetery the API should never send. The browser drops it too.
  qid: "Q999999901",
  name: "Hightower Family Cemetery",
  place: "Fulton County",
  lat: 33.76,
  lon: -84.39,
  distanceKm: 2,
  image: null,
  imageFile: null,
  established: null,
  acres: null,
  heritage: [],
  typeIds: ["Q39614", "Q73218016"],
  types: ["family cemetery"],
  findAGraveId: null,
  enwiki: null,
  bio: null,
  notable: { count: 0, top: [] },
};

const WESTVIEW = {
  qid: "Q7989746",
  name: "Westview Cemetery",
  place: "Atlanta",
  lat: 33.7462,
  lon: -84.4431,
  distanceKm: 6.771,
  image: "https://commons.wikimedia.org/wiki/Special:FilePath/View_of_Westview_Cemetery_Abbey.jpg?width=500",
  imageFile: "View of Westview Cemetery Abbey.jpg",
  established: { year: 1884, precision: 9 },
  acres: null,
  heritage: [],
  typeIds: ["Q39614"],
  types: [],
  findAGraveId: "37684",
  enwiki: "Westview Cemetery",
  bio: {
    intro:
      "Westview Cemetery, located in Atlanta, Georgia, is the largest civilian cemetery in the Southeastern United States, comprising more than 582 acres (2.36 km2), 50 percent of which is undeveloped. The cemetery includes the graves of more than 125,000 people and was added to the Georgia Register of Historic Places in 2019 and the National Register of Historic Places in 2020.",
    url: "https://en.wikipedia.org/wiki/Westview_Cemetery",
  },
  notable: {
    count: 105,
    top: [
      { qid: "Q491019", name: "Herman Cain", deathYear: 2020, recent: true },
      { qid: "Q554269", name: "Joel Chandler Harris", deathYear: 1908, recent: false },
      { qid: "Q744866", name: "Asa Griggs Candler", deathYear: 1929, recent: false },
    ],
  },
};

const SPARSE = {
  qid: "Q117702125",
  name: "All Saints Episcopal Church Cemetery",
  place: "Fulton County",
  lat: 33.7715,
  lon: -84.38772,
  distanceKm: 2.898,
  image: null,
  imageFile: null,
  established: null,
  acres: null,
  heritage: [],
  typeIds: ["Q39614"],
  types: [],
  findAGraveId: "2163311",
  enwiki: null,
  bio: null,
  notable: { count: 0, top: [] },
};

const DECK = {
  center: { lat: 33.75, lon: -84.37 },
  radiusKm: 25,
  fetchedAt: "2026-10-20T03:19:00.000Z",
  total: 3,
  excluded: 29,
  cards: [OAKLAND, FAMILY, WESTVIEW, SPARSE],
  notes: [],
};

const ATLANTA = "/gravitator?lat=33.7486&lon=-84.3733&near=Atlanta";
const PUBLIC_NAMES = ["Oakland Cemetery", "Westview Cemetery", "All Saints Episcopal Church Cemetery"];

async function setup(page: Page, body: unknown = DECK, status = 200) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("btt-etiquette-seen", "1");
    } catch {
      // ignore
    }
  });
  // No photos from Commons in tests: every card must fall back to the drawn placeholder.
  await page.route(/https:\/\/(commons|upload)\.wikimedia\.org\//, (r) => r.abort());
  const urls: string[] = [];
  await page.route("**/api/gravitator?**", async (route) => {
    urls.push(route.request().url());
    await route.fulfill({ status, json: body });
  });
  return urls;
}

const topCard = (page: Page) => page.locator(".g-stack article[data-qid]");
const topName = (page: Page) => topCard(page).locator("h2");
const announcer = (page: Page) => page.locator('.gravitator [aria-live="polite"]');

async function drag(page: Page, fraction: number, opts: { release?: boolean } = {}) {
  const box = (await topCard(page).boundingBox())!;
  // Grab the photo (no links or buttons there).
  const x = box.x + box.width / 2;
  const y = box.y + box.height * 0.22;
  await page.mouse.move(x, y);
  await page.mouse.down();
  const steps = 12;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(x + (box.width * fraction * i) / steps, y + i);
  }
  if (opts.release !== false) await page.mouse.up();
}

test.describe("Gravitator", () => {
  test("start screen asks for location only on a tap", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("btt-etiquette-seen", "1");
      const w = window as unknown as { __geoCalls: number };
      w.__geoCalls = 0;
      Object.defineProperty(navigator, "geolocation", {
        configurable: true,
        value: {
          getCurrentPosition(ok: PositionCallback) {
            w.__geoCalls++;
            ok({ coords: { latitude: 33.74861, longitude: -84.37329 } } as GeolocationPosition);
          },
        },
      });
    });
    const urls: string[] = [];
    await page.route("**/api/gravitator?**", async (route) => {
      urls.push(route.request().url());
      await route.fulfill({ json: DECK });
    });
    await page.goto("/gravitator");
    await expect(page.getByRole("heading", { name: "Gravitator", level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "Try it around Atlanta" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Try it around Sleepy Hollow, NY" })).toHaveAttribute(
      "href",
      "/gravitator?lat=41.0956&lon=-73.8607&near=Sleepy+Hollow%2C+NY",
    );
    expect(await page.evaluate(() => (window as unknown as { __geoCalls: number }).__geoCalls)).toBe(0);

    await page.getByRole("button", { name: "Use my location" }).click();
    await expect(page).toHaveURL(/\/gravitator\?lat=33\.7490&lon=-84\.3730$/);
    await expect(topName(page)).toHaveText("Oakland Cemetery");
    // The server only ever sees the point rounded to 2 decimals.
    expect(urls[0]).toMatch(/\/api\/gravitator\?lat=33\.75&lon=-84\.37&radius=25$/);
  });

  test("mocked deck shows 3 public cards; the family cemetery never appears", async ({ page }) => {
    const urls = await setup(page);
    await page.goto(ATLANTA);
    await expect(topName(page)).toHaveText("Oakland Cemetery");
    await expect(topCard(page)).toBeFocused();
    expect(urls).toHaveLength(1);

    const seen: string[] = [];
    for (let i = 0; i < 3; i++) {
      const name = (await topName(page).textContent())!;
      seen.push(name);
      await expect(page.getByText("Hightower")).toHaveCount(0);
      await topCard(page).focus();
      await page.keyboard.press("ArrowLeft");
      await expect(announcer(page)).toHaveText(`Passed on ${name}.`);
    }
    expect(seen).toEqual(PUBLIC_NAMES);
    await expect(page.getByRole("heading", { name: "That's every public cemetery with a Wikidata entry within 25 km." })).toBeVisible();
    await expect(page.getByText("Left out: 29 family, private, pet or abandoned cemeteries.")).toBeVisible();
    await expect(page.getByText("Hightower")).toHaveCount(0);

    // Widen to 50 km (the cap): the deck is asked again with radius=50.
    await page.getByRole("button", { name: "Look within 50 km" }).click();
    await expect(page).toHaveURL(/r=50/);
    await expect(topName(page)).toHaveText("Oakland Cemetery");
    expect(urls.at(-1)).toMatch(/radius=50$/);
  });

  test("the full Oakland profile reads from real data, and a sparse card still says something", async ({ page }) => {
    await setup(page);
    await page.goto(ATLANTA);
    const card = topCard(page);
    await expect(card).toContainText("Atlanta · 200 m away");
    await expect(card).toContainText("Public cemetery · check its hours before you go.");
    await expect(card).toContainText("Est. 1850 · 176 years old");
    await expect(card).toContainText("48 acres");
    await expect(card).toContainText("Verified");
    await expect(card).toContainText("National Register of Historic Places listed place");
    await expect(card).toContainText("114 notable people buried here");
    await expect(card).toContainText("Margaret Mitchell · d. 1949");
    await expect(card).toContainText(
      "Oakland Cemetery is one of the largest cemetery green spaces in Atlanta, Georgia, U.S. Founded as Atlanta Cemetery in 1850",
    );
    await expect(card.getByRole("link", { name: "Wikipedia" })).toHaveAttribute("href", OAKLAND.bio.url);
    await expect(card.getByRole("link", { name: "CC BY-SA 4.0" })).toBeVisible();
    // The third sentence waits for the full profile.
    await expect(card).not.toContainText("By that time");
    // No photo reachable → the drawn placeholder, never a broken image.
    await expect(card.locator(".g-photo svg")).toBeVisible();
    await expect(card.locator(".g-photo img")).toHaveCount(0);

    await card.getByRole("button", { name: "Full profile" }).click();
    await expect(card).toContainText("By that time");
    await expect(card.getByRole("link", { name: "See it on Find a Grave" })).toHaveAttribute(
      "href",
      "https://www.findagrave.com/cemetery/35955",
    );

    // Westview: Herman Cain died in 2020, so only his name shows (respect rule).
    await card.focus();
    await page.keyboard.press("ArrowLeft");
    await expect(topName(page)).toHaveText("Westview Cemetery");
    await expect(topCard(page).getByRole("listitem").filter({ hasText: "Herman Cain" })).toHaveText("Herman Cain");

    await topCard(page).focus();
    await page.keyboard.press("ArrowLeft");
    await expect(topName(page)).toHaveText("All Saints Episcopal Church Cemetery");
    await expect(topCard(page)).toContainText("No notable burials on record yet.");
    await expect(topCard(page)).toContainText("Wikidata knows its name and where it is");
  });

  test("dragging right saves and shows the match screen", async ({ page }) => {
    await setup(page);
    await page.goto(ATLANTA);
    await expect(topName(page)).toHaveText("Oakland Cemetery");
    await drag(page, 0.6);

    const dialog = page.getByRole("dialog", { name: /It.s a match/ });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Oakland Cemetery is 200 m away. Check its hours before you go.");
    await expect(dialog.getByRole("link", { name: "Start a tour here" })).toHaveAttribute("href", "/cemetery/Q2008469");
    await expect(dialog.getByRole("button", { name: "Keep swiping" })).toBeFocused();
    await expect(announcer(page)).toHaveText("Saved Oakland Cemetery. It's a match.");
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("btt-gravitator-saved") ?? "[]"));
    expect(saved.map((s: { qid: string }) => s.qid)).toEqual(["Q2008469"]);

    await dialog.getByRole("button", { name: "Keep swiping" }).click();
    await expect(dialog).toBeHidden();
    await expect(topName(page)).toHaveText("Westview Cemetery");
    await expect(topCard(page)).toBeFocused();
  });

  test("a short drag snaps back and decides nothing", async ({ page }) => {
    await setup(page);
    await page.goto(ATLANTA);
    await drag(page, 0.12);
    await expect(topName(page)).toHaveText("Oakland Cemetery");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("keyboard: ← passes, → saves, Esc keeps swiping", async ({ page }) => {
    await setup(page);
    await page.goto(ATLANTA);
    await topCard(page).focus();
    await page.keyboard.press("ArrowLeft");
    await expect(topName(page)).toHaveText("Westview Cemetery");
    await expect(topCard(page)).toBeFocused();

    await page.keyboard.press("ArrowRight");
    const dialog = page.getByRole("dialog", { name: /It.s a match/ });
    await expect(dialog).toContainText("Westview Cemetery");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(topName(page)).toHaveText("All Saints Episcopal Church Cemetery");
    await expect(topCard(page)).toBeFocused();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("btt-gravitator-saved") ?? "[]"));
    expect(saved.map((s: { qid: string }) => s.qid)).toEqual(["Q7989746"]);
  });

  test("Go now opens the cemetery's tour", async ({ page }) => {
    await setup(page);
    await page.goto(ATLANTA);
    await page.getByRole("link", { name: "Go now" }).click();
    await expect(page).toHaveURL(/\/cemetery\/Q2008469$/);
  });

  test("Enter on the card also goes now", async ({ page }) => {
    await setup(page);
    await page.goto(ATLANTA);
    await topCard(page).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/cemetery\/Q2008469$/);
  });

  test("saved graveyards persist across reloads, and Remove sticks", async ({ page }) => {
    await setup(page);
    await page.goto(ATLANTA);
    await page.getByRole("button", { name: "Save" }).click();
    await page.getByRole("button", { name: "Keep swiping" }).click();
    await expect(page.getByRole("link", { name: "Your graveyards (1)" })).toBeVisible();

    await page.goto("/gravitator/saved");
    await expect(page.getByRole("heading", { name: "Your graveyards", level: 1 })).toBeVisible();
    const item = page.locator('li[data-qid="Q2008469"]');
    await expect(item).toContainText("Oakland Cemetery");
    await page.reload();
    await expect(item).toContainText("Oakland Cemetery");
    await expect(item.getByRole("link", { name: "Go now" })).toHaveAttribute("href", "/cemetery/Q2008469");

    await item.getByRole("button", { name: "Remove Oakland Cemetery" }).click();
    await expect(page.getByText("Nothing saved yet.")).toBeVisible();
    await page.reload();
    await expect(page.getByText("Nothing saved yet.")).toBeVisible();

    // A saved cemetery doesn't come round again in the deck.
    await page.goto(ATLANTA);
    await page.getByRole("button", { name: "Save" }).click();
    await page.getByRole("button", { name: "Keep swiping" }).click();
    await page.reload();
    await expect(topName(page)).toHaveText("Westview Cemetery");
  });

  test("reduced motion: no rotation, no fling, just a fade", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await setup(page);
    await page.goto(ATLANTA);
    const card = topCard(page);

    // Mid-drag: the card may follow the finger but never tilts.
    await drag(page, 0.2, { release: false });
    const midDrag = await card.evaluate((el) => getComputedStyle(el).transform);
    const m = midDrag.match(/^matrix\(([^)]+)\)$/);
    expect(m, midDrag).not.toBeNull();
    const [a, b, c, d] = m![1].split(",").map(Number);
    expect([a, b, c, d]).toEqual([1, 0, 0, 1]);
    await page.mouse.up();

    await card.focus();
    await page.keyboard.press("ArrowRight");
    const leaving = await card.evaluate((el) => ({
      fade: el.classList.contains("g-card-fade"),
      transform: getComputedStyle(el).transform,
      transitionProperty: getComputedStyle(el).transitionProperty,
      animated: document
        .getAnimations()
        .map((x) => (x as CSSTransition).transitionProperty ?? (x as CSSAnimation).animationName ?? ""),
    }));
    expect(leaving.fade).toBe(true);
    expect(leaving.transform).toBe("none");
    expect(leaving.transitionProperty).toBe("opacity");
    expect(leaving.animated).not.toContain("transform");
    await expect(page.getByRole("dialog", { name: /It.s a match/ })).toBeVisible();
    // The match glow doesn't pulse either.
    const glow = await page.locator(".g-match-portrait").evaluate((el) => getComputedStyle(el).animationName);
    expect(glow).toBe("none");
  });

  test("with full motion the card flings with a transform transition (the check above isn't vacuous)", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await setup(page);
    await page.goto(ATLANTA);
    await topCard(page).focus();
    await page.keyboard.press("ArrowLeft");
    const leaving = await topCard(page).evaluate((el) => ({
      transitionProperty: getComputedStyle(el).transitionProperty,
      transform: el.style.transform,
    }));
    expect(leaving.transitionProperty).toContain("transform");
    expect(leaving.transform).toMatch(/rotate\(-22deg\)/);
  });

  test("a failed deck names Wikidata and shows no empty deck; Try again recovers", async ({ page }) => {
    await setup(page, { error: { source: "Wikidata", message: "Couldn't reach Wikidata. Try again in a minute." } }, 502);
    await page.goto(ATLANTA);
    await expect(page.locator(".gravitator").getByRole("alert")).toContainText(
      "Couldn't reach Wikidata. Try again in a minute.",
    );
    await expect(topCard(page)).toHaveCount(0);
    await expect(page.getByText("That's every public cemetery")).toHaveCount(0);

    await page.unroute("**/api/gravitator?**");
    await page.route("**/api/gravitator?**", (route) => route.fulfill({ json: DECK }));
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(topName(page)).toHaveText("Oakland Cemetery");
  });

  test("no CSP violations on the deck, the drag and the match screen", async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __csp: string[] };
      w.__csp = [];
      document.addEventListener("securitypolicyviolation", (e) => w.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
    });
    await setup(page);
    await page.goto(ATLANTA);
    await expect(topName(page)).toHaveText("Oakland Cemetery");
    await drag(page, 0.6);
    await expect(page.getByRole("dialog", { name: /It.s a match/ })).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp)).toEqual([]);
  });

  test("the real API refuses a bad query without asking Wikidata", async ({ request }) => {
    const res = await request.get("/api/gravitator?lat=abc&lon=1");
    expect(res.status()).toBe(400);
    expect((await res.json()).error.source).toBe("request");
  });
});
