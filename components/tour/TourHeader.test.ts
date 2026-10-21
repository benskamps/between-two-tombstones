import { describe, expect, it } from "vitest";
import { placeLine } from "./TourHeader";

describe("placeLine", () => {
  it("drops the place when the description already says it", () => {
    expect(placeLine("Atlanta", "cemetery in Atlanta, Georgia, USA")).toBe("cemetery in Atlanta, Georgia, USA");
  });
  it("keeps both when they say different things", () => {
    expect(placeLine("Sleepy Hollow", "rural cemetery in New York")).toBe("Sleepy Hollow · rural cemetery in New York");
  });
  it("handles either one missing", () => {
    expect(placeLine("Seattle", null)).toBe("Seattle");
    expect(placeLine(null, "cemetery")).toBe("cemetery");
    expect(placeLine(null, null)).toBeNull();
  });
});
