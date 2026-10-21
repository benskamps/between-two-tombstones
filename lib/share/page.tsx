// The shared body of the four share routes (app/s/**): read and check the
// link, load its data once, then the page, its metadata and its two images.
// A malformed link, a takedown or a person Wikidata doesn't list at that
// cemetery is a 404 in the app's own not-found page, never a crash.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ShareLanding } from "@/components/share/ShareLanding";
import type { CardFormat } from "./card";
import { shareImage } from "./image";
import { parseShare, type ShareKind, type ShareRef } from "./links";
import { loadShare } from "./load";
import { shareMetadata } from "./metadata";

type Segments = { cemetery?: string; person?: string; room?: string };
type Search = Record<string, string | string[] | undefined>;

/** The link's ref, or null when any part is malformed. ?b= (a séance's bank hash) is the only query read. */
export async function readShareRef(kind: ShareKind, params: Promise<Segments>, searchParams?: Promise<Search>): Promise<ShareRef | null> {
  const segments = await params;
  const b = kind === "seance" && searchParams ? (await searchParams).b : undefined;
  return parseShare(kind, { ...segments, bank: typeof b === "string" ? b : null });
}

export async function shareGenerateMetadata(ref: ShareRef | null): Promise<Metadata> {
  if (!ref) return { title: "Page not found", robots: { index: false } };
  // Request time: the data is cached separately, and a failed load must never be stored as the page.
  await connection();
  return shareMetadata(ref, await loadShare(ref));
}

export async function SharePage({ shareRef }: { shareRef: ShareRef | null }) {
  if (!shareRef) notFound();
  await connection();
  const load = await loadShare(shareRef);
  if (load.status === "not-found") notFound();
  return <ShareLanding shareRef={shareRef} load={load} />;
}

export async function shareImageFor(kind: ShareKind, params: Promise<Segments>, format: CardFormat): Promise<Response> {
  const ref = await readShareRef(kind, params);
  await connection();
  return shareImage(kind, ref ? await loadShare(ref) : null, format);
}

/** og:image:alt for each kind (the image route's `alt`; the words on the card are in the page's description too). */
export const SHARE_IMAGE_ALT: Record<ShareKind, string> = {
  stop: "A headstone card: the person's name, dates and age, and the cemetery",
  tour: "A cemetery tour card: the cemetery, how many people are listed and the first three stops",
  seance: "A séance invite: the room code and the cemetery",
  party: "A graveyard party invite: the room code and the cemetery",
};
