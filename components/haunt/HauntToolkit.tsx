"use client";

import Link from "next/link";
import { useSyncExternalStore, type ComponentType } from "react";
import { Candle, Comet, Fern, HourglassSprout, Moth, Planchette, RingedMoon, type SymbolProps } from "@/components/ui/symbols";
import { micAvailable } from "@/lib/games/evp";
import { cemeteryQuery } from "@/lib/haunt/haunt";
import type { Cemetery } from "@/lib/types";

type Tool = { href: string; title: string; body: string; icon: ComponentType<SymbolProps>; needsPeople?: boolean; needsMic?: boolean };

function tools(cemetery: Pick<Cemetery, "qid" | "name" | "locatedIn">): Tool[] {
  // Every link carries the cemetery, so the tool opens on it even when this phone can't store the haunt.
  const q = cemeteryQuery({ qid: cemetery.qid, name: cemetery.name, place: cemetery.locatedIn });
  return [
    { href: `/stamp?${q}`, title: "Stamp Kit", body: "A photo of a stone becomes a rubbing and two stamps.", icon: Fern },
    { href: `/spirit?${q}`, title: "Spirit Box", body: "Static and the names of people buried here.", icon: RingedMoon, needsPeople: true },
    { href: `/spirit?${q}#seance`, title: "Séance", body: "Every phone speaks the same names at once.", icon: Planchette, needsPeople: true },
    { href: `/games/bingo?${q}`, title: "Tombstone Bingo", body: "Spot carved symbols and learn what they mean.", icon: Comet },
    { href: `/games/party?${q}`, title: "Graveyard Party", body: "One link, the same bingo card on every phone.", icon: Candle },
    { href: `/games/evp?${q}`, title: "EVP Recorder", body: "Record the quiet, hear it backwards.", icon: Moth, needsMic: true },
    { href: `/calendar?${q}`, title: "Haunted Calendar", body: "Their death-days in your calendar, every year.", icon: HourglassSprout, needsPeople: true },
  ];
}

const noSubscribe = () => () => {};

/**
 * The haunt's hub: everything scoped to this cemetery, below its header. The
 * tour stays the main thing on the page. "Change haunt" goes back to the doors.
 */
export function HauntToolkit({ cemetery, people }: { cemetery: Pick<Cemetery, "qid" | "name" | "locatedIn">; people: number }) {
  // null on the server: the EVP tile appears only once the phone says it can record.
  const mic = useSyncExternalStore<boolean | null>(noSubscribe, micAvailable, () => null);
  const list = tools(cemetery).filter((t) => (!t.needsPeople || people > 0) && (!t.needsMic || mic === true));
  return (
    <section aria-labelledby="toolkit-title" className="card bezel space-y-3 p-4" data-testid="haunt-toolkit">
      <div className="flex items-center justify-between gap-3">
        <h2 id="toolkit-title" className="label text-lichen">
          Your haunt
        </h2>
        <Link href="/" className="tap label inline-flex items-center px-1 text-mauve underline underline-offset-4">
          Change haunt
        </Link>
      </div>
      <p className="text-sm text-muted">Tools for {cemetery.name}. The tour is below.</p>
      <ul className="grid grid-cols-2 gap-2">
        {list.map((t) => {
          const Icon = t.icon;
          return (
            <li key={t.title}>
              <Link
                href={t.href}
                title={t.body}
                className="tap flex h-full min-h-14 items-center gap-2.5 rounded-xl border border-border bg-surface-2 px-3 py-2"
              >
                <Icon className="h-5 w-5 shrink-0 text-mauve" />
                <span className="font-bold leading-tight">{t.title}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
