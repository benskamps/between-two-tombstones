import { describe, expect, it } from "vitest";
import { DataSourceError, TRY_AGAIN, errorText, failureFor, sentence, userMessageFor } from "./errors";

describe("failure messages (review 4, #3: one source name, one full stop)", () => {
  it("userMessageFor is what happened, then the tour's next step", () => {
    expect(userMessageFor("Wikidata", "unreachable")).toBe(`${failureFor("Wikidata", "unreachable")} ${TRY_AGAIN}`);
    expect(userMessageFor("Wikipedia", "rate-limited")).toBe("Wikipedia asked us to slow down. Try again in a minute, or open a saved tour.");
  });

  it("sentence ends in exactly one full stop", () => {
    expect(sentence("Couldn't reach Wikidata..")).toBe("Couldn't reach Wikidata.");
    expect(sentence("the server answered 500")).toBe("the server answered 500.");
    expect(sentence("  Still there?  ")).toBe("Still there?");
    expect(sentence("switched off (DISABLE_WIKIDATA=1).")).toBe("switched off (DISABLE_WIKIDATA=1).");
    expect(sentence("")).toBe("");
  });

  it("errorText names the source once", () => {
    const body = new DataSourceError("Wikidata", "unreachable", "x").toBody().error;
    expect(errorText(body.source, body.message)).toBe("Couldn't reach Wikidata. Try again in a minute, or open a saved tour.");
    expect(errorText(body.source, body.message, { nextStep: false })).toBe("Couldn't reach Wikidata.");
    // A message that doesn't name its outside source gets it in front, once.
    expect(errorText("Wikidata", "test outage")).toBe("Wikidata: test outage.");
    // Our own sources (the calendar) are not outside sources: no prefix.
    expect(errorText("Calendar", "That isn't a cemetery ID.")).toBe("That isn't a cemetery ID.");
    expect(errorText(null, "Couldn't reach Wikidata.")).toBe("Couldn't reach Wikidata.");
    for (const kind of ["unreachable", "timeout", "rate-limited", "bad-response"] as const) {
      const text = errorText("Wikidata", userMessageFor("Wikidata", kind), { nextStep: false });
      expect(text.match(/Wikidata/g)).toHaveLength(1);
      expect(text).not.toMatch(/\.\.|: [A-Z]/);
    }
  });
});
