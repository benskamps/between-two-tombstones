import { afterEach, describe, expect, it, vi } from "vitest";
import { addSaved, getSaved, parseSaved, removeSaved, resetSavedMemory, SAVED_KEY } from "./saved";

const g = (qid: string, name = qid) => ({ qid, name, place: null, lat: 33.75, lon: -84.37, image: null });

afterEach(() => {
  vi.unstubAllGlobals();
  resetSavedMemory();
});

describe("parseSaved", () => {
  it("keeps valid entries and drops junk", () => {
    const raw = JSON.stringify([
      { ...g("Q1"), savedAt: "2026-10-20T00:00:00Z" },
      { qid: "not-a-qid", name: "x", lat: 1, lon: 1 },
      { qid: "Q2", name: "no coords" },
      null,
    ]);
    expect(parseSaved(raw).map((s) => s.qid)).toEqual(["Q1"]);
    expect(parseSaved("{not json")).toEqual([]);
    expect(parseSaved(null)).toEqual([]);
  });
});

describe("saved store", () => {
  it("works from memory when storage is blocked (private mode)", () => {
    vi.stubGlobal("localStorage", {
      getItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("blocked");
      },
    });
    addSaved(g("Q1", "Oakland Cemetery"));
    addSaved(g("Q2", "Westview Cemetery"));
    expect(getSaved().map((s) => s.name)).toEqual(["Westview Cemetery", "Oakland Cemetery"]);
    removeSaved("Q1");
    expect(getSaved().map((s) => s.qid)).toEqual(["Q2"]);
  });

  it("writes to localStorage, newest first, without duplicates", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
    });
    addSaved(g("Q1"));
    addSaved(g("Q2"));
    addSaved(g("Q1"));
    expect(JSON.parse(store.get(SAVED_KEY)!).map((s: { qid: string }) => s.qid)).toEqual(["Q1", "Q2"]);
    // Same raw string → same array (useSyncExternalStore needs a stable snapshot).
    expect(getSaved()).toBe(getSaved());
  });
});
