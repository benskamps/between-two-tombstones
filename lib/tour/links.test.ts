import { describe, expect, it } from "vitest";
import { commonsFilePage, commonsThumb, findAGraveCemeteryUrl, findAGraveUrl, THUMB_WIDTHS } from "./links";

describe("outbound links", () => {
  it("links the Find a Grave memorial from P535, else a name search", () => {
    expect(findAGraveUrl({ name: "Margaret Mitchell", death: "1949-08-16T00:00:00Z", deathPrecision: 11, findAGraveId: "718" })).toEqual({
      url: "https://www.findagrave.com/memorial/718",
      kind: "memorial",
    });
    const search = findAGraveUrl({ name: "Alfred Iverson, Jr.", death: "1911-03-31T00:00:00Z", deathPrecision: 11, findAGraveId: null });
    expect(search.kind).toBe("search");
    const u = new URL(search.url);
    expect(u.origin + u.pathname).toBe("https://www.findagrave.com/memorial/search");
    expect(Object.fromEntries(u.searchParams)).toEqual({ firstname: "Alfred", lastname: "Iverson", deathyear: "1911" });
    expect(findAGraveCemeteryUrl("35955")).toBe("https://www.findagrave.com/cemetery/35955");
  });

  it("builds https Commons thumbnails at standard widths only", () => {
    const src = "http://commons.wikimedia.org/wiki/Special:FilePath/WashingtonIrvingGrave.jpg";
    expect(commonsThumb(src)).toBe("https://commons.wikimedia.org/wiki/Special:FilePath/WashingtonIrvingGrave.jpg?width=500");
    expect(commonsThumb(src, 330)).toBe("https://commons.wikimedia.org/wiki/Special:FilePath/WashingtonIrvingGrave.jpg?width=330");
    expect(THUMB_WIDTHS).toEqual([120, 250, 330, 500, 960]);
    expect(commonsThumb("https://example.com/x.jpg")).toBeNull();
    expect(commonsThumb(null)).toBeNull();
    expect(commonsFilePage(src)).toBe("https://commons.wikimedia.org/wiki/File:WashingtonIrvingGrave.jpg");
  });
});
