// Data integrity (wrap: K1, K14, red-team P0-2). Live Wikidata through the app,
// against a local production server:
//   pnpm build && NODE_USE_ENV_PROXY=1 pnpm start -p 3105
//   BASE_URL=http://localhost:3105 pnpm exec playwright test tests/e2e/data-integrity.spec.ts
//
// K1: only a cemetery (Wikidata class Q39614 or a subclass, the class search
// and /near filter on) opens as one. Douglas Adams (Q42) and the mausoleums of
// Mao (Q1154819) and Lenin (Q191414) must not become a tour, a haunt, a
// spirit box word bank or a named share card.
// K14: a name Wikidata keeps only in "mul" shows as that name, never a QID.
import { expect, test, type APIRequestContext } from "@playwright/test";

const PERSON = "Q42"; // Douglas Adams: a human, no burials, label only in "mul"
const MAO_MAUSOLEUM = "Q1154819"; // a mausoleum with one burial; not a cemetery
const LENIN_MAUSOLEUM = "Q191414"; // a mausoleum; Lenin died in 1924, old enough for the spirit box's word bank
const MAO = "Q5816";
const NO_SUCH_ITEM = "Q999999999999"; // no item: the unnamed room card for sure
const MUL_ONLY = { qid: "Q4946285", name: "Boroondara General Cemetery" }; // only a "mul" label on Wikidata (checked 10/22)
const ROOM = "KXMPRT";
const SLACKBOT = "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)";
/** Words that would name the mausoleum or the man buried there. */
const MAO_WORDS = /\bmao\b|zedong|mausoleum|chairman/i;

test.beforeEach(async ({ context }) => {
  // Skip the first-run etiquette card's storage write noise; the haunt key stays untouched.
  await context.addInitScript(() => {
    try {
      localStorage.setItem("btt-etiquette-seen", "1");
    } catch {
      // Storage blocked: tests that read the haunt fail loudly.
    }
  });
});

async function png(request: APIRequestContext, path: string): Promise<{ status: number; card: string | undefined; bytes: Buffer }> {
  const res = await request.get(path);
  return { status: res.status(), card: res.headers()["x-share-card"], bytes: await res.body() };
}

test.describe("only a cemetery opens as one (K1)", () => {
  test("the burials API answers 404 for a person", async ({ request }) => {
    const res = await request.get(`/api/cemeteries/${PERSON}/burials`);
    expect(res.status()).toBe(404);
    expect(res.headers()["content-type"]).toContain("application/json");
    const body = await res.json();
    expect(body.error.source).toBe("Wikidata");
    expect(JSON.stringify(body)).not.toContain("Douglas Adams");
  });

  test("and for a mausoleum with a burial", async ({ request }) => {
    for (const qid of [MAO_MAUSOLEUM, LENIN_MAUSOLEUM]) {
      const res = await request.get(`/api/cemeteries/${qid}/burials`);
      expect(res.status(), qid).toBe(404);
      expect(JSON.stringify(await res.json()), qid).not.toMatch(/lenin|mao zedong/i);
    }
  });

  test("/cemetery/Q42 is no tour and no haunt: it says it can't look this up and offers the way on", async ({ page }) => {
    await page.goto(`/cemetery/${PERSON}`);
    // The tour page calls notFound() for an item that isn't a cemetery, so this is the app's not-found page
    // (app/not-found.tsx: an h1 in the page header, not an alert).
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Page not found/i, { timeout: 30_000 });
    // Next adds its own robots tag when notFound() streams in, so there can be two; every one says noindex.
    const robots = await page.locator('meta[name="robots"]').evaluateAll((els) => els.map((el) => el.getAttribute("content")));
    expect(robots.length).toBeGreaterThan(0);
    for (const content of robots) expect(content).toMatch(/noindex/);
    await expect(page.getByRole("link", { name: "Find a cemetery" }).first()).toBeVisible();
    await expect(page.getByText("No tour here yet")).toHaveCount(0);
    await expect(page.getByTestId("story-card")).toHaveCount(0);
    await expect(page.locator("main")).not.toContainText("Douglas Adams");
    await expect(page.getByRole("heading", { level: 1, name: PERSON, exact: true })).toHaveCount(0);
    // Nothing made it the haunt (components/haunt/useHub.ts only runs for a loaded tour).
    await page.waitForLoadState("networkidle");
    expect(await page.evaluate(() => localStorage.getItem("btt-haunt"))).toBeNull();
  });

  test("the spirit box won't build a word bank at a mausoleum", async ({ page }) => {
    await page.goto(`/spirit?cemetery=${LENIN_MAUSOLEUM}`);
    await expect(page.getByText(/Couldn.t load the burials for this cemetery/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Start", exact: true })).toBeDisabled();
    await expect(page.locator("main")).not.toContainText(/lenin/i);
  });

  test("Gravitator cards still open as cemeteries (the deck asks for the same class)", async ({ request }) => {
    test.setTimeout(90_000);
    const deck = await request.get("/api/gravitator?lat=33.75&lon=-84.37", { timeout: 45_000 });
    expect(deck.status()).toBe(200);
    const { cards } = (await deck.json()) as { cards: { qid: string; name: string }[] };
    expect(cards.length).toBeGreaterThan(0);
    // The first two cards (Oakland leads): each one's /cemetery link must not be a 404.
    for (const card of cards.slice(0, 2)) {
      const res = await request.get(`/api/cemeteries/${card.qid}/burials`, { timeout: 40_000 });
      expect(res.status(), `${card.name} (${card.qid})`).not.toBe(404);
    }
  });
});

test.describe("share links at a place that isn't a cemetery name no one (red-team P0-2)", () => {
  for (const kind of ["seance", "party"] as const) {
    const path = `/s/${kind}/${MAO_MAUSOLEUM}/${ROOM}`;

    test(`${kind}: the page, its unfurl and its OG image are the unnamed room card`, async ({ page, request }) => {
      test.setTimeout(60_000);
      await page.goto(path);
      await expect(page.getByTestId("share-page")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("share-room-code")).toHaveText(ROOM);
      await expect(page.locator("main")).not.toContainText(MAO_WORDS);
      expect(await page.title()).not.toMatch(MAO_WORDS);
      expect(await page.title()).toMatch(kind === "seance" ? /^Séance/ : /^Graveyard party/);
      if (kind === "party") await expect(page.getByRole("link", { name: "Join the party" })).toHaveAttribute("href", `/games/bingo?party=${ROOM}`);

      // What a link preview reads: the metadata in <head>, blocking for bots.
      const html = await (await request.get(path, { headers: { "User-Agent": SLACKBOT } })).text();
      expect(html).toContain('property="og:title"');
      expect(html).not.toMatch(MAO_WORDS);

      // The OG image is drawn per card, so the unnamed card is the same picture whichever QID it came from.
      const og = await png(request, `${path}/opengraph-image`);
      const unnamed = await png(request, `/s/${kind}/${NO_SUCH_ITEM}/${ROOM}/opengraph-image`);
      expect(og.status).toBe(200);
      expect(og.card).toBe("room");
      expect(unnamed.status).toBe(200);
      expect(og.bytes.equals(unnamed.bytes), "the mausoleum's OG image is the unnamed room card").toBe(true);
    });
  }

  test("a stop or tour link there is the not-found page; link previews get a 404", async ({ page, request }) => {
    test.setTimeout(60_000);
    for (const path of [`/s/tour/${MAO_MAUSOLEUM}`, `/s/stop/${MAO_MAUSOLEUM}/${MAO}`]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: "Page not found" }), path).toBeVisible({ timeout: 30_000 });
      await expect(page.locator('meta[name="robots"][content*="noindex"]').first(), path).toBeAttached();
      await expect(page.getByTestId("share-page"), path).toHaveCount(0);
      const bot = await request.get(path, { headers: { "User-Agent": SLACKBOT } });
      expect(bot.status(), `${path} for Slackbot`).toBe(404);
      expect(await bot.text(), path).not.toMatch(/zedong|mausoleum/i);
      expect((await request.get(`${path}/opengraph-image`)).status(), `${path}/opengraph-image`).toBe(404);
    }
  });
});

test.describe('names kept only in "mul" (K14)', () => {
  test("a cemetery whose only label is mul shows its name, not its QID", async ({ page, request }) => {
    test.setTimeout(90_000);
    const res = await request.get(`/api/cemeteries/${MUL_ONLY.qid}/burials`, { timeout: 45_000 });
    expect(res.status()).toBe(200);
    const data = (await res.json()) as { cemetery: { name: string }; people: { qid: string; name: string }[] };
    expect(data.cemetery.name).toBe(MUL_ONLY.name);
    expect(data.people.length).toBeGreaterThan(0);
    expect(data.people.filter((p) => /^Q\d+$/.test(p.name)).map((p) => p.qid)).toEqual([]);

    await page.goto(`/cemetery/${MUL_ONLY.qid}`);
    await expect(page.getByRole("heading", { level: 1, name: MUL_ONLY.name })).toBeVisible({ timeout: 40_000 });
    await expect(page.getByRole("heading", { level: 1, name: MUL_ONLY.qid, exact: true })).toHaveCount(0);
    const names = await page.getByTestId("story-name").allInnerTexts();
    expect(names.length).toBeGreaterThan(0);
    expect(names.filter((n) => /^Q\d+$/.test(n.trim()))).toEqual([]);
  });
});
