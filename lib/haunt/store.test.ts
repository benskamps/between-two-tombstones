import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GHOST_PASS, HAUNT_KEY } from "./haunt";
import { clearHaunt, getHaunt, resetHauntStoreForTests, setHaunt, subscribeHaunt } from "./store";

class MemoryStorage {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.has(k) ? this.data.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, String(v));
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

class BlockedStorage {
  getItem(): string | null {
    throw new DOMException("blocked", "SecurityError");
  }
  setItem() {
    throw new DOMException("blocked", "SecurityError");
  }
  removeItem() {
    throw new DOMException("blocked", "SecurityError");
  }
}

function fakeWindow(storage: unknown) {
  const target = new EventTarget();
  return Object.assign(target, { localStorage: storage });
}

const OAKLAND = { qid: "Q2008469", name: "Oakland Cemetery", place: "Atlanta" };
const NOW = new Date("2026-10-21T02:00:00Z");

beforeEach(() => resetHauntStoreForTests());
afterEach(() => vi.unstubAllGlobals());

describe("haunt store", () => {
  it("starts empty, keeps what's set under btt-haunt, and clears", () => {
    const storage = new MemoryStorage();
    vi.stubGlobal("window", fakeWindow(storage));
    expect(getHaunt()).toBeNull();
    const h = setHaunt(OAKLAND, NOW);
    expect(h).toEqual({ ...OAKLAND, at: NOW.toISOString() });
    expect(JSON.parse(storage.getItem(HAUNT_KEY)!)).toEqual({ ...OAKLAND, at: NOW.toISOString() });
    expect(getHaunt()).toEqual(h);
    clearHaunt();
    expect(storage.getItem(HAUNT_KEY)).toBeNull();
    expect(getHaunt()).toBeNull();
  });

  it("keeps a Ghost pass when the same cemetery is opened again, and ends it for any other", () => {
    const storage = new MemoryStorage();
    vi.stubGlobal("window", fakeWindow(storage));
    expect(setHaunt(GHOST_PASS, NOW)).toMatchObject({ qid: "Q360779", ghost: true });
    expect(JSON.parse(storage.getItem(HAUNT_KEY)!)).toMatchObject({ ghost: true });
    // The hub sets the haunt from its own data, with no ghost flag: still a Ghost pass.
    expect(setHaunt({ qid: "Q360779", name: "Sleepy Hollow Cemetery" }, NOW)).toMatchObject({ ghost: true });
    expect(getHaunt()).toMatchObject({ ghost: true });
    const real = setHaunt(OAKLAND, NOW);
    expect(real).toEqual({ ...OAKLAND, at: NOW.toISOString() });
    expect(JSON.parse(storage.getItem(HAUNT_KEY)!)).not.toHaveProperty("ghost");
  });

  it("returns the same object until the stored value changes (what useSyncExternalStore needs)", () => {
    vi.stubGlobal("window", fakeWindow(new MemoryStorage()));
    setHaunt(OAKLAND, NOW);
    const a = getHaunt();
    expect(getHaunt()).toBe(a);
    setHaunt(OAKLAND, new Date("2026-10-21T03:00:00Z"));
    expect(getHaunt()).not.toBe(a);
  });

  it("reads a haunt another tab wrote, and ignores junk", () => {
    const storage = new MemoryStorage();
    vi.stubGlobal("window", fakeWindow(storage));
    storage.setItem(HAUNT_KEY, JSON.stringify({ ...OAKLAND, at: NOW.toISOString() }));
    expect(getHaunt()?.name).toBe("Oakland Cemetery");
    storage.setItem(HAUNT_KEY, "{oops");
    expect(getHaunt()).toBeNull();
  });

  it("refuses bad input without touching storage", () => {
    const storage = new MemoryStorage();
    vi.stubGlobal("window", fakeWindow(storage));
    expect(setHaunt({ qid: "nope", name: "X" })).toBeNull();
    expect(storage.data.size).toBe(0);
  });

  it("still works for this page view when storage is blocked", () => {
    vi.stubGlobal("window", fakeWindow(new BlockedStorage()));
    expect(getHaunt()).toBeNull();
    expect(setHaunt(OAKLAND, NOW)).not.toBeNull();
    expect(getHaunt()?.qid).toBe("Q2008469");
    clearHaunt();
    expect(getHaunt()).toBeNull();
  });

  it("falls back to memory when only writes fail (quota)", () => {
    const storage = new MemoryStorage();
    storage.setItem = () => {
      throw new DOMException("full", "QuotaExceededError");
    };
    vi.stubGlobal("window", fakeWindow(storage));
    setHaunt(OAKLAND, NOW);
    expect(getHaunt()?.name).toBe("Oakland Cemetery");
  });

  it("tells subscribers about changes in this tab and about btt-haunt changes in other tabs", () => {
    const w = fakeWindow(new MemoryStorage());
    vi.stubGlobal("window", w);
    const seen = vi.fn();
    const stop = subscribeHaunt(seen);
    setHaunt(OAKLAND, NOW);
    expect(seen).toHaveBeenCalledTimes(1);
    w.dispatchEvent(Object.assign(new Event("storage"), { key: "btt-etiquette-seen" }));
    expect(seen).toHaveBeenCalledTimes(1);
    w.dispatchEvent(Object.assign(new Event("storage"), { key: HAUNT_KEY }));
    expect(seen).toHaveBeenCalledTimes(2);
    stop();
    clearHaunt();
    expect(seen).toHaveBeenCalledTimes(2);
  });
});
