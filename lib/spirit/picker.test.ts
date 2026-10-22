import { describe, expect, it } from "vitest";
import { LINK_FALLBACK, extraCemeteryOption, usableName } from "./picker";

// Review 4, #3: a cemetery from a link whose names fail to load showed
// "The cemetery from your last tour / Q216344".
describe("the picker row for a cemetery that isn't a sample", () => {
  it("names a link's cemetery from ?name= and says it came from the link", () => {
    expect(extraCemeteryOption({ link: { name: "Arlington National Cemetery", place: "Arlington, Virginia" } })).toEqual({
      label: "Arlington National Cemetery",
      detail: "From your link · Arlington, Virginia",
    });
    expect(extraCemeteryOption({ link: { name: "Arlington National Cemetery" } })).toEqual({
      label: "Arlington National Cemetery",
      detail: "From your link",
    });
  });

  it("prefers the name its burials came back with", () => {
    expect(extraCemeteryOption({ loaded: "Arlington National Cemetery", link: { name: "Arlington" } }).label).toBe("Arlington National Cemetery");
  });

  it("never shows an ID as a name: a plain fallback instead", () => {
    expect(extraCemeteryOption({ link: {} })).toEqual({ label: LINK_FALLBACK, detail: "From your link" });
    expect(extraCemeteryOption({ loaded: "Q216344", link: { name: "Q216344" } })).toEqual({ label: LINK_FALLBACK, detail: "From your link" });
    expect(extraCemeteryOption({ link: { place: "Arlington, Virginia" } })).toEqual({ label: LINK_FALLBACK, detail: "Arlington, Virginia" });
    for (const o of [extraCemeteryOption({ link: { name: " q216344 " } }), extraCemeteryOption({ loaded: "Q1" })]) {
      expect(`${o.label} ${o.detail}`).not.toMatch(/\bQ\d+\b/i);
    }
  });

  it("says “Your haunt” for the haunt, even when the link also names it", () => {
    expect(extraCemeteryOption({ haunt: { name: "Lake View Cemetery", place: "Seattle" } })).toEqual({
      label: "Lake View Cemetery",
      detail: "Your haunt · Seattle",
    });
    expect(extraCemeteryOption({ link: { name: "Lake View Cemetery" }, haunt: { name: "Lake View Cemetery" } }).detail).toBe("Your haunt");
  });

  it("never says the cemetery came from a tour", () => {
    for (const o of [extraCemeteryOption({ link: {} }), extraCemeteryOption({ haunt: { name: "X Cemetery" } })]) {
      expect(`${o.label} ${o.detail}`).not.toMatch(/tour/i);
    }
  });

  it("usableName drops blanks and IDs", () => {
    expect(usableName(" Oakland Cemetery ")).toBe("Oakland Cemetery");
    for (const bad of [null, undefined, "", "  ", "Q2008469"]) expect(usableName(bad)).toBeNull();
  });
});
