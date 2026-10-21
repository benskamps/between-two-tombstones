import { describe, expect, it } from "vitest";
import { isSlowFailure, parsePeopleParam, slowFailure, stillLoadingText } from "./big";
import { userMessageFor } from "./errors";

describe("big cemetery that timed out (review pass 2, N1)", () => {
  it("only a Wikidata timeout gets the retry; an outage keeps its Gate 8 copy", () => {
    expect(isSlowFailure("Wikidata", "timeout")).toBe(true);
    expect(isSlowFailure("Wikidata", "unreachable")).toBe(false);
    expect(isSlowFailure("Wikidata", "rate-limited")).toBe(false);
    expect(isSlowFailure("Wikipedia", "timeout")).toBe(false);
    expect(userMessageFor("Wikidata", "unreachable")).toBe("Couldn't reach Wikidata. Try again in a minute, or open a saved tour.");
  });

  it("says how big, with the count from the near list", () => {
    expect(stillLoadingText(4359)).toBe("Still loading. This cemetery is big (4,359 people listed).");
    expect(stillLoadingText(null)).toMatch(/^Still loading\./);
    expect(stillLoadingText(30)).not.toContain("big");
  });

  it("blames the size, not Wikidata, when the retry also times out", () => {
    expect(slowFailure(4359)).toEqual({
      title: "This cemetery is big",
      message: "This cemetery is big and Wikidata didn't answer in time. Try again in a minute.",
    });
    expect(slowFailure(null).message).toBe("This cemetery is big and Wikidata didn't answer in time. Try again in a minute.");
    // A small one isn't called big.
    expect(slowFailure(30).message).not.toContain("big");
  });

  it("reads n from the tour link", () => {
    expect(parsePeopleParam("4359")).toBe(4359);
    expect(parsePeopleParam(["1415", "2"])).toBe(1415);
    for (const bad of [undefined, "", "0", "-3", "12a", "1e3", "99999999"]) expect(parsePeopleParam(bad), String(bad)).toBeNull();
  });
});
