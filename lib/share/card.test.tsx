import { describe, expect, it } from "vitest";
import { ImageResponse } from "next/og";
import oakland from "@/data/snapshots/oakland-atlanta.json";
import type { CemeterySnapshot } from "@/lib/types";
import { CARD_SIZE, CardImage, cardVariant, clip, type CardFormat } from "./card";
import { shareFonts } from "./fonts";
import type { ShareKind } from "./links";
import { roomCard, stopCard, tourCard, type ShareCard } from "./model";

const OAK = oakland as CemeterySnapshot;
const NOW = new Date("2026-10-21T00:00:00Z");

function pngSize(buf: ArrayBuffer): { width: number; height: number } {
  const b = new Uint8Array(buf);
  expect([...b.slice(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const v = new DataView(buf);
  return { width: v.getUint32(16), height: v.getUint32(20) };
}

const CASES: [string, ShareKind, ShareCard | null, string][] = [
  ["an old grave", "stop", stopCard(OAK.cemetery, OAK.people, "Q173540", NOW), "carved"],
  ["a recent death", "stop", stopCard(OAK.cemetery, OAK.people, "Q3302990", NOW), "plain"],
  ["a tour", "tour", tourCard(OAK.cemetery, OAK.people, NOW), "tour"],
  ["a séance", "seance", roomCard("seance", "KXMPRT", OAK.cemetery, OAK.people), "room"],
  ["an unnamed party", "party", roomCard("party", "KXMPRT", null, []), "room"],
  ["an outage", "tour", null, "generic"],
];

describe("share cards", () => {
  it.each(CASES)("%s draws at both sizes", async (_name, kind, card, variant) => {
    expect(cardVariant(card)).toBe(variant);
    const fonts = await shareFonts();
    for (const format of ["og", "story"] as CardFormat[]) {
      const res = new ImageResponse(<CardImage card={card} kind={kind} format={format} />, { ...CARD_SIZE[format], fonts });
      expect(pngSize(await res.arrayBuffer())).toEqual(CARD_SIZE[format]);
    }
  });

  it("clips long lines at a word", () => {
    expect(clip("American author and journalist", 60)).toBe("American author and journalist");
    expect(clip("American lawyer, politician and the forty-ninth governor of Georgia", 40)).toBe("American lawyer, politician and the…");
  });
});
