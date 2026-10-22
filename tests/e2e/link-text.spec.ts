// K2 and review 4, #3: a link's ?name= and ?place= are whatever its sender
// typed. They never reach the page, the header or the stored haunt; names come
// from the samples or our own burials route. The burials route is faked here,
// so nothing depends on live Wikidata.
import { expect, test, type Page, type Route } from "@playwright/test";
import { SLEEPY_HOLLOW_HAUNT, seedHaunt } from "./fixtures/haunt";

const BAIT = "Free prize at example.com";
const SCRIPT = "<script>alert(1)</script>";
const LAKE_VIEW = "Q872253";
const bait = (qid: string) => `cemetery=${qid}&name=${encodeURIComponent(BAIT)}&place=${encodeURIComponent(SCRIPT)}`;

function seenEtiquette() {
  try {
    localStorage.setItem("btt-etiquette-seen", "1");
  } catch {
    // ignore
  }
}

const verified = (route: Route) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      cemetery: { qid: LAKE_VIEW, name: "Lake View Cemetery", locatedIn: "Seattle" },
      fetchedAt: "2026-10-20T00:00:00Z",
      sources: {},
      people: [{ qid: "Q1", name: "Doc Maynard", death: "1873-03-13T00:00:00Z", deathPrecision: 11, occupations: ["physician"] }],
    }),
  });
const down = (route: Route) =>
  route.fulfill({
    status: 503,
    contentType: "application/json",
    body: JSON.stringify({ error: { source: "Wikidata", message: "Couldn't reach Wikidata. Try again in a minute, or open a saved tour." } }),
  });

const badge = (page: Page) => page.getByRole("banner").getByRole("link", { name: /^Haunting:/ });

async function storedHaunt(page: Page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem("btt-haunt");
    return raw ? (JSON.parse(raw) as Record<string, string>) : null;
  });
}

/** Neither string anywhere a person can read it: text, titles, labels, field values, the tab title. */
async function expectNoLinkText(page: Page) {
  const seen = await page.evaluate(() => {
    const parts = [document.title, document.body.innerText];
    for (const el of document.querySelectorAll("[title], [aria-label], [alt], input, textarea")) {
      for (const a of ["title", "aria-label", "alt"]) parts.push(el.getAttribute(a) ?? "");
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) parts.push(el.value);
    }
    return parts.join("\n");
  });
  expect(seen).not.toContain("Free prize");
  expect(seen).not.toContain("example.com");
  expect(seen).not.toContain("<script>");
  expect(seen).not.toContain("alert(1)");
}

test.beforeEach(async ({ context }) => {
  await context.addInitScript(seenEtiquette);
});

test.describe("a link's ?name= is never shown or stored (K2)", () => {
  test("a stamp link: the haunt takes the name our burials route gives, not the link's", async ({ page }) => {
    await page.route(`**/api/cemeteries/${LAKE_VIEW}/burials`, verified);
    await page.goto(`/stamp?${bait(LAKE_VIEW)}`);
    await expect(page.locator("#stamp-photo")).toBeAttached();
    await expect(badge(page)).toHaveText(/Haunting:\s*Lake View Cemetery/);
    expect(await storedHaunt(page)).toMatchObject({ qid: LAKE_VIEW, name: "Lake View Cemetery", place: "Seattle" });
    await expectNoLinkText(page);
    // Home's "Your haunt" names it the same way.
    await page.goto("/");
    await expect(page.getByTestId("haunt-return")).toContainText("Lake View Cemetery");
    await expectNoLinkText(page);
  });

  test("a stamp link whose cemetery can't be looked up opens, names nothing and stores nothing", async ({ page }) => {
    await page.route(`**/api/cemeteries/${LAKE_VIEW}/burials`, down);
    // Listen before navigating: on a fast deployed build the lookup can answer before the page is checked.
    const lookedUp = page.waitForResponse(`**/api/cemeteries/${LAKE_VIEW}/burials`);
    await page.goto(`/stamp?${bait(LAKE_VIEW)}`);
    await expect(page.locator("#stamp-photo")).toBeAttached();
    await lookedUp;
    await expect(badge(page)).toHaveCount(0);
    expect(await storedHaunt(page)).toBeNull();
    await expectNoLinkText(page);
  });

  test("a sample cemetery is named from its saved copy straight away", async ({ page }) => {
    await page.goto(`/games/bingo?${bait("Q2008469")}`);
    await expect(page.getByTestId("bingo-card").getByRole("button")).toHaveCount(25);
    await expect(badge(page)).toHaveText(/Haunting:\s*Oakland Cemetery/);
    expect(await storedHaunt(page)).toMatchObject({ qid: "Q2008469", name: "Oakland Cemetery" });
    await expectNoLinkText(page);
  });

  test("a stored haunt with a name from an old link is renamed when ours arrives", async ({ page, context }) => {
    await seedHaunt(context, { qid: LAKE_VIEW, name: BAIT, place: SCRIPT });
    await page.route(`**/api/cemeteries/${LAKE_VIEW}/burials`, verified);
    await page.goto(`/stamp?cemetery=${LAKE_VIEW}`);
    await expect(badge(page)).toHaveText(/Haunting:\s*Lake View Cemetery/);
    expect(await storedHaunt(page)).toMatchObject({ qid: LAKE_VIEW, name: "Lake View Cemetery", place: "Seattle" });
    await expectNoLinkText(page);
  });

  test("the spirit box: named once its burials load; plainly when they don't", async ({ page }) => {
    await page.route(`**/api/cemeteries/${LAKE_VIEW}/burials`, verified);
    await page.goto(`/spirit?${bait(LAKE_VIEW)}`);
    await expect(page.getByRole("radio", { name: /Lake View Cemetery/ })).toBeChecked();
    await expect(badge(page)).toHaveText(/Haunting:\s*Lake View Cemetery/);
    await expectNoLinkText(page);

    await page.unroute(`**/api/cemeteries/${LAKE_VIEW}/burials`);
    await page.route("**/api/cemeteries/Q216344/burials", down);
    await page.goto(`/spirit?${bait("Q216344")}`);
    await expect(page.getByRole("radio", { name: /The cemetery in your link\s*From your link/ })).toBeChecked();
    await expect(page.getByText(/Couldn.t load the burials for this cemetery/)).toBeVisible();
    await expectNoLinkText(page);
  });

  test("the calendar and the party's séance: named from our data, never the link", async ({ page, context }) => {
    // A fresh haunt elsewhere, so the link's cemetery is only used, not adopted (F11).
    await seedHaunt(context, SLEEPY_HOLLOW_HAUNT);
    await page.route(`**/api/cemeteries/${LAKE_VIEW}/burials`, verified);
    await page.route(`**/api/calendar/${LAKE_VIEW}*`, (route) =>
      route.fulfill({ status: 200, contentType: "text/calendar; charset=utf-8", body: "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n" }),
    );
    await page.goto(`/calendar?${bait(LAKE_VIEW)}`);
    await expect(page.getByRole("radio", { name: /Lake View Cemetery/ })).toBeChecked();
    await expect(badge(page)).toHaveText(/Haunting:\s*Sleepy Hollow Cemetery/);
    await expectNoLinkText(page);
    // Picking writes only an ID into the address.
    await page.getByRole("radio", { name: /Oakland Cemetery/ }).check();
    await expect(page).toHaveURL(/\/calendar\?cemetery=Q2008469$/);

    await page.goto(`/games/party?${bait(LAKE_VIEW)}`);
    await expect(page.getByRole("radio", { name: /Lake View Cemetery\s*From your link/ })).toBeChecked();
    await expectNoLinkText(page);
  });

  test("the Gravitator names only its own sample places from ?near= (P1-1)", async ({ page }) => {
    await page.route("**/api/gravitator**", (route) =>
      route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { source: "Wikidata", message: "Couldn't reach Wikidata. Try again in a minute." } }) }),
    );
    await page.goto(`/gravitator?lat=33.7486&lon=-84.3733&near=${encodeURIComponent(BAIT)}`);
    await expect(page.getByText(/^Near the place in your link · within 25 km$/)).toBeVisible();
    await expectNoLinkText(page);
    // Our own label at its own point still reads as before.
    await page.goto("/gravitator?lat=33.7486&lon=-84.3733&near=Atlanta");
    await expect(page.getByText(/^Near Atlanta · within 25 km$/)).toBeVisible();
    // Our label at someone else's point isn't trusted either.
    await page.goto("/gravitator?lat=10&lon=10&near=Atlanta");
    await expect(page.getByText(/^Near the place in your link · within 25 km$/)).toBeVisible();
  });

  test("before our lookup answers, the calendar says “the cemetery in your link”", async ({ page }) => {
    await page.route(`**/api/cemeteries/${LAKE_VIEW}/burials`, down);
    await page.route(`**/api/calendar/${LAKE_VIEW}*`, (route) =>
      route.fulfill({ status: 200, contentType: "text/calendar; charset=utf-8", body: "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n" }),
    );
    await page.goto(`/calendar?${bait(LAKE_VIEW)}`);
    await expect(page.getByRole("radio", { name: /The cemetery in your link/ })).toBeChecked();
    await expectNoLinkText(page);
  });
});
