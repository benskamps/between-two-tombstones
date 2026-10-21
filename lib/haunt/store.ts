// The haunt on this phone: localStorage "btt-haunt", read through a tiny
// external store so React can subscribe (useSyncExternalStore) without a
// hydration mismatch. Browser only; never imported by server code paths that
// run it (the functions touch window only when called).
//
// Storage can be blocked (private modes, embedded browsers, quota): every
// access is wrapped, and a copy is kept in memory so the haunt still works for
// the rest of this page view and its client-side navigations.

import { HAUNT_EVENT, HAUNT_KEY, makeHaunt, parseHaunt, serializeHaunt, type Haunt, type HauntInput } from "./haunt";

let memory: string | null = null;
/** True once a write to localStorage failed: from then on, memory is the truth. */
let storageBroken = false;
let lastRaw: string | null | undefined;
let lastValue: Haunt | null = null;

function readRaw(): string | null {
  if (storageBroken) return memory;
  try {
    return window.localStorage.getItem(HAUNT_KEY);
  } catch {
    storageBroken = true;
    return memory;
  }
}

function notify() {
  try {
    window.dispatchEvent(new Event(HAUNT_EVENT));
  } catch {
    // No window (tests without one): nothing to tell.
  }
}

/** The current haunt, or null. Returns the same object until the stored value changes. */
export function getHaunt(): Haunt | null {
  const raw = readRaw();
  if (raw !== lastRaw) {
    lastRaw = raw;
    lastValue = parseHaunt(raw);
  }
  return lastValue;
}

/** Makes this cemetery the haunt. Returns what was kept, or null for bad input. */
export function setHaunt(input: HauntInput, now: Date = new Date()): Haunt | null {
  const h = makeHaunt(input, now);
  if (!h) return null;
  const raw = serializeHaunt(h);
  memory = raw;
  if (!storageBroken) {
    try {
      window.localStorage.setItem(HAUNT_KEY, raw);
    } catch {
      storageBroken = true;
    }
  }
  notify();
  return h;
}

export function clearHaunt(): void {
  memory = null;
  if (!storageBroken) {
    try {
      window.localStorage.removeItem(HAUNT_KEY);
    } catch {
      storageBroken = true;
    }
  }
  notify();
}

/** Calls back when the haunt changes in this tab or another one. */
export function subscribeHaunt(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === HAUNT_KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(HAUNT_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(HAUNT_EVENT, onChange);
  };
}

/** Test hook: forget the memory copy and the blocked-storage flag. */
export function resetHauntStoreForTests(): void {
  memory = null;
  storageBroken = false;
  lastRaw = undefined;
  lastValue = null;
}
