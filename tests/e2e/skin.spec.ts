import { expect, test, type Page } from "@playwright/test";
import { OAKLAND_HAUNT, SLEEPY_HOLLOW_HAUNT, seedHaunt } from "./fixtures/haunt";

// L10.4 part A: the instrument panel (spirit box, séance), the headstone story
// card, the one-line header, the doors above the fold, and the sunlight palette.

function seenEtiquette() {
  try {
    localStorage.setItem("btt-etiquette-seen", "1");
  } catch {
    // ignore
  }
}

function stubSpeech() {
  const synth = {
    speaking: false,
    pending: false,
    paused: false,
    onvoiceschanged: null,
    speak() {},
    cancel() {},
    pause() {},
    resume() {},
    getVoices: () => [],
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => true,
  };
  Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true });
}

const panel = (page: Page) => page.locator('section[aria-label="Controls"]');

/** Before reading boxes: every web font swapped in, then two frames of layout. */
async function settle(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
}

test.beforeEach(async ({ context }) => {
  await context.addInitScript(seenEtiquette);
  // The saved copies, so these never depend on live Wikidata.
  await context.route("**/api/cemeteries/*/burials", (route) => route.fulfill({ status: 404, body: "not found" }));
});

test.describe("the instrument panel", () => {
  test("the spirit box is one panel: readouts, dial, the word, controls, captions and the mourners line", async ({ page, context }) => {
    await seedHaunt(context, OAKLAND_HAUNT);
    await context.addInitScript(stubSpeech);
    await page.goto("/spirit?test-caps=short");
    await expect(page.getByText(/people buried at Oakland Cemetery died 75 or more years ago/)).toBeVisible();
    const p = panel(page);
    await expect(p).toHaveClass(/\binstrument\b/);
    const readouts = p.getByTestId("readouts");
    await expect(readouts).toHaveAttribute("aria-hidden", "true");
    // One line (REVIEW-3 #7): the status first, then at most two values.
    await expect(readouts.locator(".readout").first()).toHaveText("Standby");
    await expect(readouts).toContainText("Voices 0/3");
    expect(await readouts.locator(".readout").count()).toBeLessThanOrEqual(3);
    expect((await readouts.boundingBox())!.height).toBeLessThan(44);
    await expect(readouts.locator(".readout").first()).toHaveCSS("font-family", /Michroma/);
    const dial = p.getByTestId("dial");
    await expect(dial).toHaveAttribute("data-running", "false");
    // Captions and "Turn it off near mourners." live inside the panel now.
    await expect(p.getByRole("log", { name: "Captions" })).toBeVisible();
    await expect(p.getByText("Turn it off near mourners.")).toBeVisible();
    await expect(p.getByText("The spirits use your phone’s text-to-speech.")).toBeVisible();
    // Dial-style knobs (28 px thumbs, from the .knob rules).
    for (const r of await p.locator('input[type="range"]').all()) await expect(r).toHaveClass(/\bknob\b/);

    await p.getByRole("button", { name: "Start", exact: true }).click();
    await expect(dial).toHaveAttribute("data-running", "true");
    // The needle steps with the sweep: 12 steps of the interval, CSS only.
    const anim = await dial.locator(".dial-needle").evaluate((el) => getComputedStyle(el).animationName);
    expect(anim).toBe("btt-needle");
    await expect(p.getByTestId("spirit-latest")).toHaveText(/…\S.*…/, { timeout: 10_000 });
    await expect(p.getByTestId("spirit-latest")).toHaveCSS("font-family", /IM Fell|Fell/i);
    await expect(p.getByText(/Session over: 3 voices is the limit/)).toBeVisible({ timeout: 10_000 });
    await expect(readouts).toContainText("Voices 3/3");
    await expect(dial).toHaveAttribute("data-running", "false");
  });

  test("under reduced motion the needle doesn't move", async ({ page, context }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await seedHaunt(context, OAKLAND_HAUNT);
    await context.addInitScript(stubSpeech);
    await page.goto("/spirit?test-caps=short");
    await panel(page).getByRole("button", { name: "Start", exact: true }).click();
    await expect(panel(page).getByTestId("dial")).toHaveAttribute("data-running", "true");
    expect(await panel(page).locator(".dial-needle").evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
  });

  test("the séance wears the same panel, with room and clock readouts", async ({ page }) => {
    await page.goto("/spirit?seance=KXMPRT&cemetery=Q2008469");
    await expect(page.getByText(/Clock set from the server|Using this phone/)).toBeVisible();
    const p = panel(page);
    await expect(p).toHaveClass(/\binstrument\b/);
    // The room code is the big split-flap at the top of the panel; the strip stays one line (REVIEW-3 #5, #7).
    await expect(p.getByTestId("seance-room-code")).toHaveText("KXMPRT");
    const readouts = p.getByTestId("readouts");
    await expect(readouts).toContainText(/Clock ±\d+ ms|Phone clock/);
    expect((await readouts.boundingBox())!.height).toBeLessThan(44);
    await expect(p.getByRole("log", { name: "Captions" })).toBeVisible();
    await expect(p.getByText("Turn it off near mourners.")).toBeVisible();
    await expect(p.getByRole("button", { name: "Join the séance" })).toBeVisible();
  });

  test("after starting a séance, opening it is the primary action; starting another is secondary", async ({ page, context }) => {
    await seedHaunt(context, OAKLAND_HAUNT);
    await page.goto("/spirit");
    await page.getByRole("button", { name: "Start a séance" }).click();
    const open = page.getByRole("link", { name: "Open the séance on this phone" });
    await expect(open).toHaveClass(/\bbtn-primary\b/);
    await expect(page.getByRole("button", { name: "Start a different séance" })).toHaveClass(/\bbtn-ghost\b/);
    await expect(page.getByText(/Cemetery: Oakland Cemetery\. Anyone joining by code picks it first\./)).toBeVisible();
  });

  test("Web Share sends the séance link where the phone has it", async ({ page, context }) => {
    await seedHaunt(context, OAKLAND_HAUNT);
    await context.addInitScript(() => {
      const w = window as unknown as { __shared: unknown[] };
      w.__shared = [];
      Object.defineProperty(navigator, "share", { value: async (d: unknown) => void w.__shared.push(d), configurable: true });
    });
    await page.goto("/spirit");
    await page.getByRole("button", { name: "Start a séance" }).click();
    await page.getByRole("button", { name: "Send the link" }).click();
    const shared = await page.evaluate(() => (window as unknown as { __shared: { text: string; url: string }[] }).__shared);
    expect(shared).toHaveLength(1);
    expect(shared[0].text).toContain("Oakland Cemetery");
    expect(shared[0].url).toMatch(/\/spirit\?seance=[A-Z]{6}&cemetery=Q2008469&bank=[0-9a-f]{8}$/);
  });
});

test.describe("the story card", () => {
  test("an old grave is a headstone: arch, a death/life pair, STOP 01 / N, dates on one line, the age under them", async ({ page }) => {
    await page.goto("/cemetery/Q2008469");
    const card = page.getByTestId("story-card").first();
    await expect(card).toHaveAttribute("data-style", "carved", { timeout: 25_000 });
    await expect(card).toHaveClass(/\barch\b/);
    await expect(card).toHaveClass(/\barch-rule\b/);
    expect(await card.locator("header svg").count()).toBe(2);
    const stop = card.locator("header .label");
    await expect(stop).toHaveText(/^Stop 01 \/ \d+\s*Stop 1 of \d+$/);
    await expect(stop).toHaveCSS("font-family", /Michroma/);
    // Short months, both dates on one line, in Atkinson; the age on its own line, never stranded after a dot.
    await settle(page);
    const dates = card.locator("header p.font-bold > span").first();
    await expect(dates).toHaveText(/^[A-Z][a-z]{2} \d{1,2}, \d{4} – [A-Z][a-z]{2} \d{1,2}, \d{4}$/);
    await expect(dates).toHaveCSS("white-space", "nowrap");
    await expect(dates).toHaveCSS("font-family", /Atkinson/);
    const box = (await dates.boundingBox())!;
    expect(box.height).toBeLessThan(32);
    await expect(card.locator("header span", { hasText: /^aged \d+$/ })).toHaveCount(1);
    await expect(card).not.toContainText("· aged");
    // The chip's new name.
    await expect(page.getByText("Unusual death")).toHaveCount(0);
  });
});

test.describe("layout and sunlight", () => {
  test("the header stays one line with a haunt; a long name truncates and keeps its full title", async ({ page, context }) => {
    await seedHaunt(context, { qid: "Q999998", name: "All Saints Episcopal Church Cemetery of the Holy Comforter", place: "Atlanta" });
    await page.goto("/gravitator");
    const banner = page.getByRole("banner");
    const name = banner.getByTestId("haunt-badge").locator("span[title]");
    await expect(name).toHaveAttribute("title", "All Saints Episcopal Church Cemetery of the Holy Comforter");
    await settle(page);
    expect((await banner.boundingBox())!.height).toBeLessThanOrEqual(64);
    const word = banner.locator(".wordmark");
    if (await word.isVisible()) expect((await word.boundingBox())!.height).toBeLessThan(30);
  });

  test("both doors' buttons sit above the fold on a Pixel 7", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link").first()).toBeVisible();
    await settle(page);
    const navTop = (await page.getByRole("navigation", { name: "Main" }).boundingBox())!.y;
    const gravitator = (await page.getByRole("link", { name: "Open the Gravitator" }).boundingBox())!;
    expect(gravitator.y + gravitator.height).toBeLessThanOrEqual(navTop);
    const hauntMe = (await page.getByRole("button", { name: /^I.m here\. Haunt me\.$/ }).boundingBox())!;
    expect(hauntMe.y + hauntMe.height).toBeLessThanOrEqual(navTop);
  });

  test("nav labels are at least 13 px", async ({ page }) => {
    await page.goto("/");
    const sizes = await page
      .getByRole("navigation", { name: "Main" })
      .locator("a span")
      .evaluateAll((els) => els.map((e) => parseFloat(getComputedStyle(e).fontSize)));
    expect(sizes.length).toBeGreaterThan(0);
    for (const s of sizes) expect(s).toBeGreaterThanOrEqual(13);
  });

  test("“Make this my haunt” sits under the hub's header, above the first story", async ({ page, context }) => {
    await seedHaunt(context, SLEEPY_HOLLOW_HAUNT);
    await page.goto("/cemetery/Q2008469");
    const offer = page.getByTestId("make-haunt");
    await expect(offer).toBeVisible({ timeout: 25_000 });
    const first = page.getByTestId("story-card").first();
    await expect(first).toBeVisible();
    await settle(page);
    expect((await offer.boundingBox())!.y).toBeLessThan((await first.boundingBox())!.y);
  });

  test("/near's location button reads like home's", async ({ page }) => {
    await page.goto("/near");
    await expect(page.getByRole("button", { name: /^I.m here\. Haunt me\.$/ })).toBeVisible();
  });

  test("the sunlight palette is live", async ({ page }) => {
    await page.goto("/");
    const vars = await page.evaluate(() => {
      const s = getComputedStyle(document.documentElement);
      return ["--mauve", "--lichen", "--danger"].map((v) => s.getPropertyValue(v).trim().toUpperCase());
    });
    expect(vars).toEqual(["#D6BAE6", "#C3DBB6", "#FFB3AA"]);
  });
});
