import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import oakland from "../../data/snapshots/oakland-atlanta.json";
import sleepyHollow from "../../data/snapshots/sleepy-hollow.json";
import { shuffled, mulberry32 } from "../games/rng";
import type { CemeterySnapshot } from "../types";
import {
  BANK_HASH_RE,
  LATE_MS,
  MIN_LEAD_MS,
  SEANCE_EPOCH_MS,
  SLOT_MS,
  START_ALIGN_MS,
  STEPS_PER_SLOT,
  alignedStart,
  bankHash,
  canonicalBank,
  createSeanceSession,
  planSlot,
  planSlots,
  readSeanceLink,
  seancePath,
  seanceStopMessage,
  slotIndex,
  slotStart,
  type SeanceUtterance,
  type SeanceSeed,
} from "./seance";
import { DEFAULT_CAPS, type SpiritCaps, type StopReason } from "./session";
import { bankPhrases, buildWordBank, type SpiritPerson } from "./wordbank";

const NOW = new Date("2026-10-20T00:00:00Z");
const oaklandPeople = (oakland as CemeterySnapshot).people as SpiritPerson[];
const sleepyPeople = (sleepyHollow as CemeterySnapshot).people as SpiritPerson[];
const bank = buildWordBank(oaklandPeople, NOW);
const seed: SeanceSeed = { room: "KXMPRT", cemetery: "Q2008469" };

/** A wall-clock moment in the demo week, mid-slot and not on a 10 s boundary. */
const T = Date.UTC(2026, 9, 23, 15, 0, 3) + 417;

function summary(plans: ReturnType<typeof planSlots>) {
  return plans.map((p) => (p.speaks ? `${p.k}:${p.text}` : `${p.k}:-`));
}

describe("slot clock", () => {
  it("the epoch is kickoff and sits on a 10 s boundary", () => {
    expect(new Date(SEANCE_EPOCH_MS).toISOString()).toBe("2026-10-19T18:00:00.000Z");
    expect(SEANCE_EPOCH_MS % START_ALIGN_MS).toBe(0);
    expect(START_ALIGN_MS % SLOT_MS).toBe(0);
  });

  it("maps times to slots and back", () => {
    for (const k of [-5, 0, 1, 12345, 300000]) {
      expect(slotIndex(slotStart(k))).toBe(k);
      expect(slotIndex(slotStart(k) + SLOT_MS - 1)).toBe(k);
    }
  });

  it("starts on the next 10 s boundary at least a second away, which is always a slot start", () => {
    const s = alignedStart(T);
    expect(s).toBeGreaterThanOrEqual(T + MIN_LEAD_MS);
    expect(s - T).toBeLessThanOrEqual(START_ALIGN_MS + MIN_LEAD_MS);
    expect((s - SEANCE_EPOCH_MS) % START_ALIGN_MS).toBe(0);
    expect(slotStart(slotIndex(s))).toBe(s);
    // 0.5 s before a boundary: too close, so the one after.
    const b = SEANCE_EPOCH_MS + 1000 * START_ALIGN_MS;
    expect(alignedStart(b - 500)).toBe(b + START_ALIGN_MS);
    expect(alignedStart(b - 1000)).toBe(b);
  });
});

describe("schedule", () => {
  const k0 = slotIndex(T);

  it("same room, cemetery and bank give identical schedules", () => {
    const a = planSlots(seed, bank, k0, 400);
    const b = planSlots({ ...seed }, buildWordBank(oaklandPeople, NOW), k0, 400);
    expect(b).toEqual(a);
  });

  it("different room codes give different schedules", () => {
    const a = summary(planSlots(seed, bank, k0, 200));
    for (const room of ["KXMPRS", "ABCDEF", "ZZZZZZ"]) {
      const b = summary(planSlots({ ...seed, room }, bank, k0, 200));
      expect(b).not.toEqual(a);
      // Not just a shifted copy: the speaking slots themselves differ.
      const speaking = (s: string[]) => s.filter((x) => !x.endsWith(":-")).map((x) => x.split(":")[0]);
      expect(speaking(b)).not.toEqual(speaking(a));
    }
  });

  it("a different cemetery gives a different schedule", () => {
    const sleepy = buildWordBank(sleepyPeople, NOW);
    const a = summary(planSlots(seed, bank, k0, 200));
    const b = summary(planSlots({ ...seed, cemetery: "Q360779" }, sleepy, k0, 200));
    expect(b).not.toEqual(a);
  });

  it("the order the names arrived in doesn't matter", () => {
    const reordered = buildWordBank(shuffled(oaklandPeople, mulberry32(7)), NOW);
    expect(reordered.surnames).not.toEqual(bank.surnames); // the test means something
    expect(canonicalBank(reordered)).toEqual(canonicalBank(bank));
    expect(planSlots(seed, reordered, k0, 300)).toEqual(planSlots(seed, bank, k0, 300));
  });

  it("speaks about 1 slot in 4, never two slots in a row, 1–3 words from the bank", () => {
    const plans = planSlots(seed, bank, k0, 20000);
    const speaking = plans.filter((p) => p.speaks);
    const share = speaking.length / plans.length;
    expect(share).toBeGreaterThan(0.22);
    expect(share).toBeLessThan(0.28);
    const allowed = bankPhrases(bank);
    for (let i = 1; i < plans.length; i++) expect(plans[i].speaks && plans[i - 1].speaks).toBe(false);
    for (const p of plans) {
      expect(p.bands).toHaveLength(STEPS_PER_SLOT);
      for (const b of p.bands) {
        expect(b.frequency).toBeGreaterThanOrEqual(250);
        expect(b.frequency).toBeLessThanOrEqual(3800);
      }
      expect(p.rate).toBeGreaterThanOrEqual(0.55);
      expect(p.rate).toBeLessThanOrEqual(0.8);
      if (!p.speaks) {
        expect(p.text).toBeNull();
        continue;
      }
      const words = p.text!.split(/\s+/);
      expect(words.length).toBeGreaterThanOrEqual(1);
      expect(words.length).toBeLessThanOrEqual(3);
      for (const w of words) expect(allowed.some((ph) => ph.split(/\s+/).includes(w)), w).toBe(true);
    }
  });

  it("a slot's plan doesn't depend on which slots were asked for before it", () => {
    const c = canonicalBank(bank);
    const direct = planSlot(seed, c, k0 + 777);
    const viaRange = planSlots(seed, bank, k0 + 700, 100)[77];
    expect(viaRange).toEqual(direct);
  });
});

describe("bank hash", () => {
  const tiny = buildWordBank(
    [
      { qid: "Q1", name: "Washington Irving", death: "1859-11-28T00:00:00Z", deathPrecision: 11, occupations: ["writer"] },
      { qid: "Q2", name: "Andrew Carnegie", death: "1919-08-11T00:00:00Z", deathPrecision: 11, occupations: ["industrialist"] },
    ],
    NOW,
  );

  it("is 8 hex characters and stable across runs and versions", () => {
    const h = bankHash(tiny);
    expect(h).toMatch(BANK_HASH_RE);
    // Pinned: if this changes, links already shared would warn about a mismatch.
    expect(h).toBe("9cb86acf");
  });

  it("ignores order and counts, changes when the words change", () => {
    const flipped = buildWordBank(
      [
        { qid: "Q2", name: "Andrew Carnegie", death: "1919-08-11T00:00:00Z", deathPrecision: 11, occupations: ["industrialist"] },
        { qid: "Q1", name: "Washington Irving", death: "1859-11-28T00:00:00Z", deathPrecision: 11, occupations: ["writer"] },
        { qid: "Q3", name: "Recent Person", death: "2000-01-01T00:00:00Z", deathPrecision: 11, occupations: [] },
      ],
      NOW,
    );
    expect(bankHash(flipped)).toBe(bankHash(tiny));
    expect(bankHash(buildWordBank(oaklandPeople.slice(1), NOW))).not.toBe(bankHash(bank));
    expect(bankHash(buildWordBank(sleepyPeople, NOW))).not.toBe(bankHash(bank));
    expect(bankHash(buildWordBank(shuffled(oaklandPeople, mulberry32(3)), NOW))).toBe(bankHash(bank));
  });
});

describe("links", () => {
  it("builds and reads séance links", () => {
    expect(seancePath("KXMPRT", "Q2008469", "0a1b2c3d")).toBe("/spirit?seance=KXMPRT&cemetery=Q2008469&bank=0a1b2c3d");
    expect(seancePath("KXMPRT", "Q2008469", null)).toBe("/spirit?seance=KXMPRT&cemetery=Q2008469");
    const get = (q: string) => (name: string) => new URLSearchParams(q).get(name);
    expect(readSeanceLink(get("cemetery=Q1"), "Q2008469")).toBeNull();
    expect(readSeanceLink(get("seance=kxm-prt&cemetery=Q360779&bank=0a1b2c3d"), "Q2008469")).toEqual({
      ok: true,
      room: "KXMPRT",
      cemetery: "Q360779",
      bank: "0a1b2c3d",
    });
    expect(readSeanceLink(get("seance=KXMPRT&cemetery=nope&bank=XYZ"), "Q2008469")).toEqual({
      ok: true,
      room: "KXMPRT",
      cemetery: "Q2008469",
      bank: null,
    });
    const bad = readSeanceLink(get("seance=ABC"), "Q2008469");
    expect(bad?.ok).toBe(false);
    expect(readSeanceLink(get("seance=KXMPRL"), "Q2008469")?.ok).toBe(false); // L isn't in the alphabet
  });
});

type Run = {
  said: SeanceUtterance[];
  spokeAt: { k: number; synced: number }[];
  stops: StopReason[];
  countdown: number[];
  live: number[];
  session: ReturnType<typeof createSeanceSession>;
};

/** One phone. `skew` is how far its shared clock is off the true one (residual sync error). */
function phone(opts: { room?: string; skew?: number; caps?: SpiritCaps; people?: SpiritPerson[] } = {}): Run {
  const skew = opts.skew ?? 0;
  const now = () => Date.now() + skew;
  const run: Run = { said: [], spokeAt: [], stops: [], countdown: [], live: [], session: null as never };
  run.session = createSeanceSession({
    seed: { room: opts.room ?? seed.room, cemetery: seed.cemetery },
    bank: buildWordBank(opts.people ?? oaklandPeople, NOW),
    caps: opts.caps,
    now,
    speak: (slot) => run.spokeAt.push({ k: slot.k, synced: now() }),
    onCountdown: (n) => run.countdown.push(n),
    onLive: () => run.live.push(now()),
    onUtterance: (u) => run.said.push(u),
    onStop: (r) => run.stops.push(r),
  });
  return run;
}

describe("séance session", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T);
  });
  afterEach(() => vi.useRealTimers());

  it("counts down to the next 10 s boundary, silent until then, then speaks on schedule", () => {
    const a = phone();
    a.session.start();
    const startAt = a.session.startsAt()!;
    expect(startAt).toBe(alignedStart(T));
    expect(a.said).toHaveLength(0);
    vi.advanceTimersByTime(startAt - T - 1);
    expect(a.said).toHaveLength(0);
    expect(a.live).toHaveLength(0);
    // Countdown went down a second at a time, ending at 1.
    expect(a.countdown[0]).toBe(Math.ceil((startAt - T) / 1000));
    expect(a.countdown.at(-1)).toBe(1);
    for (let i = 1; i < a.countdown.length; i++) expect(a.countdown[i]).toBe(a.countdown[i - 1] - 1);

    vi.advanceTimersByTime(60_000);
    expect(a.live).toHaveLength(1);
    expect(a.said.length).toBeGreaterThan(5);
    const expected = planSlots(seed, bank, slotIndex(startAt), slotIndex(Date.now()) - slotIndex(startAt))
      .filter((p) => p.speaks)
      .map((p) => ({ k: p.k, text: p.text, at: p.at }));
    expect(a.said.map(({ k, text, at }) => ({ k, text, at }))).toEqual(expected);
    // Each voice went out within LATE_MS of its slot start on the shared clock.
    for (const s of a.spokeAt) {
      expect(s.synced - slotStart(s.k)).toBeGreaterThanOrEqual(0);
      expect(s.synced - slotStart(s.k)).toBeLessThanOrEqual(LATE_MS);
    }
    a.session.stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("a phone that joins 37 s later lands on the same words in the same slots", () => {
    const early = phone();
    early.session.start();
    vi.advanceTimersByTime(37_000);
    const late = phone({ skew: 80 }); // its clock sync came out 80 ms fast
    late.session.start();
    vi.advanceTimersByTime(120_000);

    const lateFrom = slotIndex(late.session.startsAt()!);
    expect(lateFrom).toBeGreaterThan(slotIndex(early.session.startsAt()!));
    const overlap = (r: Run) => r.said.filter((u) => u.k >= lateFrom).map(({ k, text, at }) => ({ k, text, at }));
    expect(overlap(late).length).toBeGreaterThan(10);
    expect(overlap(late)).toEqual(overlap(early));
    early.session.stop();
    late.session.stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("two phones with different room codes say different things", () => {
    const a = phone();
    const b = phone({ room: "ZQRSTU" });
    a.session.start();
    b.session.start();
    vi.advanceTimersByTime(90_000);
    const seq = (r: Run) => r.said.map((u) => `${u.k}:${u.text}`);
    expect(seq(a).length).toBeGreaterThan(5);
    expect(seq(b)).not.toEqual(seq(a));
    a.session.stop();
    b.session.stop();
  });

  it("stops at 60 voices and clears every timer", () => {
    const a = phone();
    a.session.start();
    vi.advanceTimersByTime(DEFAULT_CAPS.maxMs + 20_000);
    expect(a.said).toHaveLength(60);
    expect(a.spokeAt).toHaveLength(60);
    expect(a.stops).toEqual(["utterance-cap"]);
    expect(a.session.isRunning()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops 10 minutes after the start when the voice cap isn't reached", () => {
    const a = phone({ caps: { ...DEFAULT_CAPS, maxUtterances: 10_000 } });
    a.session.start();
    const startAt = a.session.startsAt()!;
    vi.advanceTimersByTime(startAt - T + DEFAULT_CAPS.maxMs - 1);
    expect(a.stops).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(a.stops).toEqual(["time-cap"]);
    expect(a.said.length).toBeGreaterThan(60);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(60_000);
    expect(a.stops).toEqual(["time-cap"]);
  });

  it("stop() is immediate, reports once, and leaves no timers", () => {
    const a = phone();
    a.session.start();
    vi.advanceTimersByTime(20_000);
    const n = a.said.length;
    a.session.stop("hidden");
    a.session.stop("user");
    vi.advanceTimersByTime(60_000);
    expect(a.said).toHaveLength(n);
    expect(a.stops).toEqual(["hidden"]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stays silent rather than speak late when the clock jumps", () => {
    let jump = 0;
    const spoke: { k: number; late: number }[] = [];
    const now = () => Date.now() + jump;
    const s = createSeanceSession({
      seed,
      bank,
      now,
      speak: (slot) => spoke.push({ k: slot.k, late: now() - slot.at }),
      onUtterance: () => {},
      onStop: () => {},
    });
    s.start();
    vi.advanceTimersByTime(30_000);
    jump = 700; // e.g. a late clock sync landed mid-séance
    vi.advanceTimersByTime(30_000);
    for (const x of spoke) expect(x.late).toBeLessThanOrEqual(LATE_MS);
    expect(new Set(spoke.map((x) => x.k)).size).toBe(spoke.length); // nothing said twice
    s.stop();
  });

  it("explains each stop", () => {
    expect(seanceStopMessage("utterance-cap", DEFAULT_CAPS)).toContain("60 voices");
    expect(seanceStopMessage("time-cap", DEFAULT_CAPS)).toContain("10 minutes");
    expect(seanceStopMessage("hidden", DEFAULT_CAPS)).toContain("left the page");
    expect(seanceStopMessage("user", DEFAULT_CAPS)).toBe("Stopped.");
  });
});
