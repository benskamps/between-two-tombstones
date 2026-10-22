import { describe, expect, it } from "vitest";
import { LINK_FALLBACK, extraCemeteryOption, usableName } from "./picker";

// Review 4, #3: a cemetery from a link whose names fail to load showed
// "The cemetery from your last tour / Q216344". K2: the link's ?name= is a
// stranger's text, so it is never an input here at all.
describe("the picker row for a cemetery that isn't a sample", () => {
  it("names a link's cemetery from its loaded burials and says it came from the link", () => {
    expect(extraCemeteryOption({ loaded: "Arlington National Cemetery", fromLink: true })).toEqual({
      label: "Arlington National Cemetery",
      detail: "From your link",
    });
  });

  it("until then, or if they fail, says so plainly: never an ID", () => {
    expect(extraCemeteryOption({ fromLink: true })).toEqual({ label: LINK_FALLBACK, detail: "From your link" });
    expect(extraCemeteryOption({ loaded: "Q216344", fromLink: true })).toEqual({ label: LINK_FALLBACK, detail: "From your link" });
    for (const o of [extraCemeteryOption({ loaded: " q216344 ", fromLink: true }), extraCemeteryOption({ loaded: "Q1", fromLink: false })]) {
      expect(`${o.label} ${o.detail}`).not.toMatch(/\bQ\d+\b/i);
    }
  });

  it("says “Your haunt” for the haunt, even when the link also names it", () => {
    expect(extraCemeteryOption({ haunt: { name: "Lake View Cemetery", place: "Seattle" }, fromLink: false })).toEqual({
      label: "Lake View Cemetery",
      detail: "Your haunt · Seattle",
    });
    expect(extraCemeteryOption({ haunt: { name: "Lake View Cemetery" }, fromLink: true }).detail).toBe("Your haunt");
    expect(extraCemeteryOption({ loaded: "Lake View Cemetery", haunt: { name: "Lake View Cemetery" }, fromLink: true }).label).toBe("Lake View Cemetery");
  });

  it("never says the cemetery came from a tour", () => {
    for (const o of [extraCemeteryOption({ fromLink: true }), extraCemeteryOption({ haunt: { name: "X Cemetery" }, fromLink: false })]) {
      expect(`${o.label} ${o.detail}`).not.toMatch(/tour/i);
    }
  });

  it("usableName drops blanks and IDs", () => {
    expect(usableName(" Oakland Cemetery ")).toBe("Oakland Cemetery");
    for (const bad of [null, undefined, "", "  ", "Q2008469"]) expect(usableName(bad)).toBeNull();
  });
});
