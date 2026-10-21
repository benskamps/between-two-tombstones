import { beforeEach, describe, expect, it, vi } from "vitest";
import oakland from "@/data/snapshots/oakland-atlanta.json";
import { DataSourceError } from "@/lib/data/errors";
import type { CemeterySnapshot } from "@/lib/types";

const data = vi.hoisted(() => ({ loadCemetery: vi.fn() }));
vi.mock("@/lib/data/load", () => data);
const blocked = vi.hoisted(() => ({ ids: new Set<string>() }));
vi.mock("./blocked", () => ({ isBlocked: (...q: (string | null)[]) => q.some((x) => x !== null && blocked.ids.has(x)) }));

const { loadShare } = await import("./load");

const OAK = oakland as CemeterySnapshot;
const ok = (people = OAK.people) => ({ status: "ok", data: { ...OAK, people, origin: "live", warnings: [] } });
const down = () => ({ status: "error", error: new DataSourceError("Wikidata", "unreachable", "query.wikidata.org: fetch failed") });

beforeEach(() => {
  data.loadCemetery.mockReset();
  blocked.ids.clear();
});

describe("loadShare", () => {
  it("a stop loads through the tour's own loader", async () => {
    data.loadCemetery.mockResolvedValue(ok());
    const r = await loadShare({ kind: "stop", cemetery: "Q2008469", person: "Q173540" });
    expect(data.loadCemetery).toHaveBeenCalledWith("Q2008469");
    expect(r).toMatchObject({ status: "ok", card: { kind: "stop", name: "Margaret Mitchell" } });
  });

  it("a person Wikidata doesn't list at that cemetery is not found", async () => {
    data.loadCemetery.mockResolvedValue(ok());
    expect(await loadShare({ kind: "stop", cemetery: "Q2008469", person: "Q42" })).toEqual({ status: "not-found" });
  });

  it("a cemetery with no one listed has no tour to share", async () => {
    data.loadCemetery.mockResolvedValue(ok([]));
    expect(await loadShare({ kind: "tour", cemetery: "Q2008469" })).toEqual({ status: "not-found" });
    data.loadCemetery.mockResolvedValue({ status: "not-found", qid: "Q2008469" });
    expect(await loadShare({ kind: "tour", cemetery: "Q2008469" })).toEqual({ status: "not-found" });
  });

  it("a taken-down person or cemetery is not found, without loading anything", async () => {
    blocked.ids.add("Q173540");
    expect(await loadShare({ kind: "stop", cemetery: "Q2008469", person: "Q173540" })).toEqual({ status: "not-found" });
    blocked.ids.add("Q2008469");
    expect(await loadShare({ kind: "tour", cemetery: "Q2008469" })).toEqual({ status: "not-found" });
    expect(data.loadCemetery).not.toHaveBeenCalled();
  });

  it("an outage is named, not a 404", async () => {
    data.loadCemetery.mockResolvedValue(down());
    expect(await loadShare({ kind: "tour", cemetery: "Q872253" })).toMatchObject({ status: "error", source: "Wikidata", card: null });
  });

  it("a room still works when the cemetery can't be named", async () => {
    data.loadCemetery.mockResolvedValue(down());
    expect(await loadShare({ kind: "seance", cemetery: "Q872253", room: "KXMPRT", bank: null })).toMatchObject({
      status: "error",
      card: { kind: "seance", room: "KXMPRT", cemetery: null },
    });
    data.loadCemetery.mockResolvedValue({ status: "not-found", qid: "Q872253" });
    expect(await loadShare({ kind: "party", cemetery: "Q872253", room: "KXMPRT" })).toEqual({
      status: "ok",
      card: { kind: "party", room: "KXMPRT", cemetery: null },
    });
  });
});
