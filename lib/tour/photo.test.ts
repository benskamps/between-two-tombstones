import { describe, expect, it } from "vitest";
import oakland from "@/data/snapshots/oakland-atlanta.json";
import sleepyHollow from "@/data/snapshots/sleepy-hollow.json";
import type { CemeterySnapshot } from "@/lib/types";
import { cardPhoto, cemeteriesNamedIn, fileTitle, graveImageNamesOtherCemetery } from "./photo";

const MITCHELL_GRAVE =
  "http://commons.wikimedia.org/wiki/Special:FilePath/Margaret%20Ann%20Mitchell%20Tombstone%2C%20Hiland%20Cemetery%2C%202015-08-17%2C%2001.jpg";

describe("grave photo guard", () => {
  it("decodes the exact Margaret Mitchell file title", () => {
    expect(fileTitle(MITCHELL_GRAVE)).toBe("Margaret Ann Mitchell Tombstone, Hiland Cemetery, 2015-08-17, 01.jpg");
    expect(cemeteriesNamedIn(fileTitle(MITCHELL_GRAVE))).toEqual([["hiland"]]);
  });

  it("rejects it at Oakland Cemetery and shows her portrait instead", () => {
    expect(graveImageNamesOtherCemetery(MITCHELL_GRAVE, "Oakland Cemetery")).toBe(true);
    const mitchell = { ...(oakland as CemeterySnapshot).people.find((p) => p.qid === "Q173540")!, graveImage: MITCHELL_GRAVE };
    expect(mitchell.image).toBeTruthy();
    expect(cardPhoto(mitchell, "Oakland Cemetery")).toEqual({ kind: "portrait", src: mitchell.image });
    expect(cardPhoto({ ...mitchell, image: null }, "Oakland Cemetery")).toBeNull();
  });

  it("keeps it where the names agree", () => {
    expect(graveImageNamesOtherCemetery(MITCHELL_GRAVE, "Hiland Cemetery")).toBe(false);
    expect(graveImageNamesOtherCemetery("Special:FilePath/Grave%20at%20Oakland%20Cem.%20Atlanta.jpg", "Oakland Cemetery")).toBe(false);
    expect(graveImageNamesOtherCemetery("Special:FilePath/X%20grave%2C%20P%C3%A8re%20Lachaise%20Cemetery.jpg", "Cimetière du Père-Lachaise")).toBe(false);
  });

  it("passes titles that name no cemetery unchanged (all of Sleepy Hollow's, and Oakland's others)", () => {
    for (const snap of [oakland, sleepyHollow] as CemeterySnapshot[]) {
      for (const p of snap.people.filter((x) => x.graveImage && x.graveImage !== MITCHELL_GRAVE)) {
        expect(graveImageNamesOtherCemetery(p.graveImage, snap.cemetery.name), fileTitle(p.graveImage!)).toBe(false);
        expect(cardPhoto(p, snap.cemetery.name)).toEqual({ kind: "grave", src: p.graveImage });
      }
    }
  });

  it("handles names without a cemetery word, and missing photos", () => {
    expect(cemeteriesNamedIn("WashingtonIrvingGrave.jpg")).toEqual([]);
    expect(cemeteriesNamedIn("Andrew Carnegie Gravesite.JPG")).toEqual([]);
    expect(graveImageNamesOtherCemetery(null, "Oakland Cemetery")).toBe(false);
    expect(cardPhoto({ graveImage: null, image: "x" }, "Oakland Cemetery")).toBeNull();
  });
});
