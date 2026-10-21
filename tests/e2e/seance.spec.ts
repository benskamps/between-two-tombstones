import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { seedHaunt } from "./fixtures/haunt";
import {
  SEANCE_EPOCH_MS,
  STEPS_PER_SLOT,
  STEP_MS,
  bankHash,
  canonicalBank,
  planSlot,
  slotStart,
} from "../../lib/spirit/seance";
import type { CemeterySnapshot } from "../../lib/types";
import { toSpiritPerson } from "../../lib/spirit/load";
import { buildWordBank, type SpiritPerson } from "../../lib/spirit/wordbank";

// Lane 9: séance mode. Several browser contexts stand in for phones. Each one's
// Date.now() is shifted by a few hundred ms (an init script), so they only line
// up if the /api/time clock sync works. Headless Chromium has no voices, so
// speechSynthesis is replaced by a recorder that notes each utterance's text,
// the DOM event being dispatched when speak() ran (to show the unlock happens
// inside the tap), and the true wall-clock time it was called
// (performance.timeOrigin + performance.now(), which the shift doesn't touch).
// The burials route is forced to 404 so every context uses the saved Oakland
// copy, and the test can compute the expected schedule from lib/spirit/seance.

const OAKLAND = "Q2008469";
const DRIFT = "Using this phone’s clock; voices may drift by a second.";
const MISMATCH = "Your copy of the names differs from the host’s, so some voices won’t line up.";

const oakland = JSON.parse(
  readFileSync(join(__dirname, "../../data/snapshots/oakland-atlanta.json"), "utf8"),
) as CemeterySnapshot;
// The same normalization the app applies to its saved copy (lib/spirit/samples.ts):
// a bare-QID label takes the Wikipedia title, so the bank matches what phones build.
const oaklandPeople = oakland.people.map(toSpiritPerson).filter((p): p is SpiritPerson => p !== null);
const oaklandBank = canonicalBank(buildWordBank(oaklandPeople));
const OAKLAND_HASH = bankHash(oaklandBank);

type Spoken = { text: string; event: string | null; real: number; rate: number; pitch: number };
type ProbeWindow = Window & {
  __spoken?: Spoken[];
  __audio?: { constructed: number; resumeEvents: (string | null)[]; bands: { hz: number; real: number }[] };
};

function seenEtiquette() {
  try {
    localStorage.setItem("btt-etiquette-seen", "1");
  } catch {
    // ignore
  }
}

function shiftClock(shiftMs: number) {
  const real = Date.now.bind(Date);
  Date.now = () => real() + shiftMs;
}

function recordSpeechAndAudio() {
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
        event: (window as unknown as { event?: Event }).event?.type ?? null,
        real: performance.timeOrigin + performance.now(),
        rate: u.rate,
        pitch: u.pitch,
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

  const audio = { constructed: 0, resumeEvents: [] as (string | null)[], bands: [] as { hz: number; real: number }[] };
  w.__audio = audio;
  // Band-pass centre changes (the only AudioParam the app steps to 250 Hz or more), with true wall time.
  const setValueAtTime = AudioParam.prototype.setValueAtTime;
  AudioParam.prototype.setValueAtTime = function (this: AudioParam, value: number, time: number) {
    if (value >= 250) audio.bands.push({ hz: value, real: performance.timeOrigin + performance.now() });
    return setValueAtTime.call(this, value, time);
  };
  const AC = window.AudioContext;
  class CountingAudioContext extends AC {
    constructor(opts?: AudioContextOptions) {
      super(opts);
      audio.constructed += 1;
    }
  }
  window.AudioContext = CountingAudioContext;
  const resume = AC.prototype.resume;
  AC.prototype.resume = function (this: AudioContext) {
    audio.resumeEvents.push((window as unknown as { event?: Event }).event?.type ?? null);
    return resume.call(this);
  };
}

async function phone(browser: Browser, baseURL: string | undefined, shiftMs: number): Promise<BrowserContext> {
  const ctx = await browser.newContext({ baseURL });
  await ctx.addInitScript(seenEtiquette);
  await ctx.addInitScript(shiftClock, shiftMs);
  await ctx.addInitScript(recordSpeechAndAudio);
  // Same names on every "phone": the copy saved with the app.
  await ctx.route("**/api/cemeteries/*/burials", (route) => route.fulfill({ status: 404, body: "not found" }));
  return ctx;
}

type Voice = { k: number; text: string; at: string; real: number };

/** Captions (oldest first) zipped with the recorder's non-blank utterances. */
async function voices(page: Page): Promise<Voice[]> {
  const caps = await page
    .getByRole("log", { name: "Captions" })
    .getByRole("listitem")
    .evaluateAll((els) =>
      els
        .map((el) => ({
          k: Number(el.getAttribute("data-slot")),
          at: el.querySelector("time")?.getAttribute("datetime") ?? "",
          text: el.querySelector("span")?.textContent ?? "",
        }))
        .reverse(),
    );
  const spoken = await page.evaluate(() =>
    ((window as unknown as ProbeWindow).__spoken ?? []).filter((s) => s.text.trim() !== ""),
  );
  const n = Math.min(caps.length, spoken.length);
  const out: Voice[] = [];
  for (let i = 0; i < n; i++) {
    expect(spoken[i].text).toBe(caps[i].text);
    out.push({ ...caps[i], real: spoken[i].real });
  }
  return out;
}

async function spokenCount(page: Page): Promise<number> {
  return page.evaluate(() => ((window as unknown as ProbeWindow).__spoken ?? []).filter((s) => s.text.trim() !== "").length);
}

/** Every slot from the first voice to the last must match the pure schedule: nothing missing, nothing extra. */
function expectMatchesSchedule(list: Voice[], room: string) {
  const byK = new Map(list.map((v) => [v.k, v]));
  for (let k = list[0].k; k <= list[list.length - 1].k; k++) {
    const p = planSlot({ room, cemetery: OAKLAND }, oaklandBank, k);
    if (p.speaks) {
      expect(byK.get(k)?.text, `slot ${k}`).toBe(p.text);
      expect(byK.get(k)?.at).toBe(new Date(slotStart(k)).toISOString());
    } else {
      expect(byK.has(k), `slot ${k} should be silent`).toBe(false);
    }
  }
}

function link(origin: string, room: string, bank: string | null = OAKLAND_HASH, extra = "") {
  return `${origin}/spirit?seance=${room}&cemetery=${OAKLAND}${bank ? `&bank=${bank}` : ""}${extra}`;
}

/** The invite a host sends: the séance's share page (L5.2), whose one button opens link(). */
function shareLink(origin: string, room: string, bank: string | null = OAKLAND_HASH, cemetery = OAKLAND) {
  return `${origin}/s/seance/${cemetery}/${room}${bank ? `?b=${bank}` : ""}`;
}

test.describe("séance", () => {
  test("phones with skewed clocks speak the same words in the same slots; another room says something else", async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(120_000);
    const origin = new URL(baseURL!).origin;
    const [a, b, c] = await Promise.all([
      phone(browser, baseURL, +350),
      phone(browser, baseURL, -280),
      phone(browser, baseURL, +120),
    ]);
    await a.grantPermissions(["clipboard-read", "clipboard-write"]);
    // Only the host has a haunt (the spirit box needs one); B and C open links someone sent, which never need one.
    await seedHaunt(a);

    // A hosts: starts a séance from the spirit page.
    const pa = await a.newPage();
    await pa.goto("/spirit");
    await expect(pa.getByText(/people buried at Oakland Cemetery died 75 or more years ago/)).toBeVisible();
    await pa.getByRole("button", { name: "Start a séance" }).click();
    const code = (await pa.getByTestId("seance-code").textContent())!.trim();
    expect(code).toMatch(/^[A-HJKMNP-Z]{6}$/);
    const shared = await pa.getByTestId("seance-link").inputValue();
    expect(shared).toBe(shareLink(origin, code));
    await pa.getByRole("button", { name: "Copy link" }).click();
    expect(await pa.evaluate(() => navigator.clipboard.readText())).toBe(shared);
    await pa.getByRole("link", { name: "Open the séance on this phone" }).click();
    await expect(pa).toHaveURL(link(origin, code));
    await expect(pa.getByRole("heading", { name: `Séance ${code}` })).toBeVisible();

    const other = code === "BNSHEE" ? "GHSTXY" : "BNSHEE";
    const pb = await b.newPage();
    const pc = await c.newPage();
    // B opens the invite as sent (the share page) and joins from its one button.
    const joinFromInvite = async () => {
      await pb.goto(shared);
      await pb.getByRole("link", { name: "Join the séance" }).click();
      await expect(pb).toHaveURL(link(origin, code));
    };
    await Promise.all([joinFromInvite(), pc.goto(link(origin, other))]);
    for (const p of [pa, pb, pc]) await expect(p.getByText(/Clock set from the server, to within about \d+ ms/)).toBeVisible();
    for (const p of [pa, pb]) await expect(p.getByText(MISMATCH)).toHaveCount(0);

    // Nobody has tapped Join: no voices, no audio context.
    await pa.waitForTimeout(1500);
    for (const p of [pa, pb, pc]) {
      const probe = await p.evaluate(() => ({
        spoken: (window as unknown as ProbeWindow).__spoken!.length,
        contexts: (window as unknown as ProbeWindow).__audio!.constructed,
      }));
      expect(probe).toEqual({ spoken: 0, contexts: 0 });
    }

    // A and C join; B joins 3 s later (it may land on a later 10 s start, and that's fine).
    await Promise.all([pa, pc].map((p) => p.getByRole("button", { name: "Join the séance" }).click()));
    await pb.waitForTimeout(3000);
    await pb.getByRole("button", { name: "Join the séance" }).click();
    for (const p of [pa, pb, pc]) {
      await expect(p.getByTestId("seance-latest")).toHaveText(/The séance begins in \d+…|…/);
      // iOS: speech was unlocked and the AudioContext resumed inside the tap.
      const unlock = await p.evaluate(() => {
        const w = window as unknown as ProbeWindow;
        return { first: w.__spoken![0], resume: w.__audio!.resumeEvents[0] };
      });
      expect(unlock.first.text.trim()).toBe("");
      expect(unlock.first.event).toBe("click");
      expect(unlock.resume).toBe("click");
    }
    await expect(pb.getByText(/The séance begins in \d+…/)).toBeVisible();

    // Let it run until every phone has said at least 3 things.
    for (const p of [pa, pb, pc]) await expect.poll(() => spokenCount(p), { timeout: 60_000 }).toBeGreaterThanOrEqual(3);
    const [va, vb, vc] = [await voices(pa), await voices(pb), await voices(pc)];

    // A and B: identical over the slots both were live for.
    const lo = Math.max(va[0].k, vb[0].k);
    const hi = Math.min(va[va.length - 1].k, vb[vb.length - 1].k);
    const inRange = (list: Voice[]) => list.filter((v) => v.k >= lo && v.k <= hi);
    const ra = inRange(va);
    const rb = inRange(vb);
    expect(rb.length).toBeGreaterThanOrEqual(2);
    expect(rb.map(({ k, text, at }) => ({ k, text, at }))).toEqual(ra.map(({ k, text, at }) => ({ k, text, at })));
    // …and both follow the pure schedule for this room, with no gaps.
    expectMatchesSchedule(va, code);
    expectMatchesSchedule(vb, code);

    // How closely in real time did the two phones speak each shared slot?
    const deltas = ra.map((v, i) => Math.abs(v.real - rb[i].real));
    const lateA = va.map((v) => v.real - slotStart(v.k));
    const lateB = vb.map((v) => v.real - slotStart(v.k));
    console.log(
      `séance ${code}: shared slots ${ra.map((v) => `${v.k}=${v.text}`).join(", ")}; |A−B| per slot ms = ${deltas
        .map((d) => d.toFixed(0))
        .join(", ")} (max ${Math.max(...deltas).toFixed(0)}); A late vs true slot start ms = ${lateA
        .map((d) => d.toFixed(0))
        .join(", ")}; B late = ${lateB.map((d) => d.toFixed(0)).join(", ")}`,
    );
    expect(Math.max(...deltas)).toBeLessThan(250);
    for (const d of [...lateA, ...lateB]) {
      expect(d).toBeGreaterThan(-150);
      expect(d).toBeLessThan(400);
    }

    // The static: every band step on A and B is the schedule's band for that 250 ms step.
    for (const p of [pa, pb]) {
      const bands = await p.evaluate(() => (window as unknown as ProbeWindow).__audio!.bands);
      expect(bands.length).toBeGreaterThan(40);
      const bandAt = (step: number) => {
        const k = Math.floor(step / STEPS_PER_SLOT);
        return planSlot({ room: code, cemetery: OAKLAND }, oaklandBank, k).bands[step - k * STEPS_PER_SLOT].frequency;
      };
      let matched = 0;
      const misses: string[] = [];
      for (const b of bands) {
        // Timed ticks land a few ms after a step boundary, or a hair early if the synced clock runs a
        // little fast (hence the +50 ms candidate); the very first step happens at the tap, anywhere in a step.
        const step = Math.floor((b.real - SEANCE_EPOCH_MS) / STEP_MS);
        const nudged = Math.floor((b.real - SEANCE_EPOCH_MS + 50) / STEP_MS);
        if ([step, nudged].some((s) => Math.abs(b.hz - bandAt(s)) < 0.01)) matched += 1;
        else misses.push(`${b.hz.toFixed(1)} Hz at +${((b.real - SEANCE_EPOCH_MS) % STEP_MS).toFixed(0)} ms into step ${step}`);
      }
      console.log(
        `static on ${p === pa ? "A" : "B"}: ${matched}/${bands.length} band steps match the schedule${misses.length ? `; misses: ${misses.join("; ")}` : ""}`,
      );
      expect(matched).toBe(bands.length);
    }

    // C, another room: its own schedule, not A's.
    expectMatchesSchedule(vc, other);
    const seq = (list: Voice[], from: number, to: number) =>
      list.filter((v) => v.k >= from && v.k <= to).map((v) => `${v.k}:${v.text}`);
    const cLo = Math.max(va[0].k, vc[0].k);
    const cHi = Math.min(va[va.length - 1].k, vc[vc.length - 1].k);
    expect(seq(vc, cLo, cHi)).not.toEqual(seq(va, cLo, cHi));
    console.log(`room ${other}: ${vc.map((v) => `${v.k}=${v.text}`).join(", ")}`);

    // Stop is immediate on every phone.
    for (const p of [pa, pb, pc]) {
      await p.getByRole("button", { name: "Stop" }).click();
      await expect(p.getByText("Stopped.", { exact: true })).toBeVisible();
    }
    const counts = await Promise.all([pa, pb, pc].map(spokenCount));
    await pa.waitForTimeout(3000);
    expect(await Promise.all([pa, pb, pc].map(spokenCount))).toEqual(counts);

    await Promise.all([a.close(), b.close(), c.close()]);
  });

  test("when /api/time fails, it says so and runs on the phone's own clock", async ({ browser, baseURL }) => {
    const ctx = await phone(browser, baseURL, 0);
    let timeCalls = 0;
    await ctx.route("**/api/time", (route) => {
      timeCalls += 1;
      return route.fulfill({ status: 500, body: "down" });
    });
    const page = await ctx.newPage();
    await page.goto(link(new URL(baseURL!).origin, "KXMPRT"));
    await expect(page.getByText(DRIFT)).toBeVisible();
    expect(timeCalls).toBe(1); // no retry storm: it stops at the first failure
    await page.getByRole("button", { name: "Join the séance" }).click();
    await expect(page.getByText(/The séance begins in \d+…/)).toBeVisible();
    await expect(page.getByTestId("seance-latest")).not.toHaveText(/begins in/, { timeout: 15_000 });
    await ctx.close();
  });

  test("a different copy of the names is flagged; a typed-in code says it can't check", async ({ browser, baseURL }) => {
    const ctx = await phone(browser, baseURL, 0);
    const page = await ctx.newPage();
    const origin = new URL(baseURL!).origin;
    await page.goto(link(origin, "KXMPRT", "00000000"));
    await expect(page.getByText(MISMATCH)).toBeVisible();
    // The invite keeps the host's hash, so the next phone compares against the host too.
    await expect(page.getByTestId("seance-link")).toHaveValue(shareLink(origin, "KXMPRT", "00000000"));
    await page.goto(link(origin, "KXMPRT", OAKLAND_HASH));
    await expect(page.getByText(/people buried there died 75 or more years ago/)).toBeVisible();
    await expect(page.getByText(MISMATCH)).toHaveCount(0);
    await page.goto(link(origin, "KXMPRT", null));
    await expect(page.getByText(/You joined by room code, so this phone can.t check its names/)).toBeVisible();
    await expect(page.getByTestId("seance-link")).toHaveValue(shareLink(origin, "KXMPRT", OAKLAND_HASH));
    await ctx.close();
  });

  test("join a séance by typing its code, with the cemetery picked on the page", async ({ page }) => {
    await page.addInitScript(seenEtiquette);
    await seedHaunt(page);
    await page.goto("/spirit");
    await page.getByLabel(/Sleepy Hollow Cemetery/).check();
    await expect(page.getByText(/people buried at Sleepy Hollow Cemetery died 75 or more years ago/)).toBeVisible();
    await page.getByLabel("Séance room code").fill("abc");
    await page.getByRole("button", { name: "Join", exact: true }).click();
    await expect(page.getByText(/Room codes are six letters \(no I, L or O\)/)).toBeVisible();
    await page.getByLabel("Séance room code").fill("kxm-prt");
    await page.getByRole("button", { name: "Join", exact: true }).click();
    await expect(page).toHaveURL(/\/spirit\?seance=KXMPRT&cemetery=Q360779$/);
    await expect(page.getByRole("heading", { name: "Séance KXMPRT" })).toBeVisible();
    await expect(page.getByText(/Names from Sleepy Hollow Cemetery/)).toBeVisible();
    await page.getByRole("link", { name: "Leave the séance" }).click();
    await expect(page).toHaveURL(/\/spirit$/);
    await expect(page.getByRole("button", { name: "Start", exact: true })).toBeVisible();
  });

  test("a broken room code in the link says what's wrong", async ({ page }) => {
    await page.addInitScript(seenEtiquette);
    await page.goto("/spirit?seance=ABC&cemetery=Q2008469");
    // (Next's route announcer is also role=alert, so pick ours by its text.)
    await expect(page.getByRole("alert").filter({ hasText: "This séance link has a broken room code" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Join the séance|Start/ })).toHaveCount(0);
  });

  test("the party page starts a séance with the party's room code", async ({ browser, baseURL }) => {
    const ctx = await phone(browser, baseURL, 0);
    await seedHaunt(ctx);
    const page = await ctx.newPage();
    const origin = new URL(baseURL!).origin;
    await page.goto("/games/party");
    await page.getByRole("button", { name: "Start a party" }).click();
    const party = (await page.getByTestId("room-code").textContent())!.trim();
    await expect(page.getByText(`It uses your party’s room code, ${party}.`)).toBeVisible();
    await page.getByRole("button", { name: "Start a séance" }).click();
    await expect(page.getByTestId("seance-code")).toHaveText(party);
    await expect(page.getByTestId("seance-link")).toHaveValue(shareLink(origin, party));
    // Switching cemetery keeps the code and updates the link.
    await page.getByLabel(/Sleepy Hollow Cemetery/).check();
    await expect(page.getByTestId("seance-link")).toHaveValue(
      new RegExp(`^${origin}/s/seance/Q360779/${party}\\?b=[0-9a-f]{8}$`),
    );
    await page.getByLabel(/Oakland Cemetery/).check();
    await page.getByRole("link", { name: "Open the séance on this phone" }).click();
    await expect(page).toHaveURL(link(origin, party));
    await expect(page.getByRole("heading", { name: `Séance ${party}` })).toBeVisible();
    await expect(page.getByText(MISMATCH)).toHaveCount(0);
    await ctx.close();
  });

  test("séance sessions keep the spirit box caps and stop when the page is hidden", async ({ browser, baseURL }) => {
    test.setTimeout(90_000);
    const origin = new URL(baseURL!).origin;
    const ctx = await phone(browser, baseURL, 0);
    const capped = await ctx.newPage();
    const hidden = await ctx.newPage();
    await capped.goto(link(origin, "KXMPRT", OAKLAND_HASH, "&test-caps=short"));
    await hidden.goto(link(origin, "KXMPRT"));
    await expect(capped.getByText(/Test caps are on/)).toBeVisible();
    await capped.getByRole("button", { name: "Join the séance" }).click();
    await hidden.getByRole("button", { name: "Join the séance" }).click();

    // Hidden page: stops at once and says why.
    await hidden.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(hidden.getByText(/Stopped because you left the page\./)).toBeVisible();
    await expect(hidden.getByRole("button", { name: "Join the séance" })).toBeVisible();

    // Capped page: 3 voices, then over.
    await expect(capped.getByText(/Séance over on this phone: 3 voices is the limit/)).toBeVisible({ timeout: 60_000 });
    expect(await spokenCount(capped)).toBe(3);
    expect(await spokenCount(hidden)).toBe(0);
    await capped.waitForTimeout(3000);
    expect(await spokenCount(capped)).toBe(3);
    await ctx.close();
  });

  test("runs with captions only, and says so, when the browser can't speak", async ({ browser, baseURL }) => {
    test.setTimeout(60_000);
    const ctx = await browser.newContext({ baseURL });
    await ctx.addInitScript(seenEtiquette);
    await ctx.addInitScript(() => {
      Object.defineProperty(window, "speechSynthesis", { value: undefined, configurable: true });
      delete (window as unknown as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance;
    });
    const page = await ctx.newPage();
    await page.goto(link(new URL(baseURL!).origin, "KXMPRT", null));
    await expect(page.getByText(/Your browser can.t speak, so the voices appear as captions\./)).toBeVisible();
    await page.getByRole("button", { name: "Join the séance" }).click();
    await expect(page.getByRole("log", { name: "Captions" }).getByRole("listitem").first()).toBeVisible({
      timeout: 40_000,
    });
    await ctx.close();
  });

  test("GET /api/time is fresh and never cached", async ({ request }) => {
    const before = Date.now();
    const res = await request.get("/api/time");
    const after = Date.now();
    expect(res.status()).toBe(200);
    expect(res.headers()["cache-control"]).toBe("no-store");
    const { now } = (await res.json()) as { now: number };
    expect(now).toBeGreaterThanOrEqual(before - 1000);
    expect(now).toBeLessThanOrEqual(after + 1000);
    const again = (await (await request.get("/api/time")).json()) as { now: number };
    expect(again.now).toBeGreaterThanOrEqual(now);
  });
});
