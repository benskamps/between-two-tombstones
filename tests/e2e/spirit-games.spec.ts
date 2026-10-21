import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { seedHaunt } from "./fixtures/haunt";
import { makeCard } from "../../lib/games/bingo";

// Lane 4: spirit box, Tombstone Bingo, graveyard party (Gate 7).
//
// Headless Chromium has speechSynthesis but no voices: speak() fails with
// "synthesis-failed". Tests that check the voices replace speechSynthesis with a
// recorder (stubSpeech) that also notes which DOM event was being dispatched at
// the moment speak() ran, which shows the first call happens inside the tap.
// Web Audio does run headless, so probeAudio taps the real graph with an
// AnalyserNode to measure that the static isn't silent.

type Spoken = { text: string; pitch: number; rate: number; volume: number; event: string | null };
type AudioProbe = {
  resumeEvents: (string | null)[];
  contexts: AudioContext[];
  filters: BiquadFilterNode[];
  analysers: AnalyserNode[];
  oscillators: number;
};
type ProbeWindow = Window & { __spoken?: Spoken[]; __audio?: AudioProbe };

function seenEtiquette() {
  try {
    localStorage.setItem("btt-etiquette-seen", "1");
  } catch {
    // ignore
  }
}

function stubSpeech() {
  const w = window as unknown as ProbeWindow;
  const spoken: Spoken[] = [];
  w.__spoken = spoken;
  const synth = {
    speaking: false,
    pending: false,
    paused: false,
    onvoiceschanged: null,
    speak(u: SpeechSynthesisUtterance) {
      spoken.push({
        text: u.text,
        pitch: u.pitch,
        rate: u.rate,
        volume: u.volume,
        event: (window as unknown as { event?: Event }).event?.type ?? null,
      });
    },
    cancel() {},
    pause() {},
    resume() {},
    getVoices() {
      return [];
    },
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return true;
    },
  };
  Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true });
}

function removeSpeech() {
  Object.defineProperty(window, "speechSynthesis", { value: undefined, configurable: true });
  delete (window as unknown as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance;
}

function probeAudio() {
  const w = window as unknown as ProbeWindow;
  const probe: AudioProbe = { resumeEvents: [], contexts: [], filters: [], analysers: [], oscillators: 0 };
  w.__audio = probe;
  const resume = AudioContext.prototype.resume;
  AudioContext.prototype.resume = function (this: AudioContext) {
    probe.resumeEvents.push((window as unknown as { event?: Event }).event?.type ?? null);
    if (!probe.contexts.includes(this)) probe.contexts.push(this);
    return resume.call(this);
  };
  const createBiquadFilter = BaseAudioContext.prototype.createBiquadFilter;
  BaseAudioContext.prototype.createBiquadFilter = function (this: BaseAudioContext) {
    const f = createBiquadFilter.call(this);
    probe.filters.push(f);
    return f;
  };
  const createOscillator = BaseAudioContext.prototype.createOscillator;
  BaseAudioContext.prototype.createOscillator = function (this: BaseAudioContext) {
    probe.oscillators += 1;
    return createOscillator.call(this);
  };
  const connect = AudioNode.prototype.connect as (this: AudioNode, ...args: unknown[]) => unknown;
  (AudioNode.prototype as unknown as { connect: unknown }).connect = function (this: AudioNode, ...args: unknown[]) {
    if (args[0] instanceof AudioDestinationNode) {
      const a = this.context.createAnalyser();
      a.fftSize = 2048;
      connect.call(this, a);
      probe.analysers.push(a);
    }
    return connect.apply(this, args);
  };
}

/**
 * A suspended context freezes the analyser on its last frame, so "silent after
 * Stop" can only be measured with the audio thread still running. This keeps it
 * running and counts the app's suspend() calls instead.
 */
function keepAudioRunning() {
  const w = window as unknown as { __suspends?: number };
  w.__suspends = 0;
  AudioContext.prototype.suspend = function () {
    w.__suspends = (w.__suspends ?? 0) + 1;
    return Promise.resolve();
  };
}

async function peakRms(page: Page, samples = 10): Promise<number> {
  return page.evaluate(async (n) => {
    const a = (window as unknown as ProbeWindow).__audio!.analysers.at(-1)!;
    const buf = new Float32Array(a.fftSize);
    let peak = 0;
    for (let i = 0; i < n; i++) {
      a.getFloatTimeDomainData(buf);
      let sum = 0;
      for (const x of buf) sum += x * x;
      peak = Math.max(peak, Math.sqrt(sum / buf.length));
      await new Promise((r) => setTimeout(r, 50));
    }
    return peak;
  }, samples);
}

/** How many distinct band-pass centre frequencies we see over `ms`. */
async function distinctBands(page: Page, ms: number): Promise<number> {
  return page.evaluate(async (duration) => {
    const f = (window as unknown as ProbeWindow).__audio!.filters.at(-1)!;
    const seen = new Set<number>();
    const end = performance.now() + duration;
    while (performance.now() < end) {
      seen.add(Math.round(f.frequency.value));
      await new Promise((r) => setTimeout(r, 20));
    }
    return seen.size;
  }, ms);
}

async function captions(page: Page): Promise<string[]> {
  // Newest first on screen; return oldest first.
  const items = await page.getByRole("log", { name: "Captions" }).getByRole("listitem").allInnerTexts();
  return items.map((t) => t.split("\n").pop()!.trim()).reverse();
}

const DISCLAIMER = /The spirits use your phone.s text-to-speech\./;


// Chromium's fake microphone for the EVP tests: a real MediaStream that beeps,
// with no permission prompt. Has no effect on pages that don't ask for the mic.
test.use({
  launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
});

test.describe("spirit box", () => {
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(seenEtiquette);
    await seedHaunt(context);
  });

  test("starts from the tap, speaks inside it, logs every voice, and stops itself at the voice cap", async ({
    page,
  }) => {
    await page.addInitScript(stubSpeech);
    await page.addInitScript(probeAudio);
    // Force the burials route to fail so the test doesn't depend on live
    // Wikidata: the saved copy is used, and the page says so.
    await page.route("**/api/cemeteries/*/burials", (route) =>
      route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: { source: "Wikidata", message: "test outage" } }) }),
    );
    await page.goto("/spirit?test-caps=short");

    await expect(page.getByText(/people buried at Oakland Cemetery died 75 or more years ago/)).toBeVisible();
    await expect(page.getByText(/uses the copy saved with the app/)).toBeVisible();
    await expect(page.getByText(DISCLAIMER).first()).toBeVisible();
    await expect(page.getByText("Turn it off near mourners.").first()).toBeVisible();
    await expect(page.getByText(/Test caps are on/)).toBeVisible();

    await page.getByRole("button", { name: "Start", exact: true }).click();
    await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();

    await expect(page.getByText(/Session over: 3 voices is the limit/)).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("button", { name: "Start", exact: true })).toBeVisible();

    const spoken = await page.evaluate(() => (window as unknown as ProbeWindow).__spoken!);
    const audio = await page.evaluate(() => {
      const a = (window as unknown as ProbeWindow).__audio!;
      return { resumeEvents: a.resumeEvents, state: a.contexts[0]?.state, filters: a.filters.length };
    });
    expect(spoken).toHaveLength(3);
    // iOS: the first speak() and the AudioContext resume() both ran inside the click handler.
    expect(spoken[0].event).toBe("click");
    expect(audio.resumeEvents[0]).toBe("click");
    for (const s of spoken) {
      expect(s.pitch).toBeGreaterThanOrEqual(0.1);
      expect(s.pitch).toBeLessThanOrEqual(0.4);
      expect(s.rate).toBeGreaterThanOrEqual(0.55);
      expect(s.rate).toBeLessThanOrEqual(0.8);
      expect(s.text.split(/\s+/).length).toBeLessThanOrEqual(3);
    }
    // Every voice is captioned, in order.
    expect(await captions(page)).toEqual(spoken.map((s) => s.text));
    // After the stop: audio suspended, nothing more spoken or captioned.
    expect(audio.state).toBe("suspended");
    await page.waitForTimeout(1500);
    expect(await page.evaluate(() => (window as unknown as ProbeWindow).__spoken!.length)).toBe(3);
    expect(await captions(page)).toHaveLength(3);
  });

  test("plays non-silent static whose band-pass steps faster with the sweep slider, silent after Stop", async ({
    page,
  }) => {
    await page.addInitScript(stubSpeech);
    await page.addInitScript(probeAudio);
    await page.addInitScript(keepAudioRunning);
    await page.goto("/spirit");
    await expect(page.getByText(/people buried at Oakland Cemetery/)).toBeVisible();

    await page.getByLabel(/Sweep: every/).fill("350");
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();

    const rms = await peakRms(page);
    const slow = await distinctBands(page, 1400);
    await page.getByLabel(/Sweep: every/).fill("50");
    await expect(page.getByText("Sweep: every 50 ms")).toBeVisible();
    const fast = await distinctBands(page, 1400);
    const blips = await page.evaluate(() => (window as unknown as ProbeWindow).__audio!.oscillators);

    await page.getByRole("button", { name: "Stop" }).click();
    await expect(page.getByText("Stopped.", { exact: true })).toBeVisible();
    await page.waitForTimeout(200);
    const after = await peakRms(page, 6);
    const suspends = await page.evaluate(() => (window as unknown as { __suspends?: number }).__suspends ?? 0);

    console.log(
      `static rms=${rms.toFixed(4)} bands@350ms=${slow} bands@50ms=${fast} blips=${blips} rmsAfterStop=${after.toFixed(4)} suspends=${suspends}`,
    );
    expect(rms).toBeGreaterThan(0.01);
    expect(slow).toBeGreaterThanOrEqual(2);
    expect(fast).toBeGreaterThan(slow * 2);
    expect(after).toBeLessThan(0.0005);
    expect(suspends).toBe(1);
  });

  test("stops itself at the time cap", async ({ page }) => {
    await page.addInitScript(stubSpeech);
    await page.goto("/spirit?test-caps=time");
    await expect(page.getByText(/people buried at Oakland Cemetery/)).toBeVisible();
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await expect(page.getByText(/Session over: time.s up after 4 seconds/)).toBeVisible({ timeout: 10000 });
    const n = (await captions(page)).length;
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThan(60);
  });

  test("stops when the page is hidden", async ({ page }) => {
    await page.addInitScript(stubSpeech);
    await page.goto("/spirit");
    await expect(page.getByText(/people buried at Oakland Cemetery/)).toBeVisible();
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(page.getByText("Stopped because you left the page.")).toBeVisible();
    const n = await page.evaluate(() => (window as unknown as ProbeWindow).__spoken!.length);
    await page.waitForTimeout(4000);
    expect(await page.evaluate(() => (window as unknown as ProbeWindow).__spoken!.length)).toBe(n);
  });

  test("keeps going when the speech engine fails (real headless speechSynthesis, no stub)", async ({ page }) => {
    // Headless Chromium: speechSynthesis exists, has no voices, and every speak() errors.
    await page.goto("/spirit?test-caps=short");
    await expect(page.getByText(/people buried at Oakland Cemetery/)).toBeVisible();
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await expect(page.getByText(/Session over: 3 voices/)).toBeVisible({ timeout: 10000 });
    expect(await captions(page)).toHaveLength(3);
  });

  test("runs with captions only, and says so, when the browser can't speak", async ({ page }) => {
    await page.addInitScript(removeSpeech);
    await page.goto("/spirit?test-caps=short");
    await expect(page.getByText(/Your browser can.t speak, so the voices appear as captions\./)).toBeVisible();
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await expect(page.getByText(/Session over: 3 voices/)).toBeVisible({ timeout: 10000 });
    expect(await captions(page)).toHaveLength(3);
  });

  test("speaks only names of people who died 75+ years ago, from the burials route", async ({ page }) => {
    await page.addInitScript(stubSpeech);
    await page.route("**/api/cemeteries/*/burials", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          cemetery: { qid: "Q999999", name: "Test Hill Cemetery" },
          fetchedAt: "2026-10-20T00:00:00Z",
          sources: {},
          people: [
            { qid: "Q1", name: "Eleanor Oldfield", death: "1899-03-01T00:00:00Z", deathPrecision: 11, occupations: ["lighthouse keeper"] },
            { qid: "Q2", name: "Zebulon Recentperson", death: "1990-06-01T00:00:00Z", deathPrecision: 11, occupations: ["astronaut"] },
            { qid: "Q3", name: "Ophelia Borderline", death: "1952-01-01T00:00:00Z", deathPrecision: 11, occupations: ["typesetter"] },
          ],
        }),
      }),
    );
    await page.goto("/spirit?cemetery=Q999999&test-caps=short");
    await expect(page.getByLabel(/The cemetery from your last tour/)).toBeChecked();
    await expect(page.getByText("Test Hill Cemetery", { exact: true })).toBeVisible();
    await expect(page.getByText(/1 person buried at Test Hill Cemetery died 75 or more years ago/)).toBeVisible();
    await expect(page.getByText(/2 more recent or undated burials are left out/)).toBeVisible();
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await expect(page.getByText(/Session over: 3 voices/)).toBeVisible({ timeout: 10000 });
    const said = [...(await captions(page)), ...(await page.evaluate(() => (window as unknown as ProbeWindow).__spoken!.map((s) => s.text)))];
    for (const t of said) expect(t).not.toMatch(/zebulon|recentperson|astronaut|ophelia|borderline|typesetter|nineteen/i);
  });

  test("names the failure for a tour cemetery when the burials route is down", async ({ page }) => {
    await page.route("**/api/cemeteries/*/burials", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: { source: "Wikidata", message: "Couldn't reach Wikidata." } }),
      }),
    );
    await page.goto("/spirit?cemetery=Q999999");
    await expect(page.getByText(/Couldn.t load the burials for this cemetery: Wikidata: Couldn.t reach Wikidata\./)).toBeVisible();
    await expect(page.getByRole("button", { name: "Start", exact: true })).toBeDisabled();
    // The samples still work.
    await page.getByLabel(/Sleepy Hollow Cemetery/).check();
    await expect(page.getByText(/people buried at Sleepy Hollow Cemetery died 75 or more years ago/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Start", exact: true })).toBeEnabled();
  });
});

async function cardSymbols(page: Page): Promise<string[]> {
  const cells = page.getByTestId("bingo-card").getByRole("button");
  await expect(cells).toHaveCount(25);
  return cells.evaluateAll((els) => els.map((e) => e.getAttribute("data-symbol") ?? ""));
}

async function newContext(browser: import("@playwright/test").Browser, baseURL: string | undefined): Promise<BrowserContext> {
  const ctx = await browser.newContext({ baseURL });
  await ctx.addInitScript(seenEtiquette);
  return ctx;
}

test.describe("tombstone bingo", () => {
  test("a party code gives the same card in two browsers, matching the seeded generator", async ({ browser, baseURL }) => {
    const [a, b] = await Promise.all([newContext(browser, baseURL), newContext(browser, baseURL)]);
    const [pa, pb] = await Promise.all([a.newPage(), b.newPage()]);
    await Promise.all([pa.goto("/games/bingo?party=KXMPRT"), pb.goto("/games/bingo?party=kxm-prt")]);
    const [ca, cb] = await Promise.all([cardSymbols(pa), cardSymbols(pb)]);
    expect(ca).toEqual(cb);
    expect(ca).toEqual(makeCard("party:KXMPRT"));
    expect(ca[12]).toBe("rip");
    expect(new Set(ca).size).toBe(25);
    await expect(pa.getByText(/Party KXMPRT\./)).toBeVisible();
    await Promise.all([a.close(), b.close()]);
  });

  test("solo players get their own card, kept across reloads", async ({ browser, baseURL }) => {
    const [a, b] = await Promise.all([newContext(browser, baseURL), newContext(browser, baseURL)]);
    // Solo bingo (no party link) opens once you have a haunt.
    await Promise.all([seedHaunt(a), seedHaunt(b)]);
    const [pa, pb] = await Promise.all([a.newPage(), b.newPage()]);
    await Promise.all([pa.goto("/games/bingo"), pb.goto("/games/bingo")]);
    const first = await cardSymbols(pa);
    expect(await cardSymbols(pb)).not.toEqual(first);
    await pa.reload();
    expect(await cardSymbols(pa)).toEqual(first);
    await pa.getByRole("button", { name: "New card" }).click();
    await expect.poll(() => cardSymbols(pa)).not.toEqual(first);
    await Promise.all([a.close(), b.close()]);
  });

  test("tapping marks a square, shows its meaning, detects a bingo, and survives a reload", async ({ page }) => {
    await page.addInitScript(seenEtiquette);
    await page.goto("/games/bingo?party=KXMPRT");
    const cells = page.getByTestId("bingo-card").getByRole("button");
    await expect(cells).toHaveCount(25);
    await expect(cells.nth(12)).toHaveText("R.I.P.");
    await expect(cells.nth(12)).toHaveAttribute("aria-pressed", "true");

    const card = makeCard("party:KXMPRT");
    await cells.nth(10).click();
    await expect(cells.nth(10)).toHaveAttribute("aria-pressed", "true");
    const meaningPanel = page.locator("[aria-live=polite]").filter({ hasText: "Marked." });
    await expect(meaningPanel).toBeVisible();
    expect(card[10]).toBeTruthy();

    // Row 3 = squares 10–14; 12 is the free centre.
    await expect(page.getByText(/^Bingo!/)).toHaveCount(0);
    for (const i of [11, 13]) await cells.nth(i).click();
    await expect(page.getByText(/^Bingo!/)).toHaveCount(0);
    await cells.nth(14).click();
    await expect(page.getByText("Bingo! You completed row 3.")).toBeVisible();

    await page.reload();
    await expect(page.getByText("Bingo! You completed row 3.")).toBeVisible();
    for (const i of [10, 11, 13, 14]) await expect(cells.nth(i)).toHaveAttribute("aria-pressed", "true");

    await cells.nth(14).click(); // unmark
    await expect(page.getByText(/^Bingo!/)).toHaveCount(0);
  });
});

test.describe("graveyard party", () => {
  test("Gate 7: a second browser opens the party link and sees the same card within 10 s", async ({
    browser,
    baseURL,
  }) => {
    const [a, b, c] = await Promise.all([
      newContext(browser, baseURL),
      newContext(browser, baseURL),
      newContext(browser, baseURL),
    ]);
    await a.grantPermissions(["clipboard-read", "clipboard-write"]);
    // The host and the code-typer have a haunt (the party lobby needs one); b, who only opens the link, has none.
    await Promise.all([seedHaunt(a), seedHaunt(c)]);
    const pa = await a.newPage();
    await pa.goto("/games/party");
    await pa.getByRole("button", { name: "Start a party" }).click();

    const code = (await pa.getByTestId("room-code").textContent())!.trim();
    expect(code).toMatch(/^[A-HJKMNP-Z]{6}$/);
    const origin = new URL(baseURL!).origin;
    const link = await pa.getByTestId("party-link").inputValue();
    // The invite is the party's share page (L5.2) at the host's haunt: it unfurls with the room-code card.
    expect(link).toBe(`${origin}/s/party/Q2008469/${code}`);

    await pa.getByRole("button", { name: "Copy link" }).click();
    await expect(pa.getByText("Link copied.")).toBeVisible();
    expect(await pa.evaluate(() => navigator.clipboard.readText())).toBe(link);

    await pa.getByRole("link", { name: "Open the party card" }).click();
    await expect(pa).toHaveURL(`${origin}/games/bingo?party=${code}`);
    const cardA = await cardSymbols(pa);

    // The second browser opens the link as sent and taps its one button; the 10 s include that tap.
    const started = Date.now();
    const pb = await b.newPage();
    await pb.goto(link);
    await pb.getByRole("link", { name: "Join the party" }).click();
    await expect(pb.getByTestId("bingo-card").getByRole("button")).toHaveCount(25, { timeout: 10000 });
    const cardB = await cardSymbols(pb);
    const elapsed = Date.now() - started;
    console.log(`Gate 7: room ${code}, second browser had the card in ${elapsed} ms`);
    expect(elapsed).toBeLessThan(10000);
    expect(cardB).toEqual(cardA);
    await expect(pb.getByText(`Party ${code}.`)).toBeVisible();

    // Joining by typing the room code lands on the same card too.
    const pc = await c.newPage();
    await pc.goto("/games/party");
    await pc.getByLabel("Room code").fill(code.toLowerCase().replace(/(...)/, "$1-"));
    await pc.getByRole("button", { name: "Join" }).click();
    await expect(pc).toHaveURL(new RegExp(`/games/bingo\\?party=${code}$`));
    expect(await cardSymbols(pc)).toEqual(cardA);

    await Promise.all([a.close(), b.close(), c.close()]);
  });

  test("rejects a mistyped room code with a clear message", async ({ page }) => {
    await page.addInitScript(seenEtiquette);
    await seedHaunt(page);
    await page.goto("/games/party");
    await page.getByLabel("Room code").fill("ABC");
    await page.getByRole("button", { name: "Join" }).click();
    await expect(page.getByText(/Room codes are six letters \(no I, L or O\)/)).toBeVisible();
    await expect(page).toHaveURL(/\/games\/party$/);
  });
});

test("games hub lists bingo and party", async ({ page }) => {
  await page.addInitScript(seenEtiquette);
  await seedHaunt(page);
  await page.goto("/games");
  await expect(page.getByRole("link", { name: /Tombstone Bingo/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Graveyard Party/ })).toBeVisible();
});

type EvpWindow = Window & {
  __decoded?: AudioBuffer[];
  __played?: { buffer: AudioBuffer; rate: number }[];
  __streams?: MediaStream[];
};

function probeEvp() {
  const w = window as unknown as EvpWindow;
  w.__decoded = [];
  w.__played = [];
  w.__streams = [];
  const decode = BaseAudioContext.prototype.decodeAudioData as (...a: unknown[]) => Promise<AudioBuffer>;
  (BaseAudioContext.prototype as unknown as { decodeAudioData: unknown }).decodeAudioData = function (
    this: BaseAudioContext,
    ...args: unknown[]
  ) {
    const p = decode.apply(this, args);
    p.then((b) => w.__decoded!.push(b)).catch(() => {});
    return p;
  };
  const start = AudioBufferSourceNode.prototype.start as (...a: unknown[]) => void;
  (AudioBufferSourceNode.prototype as unknown as { start: unknown }).start = function (
    this: AudioBufferSourceNode,
    ...args: unknown[]
  ) {
    if (this.buffer) w.__played!.push({ buffer: this.buffer, rate: this.playbackRate.value });
    return start.apply(this, args);
  };
  const gum = MediaDevices.prototype.getUserMedia;
  MediaDevices.prototype.getUserMedia = async function (this: MediaDevices, c?: MediaStreamConstraints) {
    const s = await gum.call(this, c);
    w.__streams!.push(s);
    return s;
  };
}

test.describe("EVP recorder", () => {
  test.use({ permissions: ["microphone"] });

  test("records from the mic, releases it, plays it exactly reversed at 0.7x, and uploads nothing", async ({
    page,
  }) => {
    await page.addInitScript(seenEtiquette);
    await seedHaunt(page);
    await page.addInitScript(probeEvp);
    const bodies: string[] = [];
    page.on("request", (req) => {
      const size = req.postDataBuffer()?.length ?? 0;
      if (req.method() !== "GET") bodies.push(`${req.method()} ${req.url()} ${size}B`);
    });

    await page.goto("/games");
    await expect(page.getByRole("link", { name: /EVP Recorder/ })).toBeVisible();
    await page.goto("/games/evp?test-caps=short");
    await expect(page.getByText(/never uploaded or saved/)).toBeVisible();
    await page.getByRole("button", { name: "Record 2 seconds" }).click();
    await expect(page.getByRole("button", { name: /Recording/ })).toBeVisible();
    await expect(page.getByText(/Recorded \d+\.\d seconds/)).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: "Play it backwards" }).click();
    await expect(page.getByRole("button", { name: "Stop playback" })).toBeVisible();
    const check = await page.evaluate(() => {
      const w = window as unknown as EvpWindow;
      const orig = w.__decoded!.at(-1)!;
      const played = w.__played!.at(-1)!;
      const a = orig.getChannelData(0);
      const b = played.buffer.getChannelData(0);
      let mismatches = 0;
      let energy = 0;
      for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[a.length - 1 - i]) mismatches++;
        energy += a[i] * a[i];
      }
      return {
        seconds: orig.duration,
        length: a.length,
        playedLength: b.length,
        channels: [orig.numberOfChannels, played.buffer.numberOfChannels],
        mismatches,
        rms: Math.sqrt(energy / Math.max(1, a.length)),
        rate: played.rate,
        tracks: w.__streams!.flatMap((s) => s.getTracks().map((t) => t.readyState)),
      };
    });
    console.log(`EVP: ${JSON.stringify({ ...check, nonGetRequests: bodies })}`);
    expect(check.seconds).toBeGreaterThan(1);
    expect(check.rms).toBeGreaterThan(0.001); // the fake mic's beeps made it into the recording
    expect(check.playedLength).toBe(check.length);
    expect(check.channels[1]).toBe(check.channels[0]);
    expect(check.mismatches).toBe(0);
    expect(check.rate).toBeCloseTo(0.7, 5);
    expect(check.tracks.length).toBeGreaterThan(0);
    expect(check.tracks.every((t) => t === "ended")).toBe(true); // microphone released
    // No request carried anything the size of a recording.
    for (const b of bodies) expect(Number(b.split(" ").pop()!.replace("B", ""))).toBeLessThan(1024);

    await page.getByRole("button", { name: "Stop playback" }).click();
    await expect(page.getByRole("button", { name: "Play it backwards" })).toBeVisible();
  });
});

test("EVP is hidden entirely when the browser has no getUserMedia", async ({ page }) => {
  await page.addInitScript(seenEtiquette);
  await seedHaunt(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", { value: undefined, configurable: true });
  });
  await page.goto("/games");
  await expect(page.getByRole("link", { name: /Tombstone Bingo/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /EVP Recorder/ })).toHaveCount(0);
  await page.goto("/games/evp");
  await expect(page.getByText(/can.t record from a microphone, so the EVP recorder is hidden/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Record/ })).toHaveCount(0);
});
