import { describe, expect, it } from "vitest";
import { BIG_NOTE_AFTER_MS, LONGEST_NOTE, LOADING_INTRO, SLOW_NOTE_AFTER_MS, slowLoadingNote, slowNoteDelay } from "./loading";

describe("the tour's loading screen (review pass 4, item 1)", () => {
  it("no longer promises a few seconds to everyone", () => {
    expect(LOADING_INTRO).not.toMatch(/This takes a few seconds/);
    expect(LOADING_INTRO).toMatch(/Most cemeteries take a few seconds the first time\.$/);
  });

  it("names the size when the link carries it, and comes sooner for a big one", () => {
    expect(slowLoadingNote(4359)).toBe("This cemetery is big (4,359 people listed), so the first load can take half a minute.");
    expect(slowNoteDelay(4359)).toBe(BIG_NOTE_AFTER_MS);
    expect(slowNoteDelay(200)).toBe(BIG_NOTE_AFTER_MS);
  });

  it("doesn't call a small cemetery big", () => {
    expect(slowLoadingNote(26)).toBe("Still loading. Wikidata or Wikipedia is slow right now; the first load can take half a minute.");
    expect(slowLoadingNote(26)).not.toMatch(/big/);
    expect(slowNoteDelay(26)).toBe(SLOW_NOTE_AFTER_MS);
  });

  it("without a count, says big ones are slow without claiming this one is", () => {
    expect(slowLoadingNote(null)).toBe("Still loading. A big cemetery’s first load can take half a minute.");
    expect(slowNoteDelay(null)).toBe(SLOW_NOTE_AFTER_MS);
  });

  it("reserves room for the longest line", () => {
    for (const n of [null, 1, 199, 200, 9_999_999]) expect(LONGEST_NOTE.length).toBeGreaterThanOrEqual(slowLoadingNote(n).length);
  });
});
