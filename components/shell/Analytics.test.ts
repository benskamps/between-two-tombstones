import { describe, expect, it } from "vitest";
import { stripEventUrl, withoutQuery } from "./Analytics";

describe("analytics never sends the query string or the hash", () => {
  it("keeps the origin and path only", () => {
    expect(withoutQuery("https://x.app/near?lat=33.74850&lon=-84.37330&acc=12")).toBe("https://x.app/near");
    expect(withoutQuery("https://x.app/cemetery/Q2008469?via=here&lat=33.749&lon=-84.373#stop-3")).toBe("https://x.app/cemetery/Q2008469");
    expect(withoutQuery("https://x.app/stamp#top")).toBe("https://x.app/stamp");
    expect(withoutQuery("https://x.app/")).toBe("https://x.app/");
  });

  it("keeps a custom event's name and data (share funnel, L5.4)", () => {
    // The insights script passes { type, url, payload } to beforeSend and reads the payload back.
    const event = { type: "event" as const, url: "https://x.app/gravitator?lat=33.75&lon=-84.37", payload: { name: "share_created", data: { kind: "stop", via: "copy" } } };
    expect(stripEventUrl(event)).toEqual({ type: "event", url: "https://x.app/gravitator", payload: { name: "share_created", data: { kind: "stop", via: "copy" } } });
    expect(stripEventUrl({ type: "pageview", url: "https://x.app/search?lat=1&lon=2" })).toEqual({ type: "pageview", url: "https://x.app/search" });
  });
});
