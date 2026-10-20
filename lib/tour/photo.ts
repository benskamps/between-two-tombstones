// Grave-photo sanity check. Wikidata's P1442 is sometimes wrong: Margaret
// Mitchell at Oakland Cemetery points to "Margaret Ann Mitchell Tombstone,
// Hiland Cemetery, 2015-08-17, 01.jpg", another woman's stone elsewhere.
// When the file title names a cemetery that shares no significant word with
// the cemetery we're touring, don't show it as their grave. Conservative: a
// title that names no cemetery passes unchanged.

import type { Person } from "@/lib/types";

const CEMETERY_WORD = /^(cemetery|cemetary|cem\.?|graveyard|churchyard)$/i;

/** Words that don't identify a particular cemetery. */
const STOP = new Set([
  "cemetery", "cemetary", "cem", "graveyard", "churchyard", "the", "of", "and", "at", "in", "a",
  "old", "new", "city", "town", "village", "county", "memorial", "park", "gardens", "garden",
  "burial", "ground", "grounds", "national", "public", "st", "saint", "grave", "tomb", "tombstone",
  "headstone", "gravestone", "gravesite", "monument", "marker", "jpg", "jpeg", "png",
  "cimetiere", "cimitero", "cementerio", "friedhof", "du", "de", "la", "le", "del", "der",
]);

/** Decoded file title from a Commons Special:FilePath URL (or a bare file name). */
export function fileTitle(url: string): string {
  const raw = url.split("Special:FilePath/")[1] ?? url.split("/").pop() ?? url;
  let title = raw.split(/[?#]/)[0];
  try {
    title = decodeURIComponent(title);
  } catch {
    // Keep the raw text.
  }
  return title.replace(/_/g, " ");
}

const significant = (words: string[]) =>
  words
    .flatMap((w) => w.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[-'’.]+/))
    .map((w) => w.replace(/[^a-z0-9]/g, ""))
    .filter((w) => w.length > 1 && !STOP.has(w) && !/^\d+$/.test(w));

/**
 * The cemetery names a file title mentions, as lists of significant words:
 * up to 4 words before "Cemetery"/"Cem."/"Graveyard"/"Churchyard", within one
 * comma- or bracket-separated part of the title.
 */
export function cemeteriesNamedIn(title: string): string[][] {
  const out: string[][] = [];
  const noExt = title.replace(/\.[a-z0-9]{2,4}$/i, "");
  for (const part of noExt.split(/[,;()[\]]+/)) {
    const words = part.trim().split(/\s+/).filter(Boolean);
    words.forEach((w, i) => {
      if (!CEMETERY_WORD.test(w)) return;
      const name = significant(words.slice(Math.max(0, i - 4), i));
      if (name.length > 0) out.push(name);
    });
  }
  return out;
}

/** True when the grave photo's title names some other cemetery. */
export function graveImageNamesOtherCemetery(graveImage: string | null, cemeteryName: string): boolean {
  if (!graveImage) return false;
  const named = cemeteriesNamedIn(fileTitle(graveImage));
  if (named.length === 0) return false;
  const ours = new Set(significant(cemeteryName.split(/\s+/)));
  if (ours.size === 0) return false;
  return named.every((words) => !words.some((w) => ours.has(w)));
}

export type CardPhoto = { kind: "grave" | "portrait"; src: string } | null;

/** The photo a card shows: the grave photo when it passes, else the portrait (P18) when the grave photo was rejected. */
export function cardPhoto(p: Pick<Person, "graveImage" | "image">, cemeteryName: string | null): CardPhoto {
  if (!p.graveImage) return null;
  if (cemeteryName && graveImageNamesOtherCemetery(p.graveImage, cemeteryName)) {
    return p.image ? { kind: "portrait", src: p.image } : null;
  }
  return { kind: "grave", src: p.graveImage };
}

/** True when the person has a grave photo we'd actually show as their grave. */
export function hasTrustedGravePhoto(p: Pick<Person, "graveImage" | "image">, cemeteryName: string | null): boolean {
  return cardPhoto(p, cemeteryName)?.kind === "grave";
}
