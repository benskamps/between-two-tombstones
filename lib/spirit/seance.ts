// Séance mode: every phone on the same link speaks the same spirit words at the
// same second, with no server state. The link carries a room code, the
// cemetery and a hash of the word bank; the clock (set by GET /api/time, see
// clock.ts) does the rest.
//
// Time since a fixed epoch is cut into slots. Slot k's plan (does it speak,
// which words, how fast, where the static steps) comes from a PRNG seeded by
// hash(room, cemetery, k), so any phone can work out any slot on its own, and a
// phone that joins late lands in the same stream as the others.
//
// Pure except createSeanceSession, which takes its clock and speaker as
// arguments so it can run under fake timers.

import { normalizeRoomCode } from "../games/bingo";
import { hashString, mulberry32 } from "../games/rng";
import { randomBandFrequency } from "./engine";
import { QID_RE } from "./load";
import { DEFAULT_CAPS, formatDuration, type SpiritCaps, type StopReason } from "./session";
import { voiceParams } from "./voice";
import { pickFragment, type WordBank } from "./wordbank";

/** Séance time starts at Hackyard kickoff, Mon Oct 19 2026 18:00:00 UTC. A whole number of 10 s periods. */
export const SEANCE_EPOCH_MS = Date.UTC(2026, 9, 19, 18, 0, 0);
/** One slot: one chance for a voice. 8 slots per 10 s, so a 10 s start is always a slot start. */
export const SLOT_MS = 1250;
/** The static steps to a new band this many times per slot (every 250 ms). */
export const STEPS_PER_SLOT = 5;
export const STEP_MS = SLOT_MS / STEPS_PER_SLOT;
/** Phones start speaking on a 10-second boundary of the shared clock. */
export const START_ALIGN_MS = 10_000;
/** The countdown is never shorter than this, so the tap's audio unlock has time to settle. */
export const MIN_LEAD_MS = 1000;
/**
 * A slot's first draw below this means it wants to speak. It speaks only if the
 * slot before it didn't want to, so voices never come back to back (at least
 * 2.5 s apart) and exactly 1 slot in 4 speaks on average: a voice about every 5 s.
 */
export const SPEAK_CHANCE = 0.5;
/** A slot whose timer fires later than this past its start stays silent rather than speak out of step. */
export const LATE_MS = 400;
/** Timers aim this far past a step boundary so the step index has clearly moved on. */
const TICK_SLACK_MS = 2;

export const BANK_HASH_RE = /^[0-9a-f]{8}$/;

export type SeanceSeed = { room: string; cemetery: string };

export type Band = { frequency: number; q: number };

export type SlotPlan = {
  k: number;
  /** Slot start on the shared clock, ms since 1970. */
  at: number;
  speaks: boolean;
  /** 1–3 words when the slot speaks, else null. */
  text: string | null;
  /** Speech rate, the same on every phone so the words end together. */
  rate: number;
  /** Where the static's band steps, once per STEP_MS. */
  bands: Band[];
};

export function slotIndex(t: number): number {
  return Math.floor((t - SEANCE_EPOCH_MS) / SLOT_MS);
}

export function slotStart(k: number): number {
  return SEANCE_EPOCH_MS + k * SLOT_MS;
}

/** The first 10-second boundary of the shared clock at least MIN_LEAD_MS after `t`. */
export function alignedStart(t: number): number {
  const since = t + MIN_LEAD_MS - SEANCE_EPOCH_MS;
  return SEANCE_EPOCH_MS + Math.ceil(since / START_ALIGN_MS) * START_ALIGN_MS;
}

/** Plain code-unit order: the same on every phone, unlike localeCompare. */
function byCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * The bank with every list in one fixed order. Two phones that loaded the same
 * names in a different order end up with identical banks.
 */
export function canonicalBank(bank: WordBank): WordBank {
  return {
    ...bank,
    fullNames: [...bank.fullNames].sort(byCodeUnit),
    firstNames: [...bank.firstNames].sort(byCodeUnit),
    surnames: [...bank.surnames].sort(byCodeUnit),
    occupations: [...bank.occupations].sort(byCodeUnit),
    years: [...bank.years].sort(byCodeUnit),
    connectives: [...bank.connectives],
  };
}

/** 8 hex characters naming the bank's words. Equal hashes mean the phones pick the same words. */
export function bankHash(bank: WordBank): string {
  const c = canonicalBank(bank);
  const text = JSON.stringify([c.fullNames, c.firstNames, c.surnames, c.occupations, c.years, c.connectives]);
  return hashString(`bank|${text}`).toString(16).padStart(8, "0");
}

function slotRng(seed: SeanceSeed, k: number): () => number {
  return mulberry32(hashString(`seance|${seed.room}|${seed.cemetery}|${k}`));
}

function wantsToSpeak(seed: SeanceSeed, k: number): boolean {
  return slotRng(seed, k)() < SPEAK_CHANCE;
}

/**
 * Everything slot k does, from the seed alone. `bank` must be canonical
 * (canonicalBank), or phones with the same names in a different order would
 * pick different words. The draw order is fixed: speak?, bands, voice, words.
 */
export function planSlot(seed: SeanceSeed, bank: WordBank, k: number): SlotPlan {
  const rng = slotRng(seed, k);
  const wants = rng() < SPEAK_CHANCE;
  const speaks = wants && !wantsToSpeak(seed, k - 1);
  const bands = Array.from({ length: STEPS_PER_SLOT }, () => ({
    frequency: randomBandFrequency(rng),
    q: 2 + rng() * 5,
  }));
  const { rate } = voiceParams(rng);
  const text = speaks ? pickFragment(bank, rng) : null;
  return { k, at: slotStart(k), speaks, text, rate, bands };
}

/** Plans for slots from..from+count-1, for tests and checks. */
export function planSlots(seed: SeanceSeed, bank: WordBank, from: number, count: number): SlotPlan[] {
  const c = canonicalBank(bank);
  return Array.from({ length: count }, (_, i) => planSlot(seed, c, from + i));
}

/** "/spirit?seance=KXMPRT&cemetery=Q2008469&bank=1a2b3c4d" (bank left out when unknown). */
export function seancePath(room: string, cemetery: string, bank: string | null): string {
  const q = new URLSearchParams({ seance: room, cemetery });
  if (bank) q.set("bank", bank);
  return `/spirit?${q.toString()}`;
}

export type SeanceLink =
  | { ok: true; room: string; cemetery: string; bank: string | null }
  | { ok: false; message: string };

/**
 * Reads ?seance=&cemetery=&bank= from the address bar. Null when there's no
 * séance in the link. A missing or unreadable cemetery falls back to
 * `defaultCemetery`; a malformed bank hash is ignored (no mismatch check).
 */
export function readSeanceLink(get: (name: string) => string | null, defaultCemetery: string): SeanceLink | null {
  const raw = get("seance");
  if (raw === null) return null;
  const room = normalizeRoomCode(raw);
  if (!room) {
    return {
      ok: false,
      message: "This séance link has a broken room code. Room codes are six letters (no I, L or O).",
    };
  }
  const rawCemetery = get("cemetery");
  const cemetery = rawCemetery && QID_RE.test(rawCemetery) ? rawCemetery : defaultCemetery;
  const rawBank = get("bank");
  const bank = rawBank && BANK_HASH_RE.test(rawBank) ? rawBank : null;
  return { ok: true, room, cemetery, bank };
}

export type SeanceUtterance = {
  /** 1, 2, 3… on this phone. */
  n: number;
  /** Slot index: the same number on every phone for the same words. */
  k: number;
  text: string;
  /** Slot start on the shared clock. */
  at: number;
};

export type SeanceOptions = {
  seed: SeanceSeed;
  /** Canonicalized inside, so any bank built by buildWordBank will do. */
  bank: WordBank;
  caps?: SpiritCaps;
  /** The shared clock: Date.now() plus the offset from /api/time. */
  now: () => number;
  /** Speak this slot's words. */
  speak: (slot: SlotPlan & { text: string }) => void;
  /** Step the static to this band (every STEP_MS, countdown included). */
  onBand?: (band: Band) => void;
  /** Whole seconds until the start; called when the number changes. */
  onCountdown?: (secondsLeft: number) => void;
  /** The shared start has arrived: voices from here on. */
  onLive?: () => void;
  onUtterance: (u: SeanceUtterance) => void;
  onStop: (reason: StopReason) => void;
  /** Time the last voice gets to finish before the session closes at the voice cap. */
  tailMs?: number;
};

export type SeanceSession = {
  start(): void;
  stop(reason?: StopReason): void;
  isRunning(): boolean;
  count(): number;
  /** The shared-clock time voices begin, once started. */
  startsAt(): number | null;
};

/**
 * One phone's séance. start() picks the next 10 s boundary of the shared clock,
 * counts down to it, then speaks each speaking slot as its start comes round.
 * The same caps as the spirit box: 60 voices or 10 minutes from the start,
 * whichever comes first; every timer is cleared on stop.
 */
export function createSeanceSession(opts: SeanceOptions): SeanceSession {
  const caps = opts.caps ?? DEFAULT_CAPS;
  const bank = canonicalBank(opts.bank);
  const tailMs = opts.tailMs ?? Math.min(2500, SLOT_MS * 2);
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const plans = new Map<number, SlotPlan>();
  let running = false;
  let spoken = 0;
  let startAt: number | null = null;
  let endAt = 0;
  let live = false;
  let capped = false;
  let lastCountdown = -1;
  let lastSpokenSlot = Number.NEGATIVE_INFINITY;

  function later(fn: () => void, ms: number) {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
  }

  function clearAll() {
    for (const id of timers) clearTimeout(id);
    timers.clear();
  }

  function plan(k: number): SlotPlan {
    let p = plans.get(k);
    if (!p) {
      p = planSlot(opts.seed, bank, k);
      plans.set(k, p);
      // Only the current slot or two are ever needed; keep the cache tiny.
      if (plans.size > 4) plans.delete(plans.keys().next().value as number);
    }
    return p;
  }

  function stop(reason: StopReason = "user") {
    if (!running) return;
    running = false;
    clearAll();
    plans.clear();
    opts.onStop(reason);
  }

  function tick() {
    if (!running || startAt === null) return;
    const t = opts.now();
    if (t >= endAt) return stop("time-cap");
    const step = Math.floor((t - SEANCE_EPOCH_MS) / STEP_MS);
    const k = Math.floor(step / STEPS_PER_SLOT);
    const p = plan(k);
    opts.onBand?.(p.bands[step - k * STEPS_PER_SLOT]);

    if (t < startAt) {
      const left = Math.ceil((startAt - t) / 1000);
      if (left !== lastCountdown) {
        lastCountdown = left;
        opts.onCountdown?.(left);
      }
    } else {
      if (!live) {
        live = true;
        opts.onLive?.();
      }
      if (!capped && p.speaks && p.text !== null && k > lastSpokenSlot && t - p.at <= LATE_MS) {
        lastSpokenSlot = k;
        spoken += 1;
        opts.onUtterance({ n: spoken, k, text: p.text, at: p.at });
        opts.speak({ ...p, text: p.text });
        if (spoken >= caps.maxUtterances) {
          capped = true;
          later(() => stop("utterance-cap"), tailMs);
        }
      }
    }

    const next = SEANCE_EPOCH_MS + (step + 1) * STEP_MS;
    later(tick, Math.max(1, next - t + TICK_SLACK_MS));
  }

  return {
    start() {
      if (running) return;
      running = true;
      spoken = 0;
      live = false;
      capped = false;
      lastCountdown = -1;
      lastSpokenSlot = Number.NEGATIVE_INFINITY;
      const t = opts.now();
      startAt = alignedStart(t);
      endAt = startAt + caps.maxMs;
      // Hard stop, whatever the shared clock does in the meantime.
      later(() => stop("time-cap"), endAt - t);
      tick();
    },
    stop,
    isRunning: () => running,
    count: () => spoken,
    startsAt: () => startAt,
  };
}

const REJOIN = "Tap Join the séance to rejoin; you’ll land back in step with the others.";

export function seanceStopMessage(reason: StopReason, caps: SpiritCaps): string {
  switch (reason) {
    case "utterance-cap":
      return `Séance over on this phone: ${caps.maxUtterances} voices is the limit for one session. ${REJOIN}`;
    case "time-cap":
      return `Séance over on this phone: time’s up after ${formatDuration(caps.maxMs)}. ${REJOIN}`;
    case "hidden":
      return `Stopped because you left the page. ${REJOIN}`;
    case "unmount":
    case "user":
      return "Stopped.";
  }
}
