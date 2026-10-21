"use client";

import Link from "next/link";
import { useSyncExternalStore, type ComponentType } from "react";
import { Candle, Comet, Fern, HourglassSprout, Moth, Planchette, RingedMoon, type SymbolProps } from "@/components/ui/symbols";
import { micAvailable } from "@/lib/games/evp";
import type { Eligible } from "@/lib/haunt/eligibility";
import { cemeteryQuery } from "@/lib/haunt/haunt";
import type { Cemetery } from "@/lib/types";
import type { Hub } from "./useHub";

type Tool = { href: string; title: string; icon: ComponentType<SymbolProps>; needs?: "spirit" | "calendar" | "mic" };

function tools(cemetery: Pick<Cemetery, "qid" | "name" | "locatedIn">): Tool[] {
  // Every link carries the cemetery, so the tool opens on it even when this phone can't store the haunt.
  const q = cemeteryQuery({ qid: cemetery.qid, name: cemetery.name, place: cemetery.locatedIn });
  return [
    { href: `/stamp?${q}`, title: "Stamp", icon: Fern },
    { href: `/spirit?${q}`, title: "Spirit", icon: RingedMoon, needs: "spirit" },
    { href: `/spirit?${q}#seance`, title: "Séance", icon: Planchette, needs: "spirit" },
    { href: `/games/bingo?${q}`, title: "Bingo", icon: Comet },
    { href: `/games/party?${q}`, title: "Party", icon: Candle },
    { href: `/games/evp?${q}`, title: "EVP", icon: Moth, needs: "mic" },
    { href: `/calendar?${q}`, title: "Calendar", icon: HourglassSprout, needs: "calendar" },
  ];
}

const noSubscribe = () => () => {};

/**
 * The haunt's tools as compact icon chips (F1), below the first
 * stories. Spirit, Séance and Calendar only when someone here qualifies under
 * the respect rules (F14); otherwise one plain line says why.
 */
export function HauntToolkit({
  cemetery,
  eligible,
  hub,
}: {
  cemetery: Pick<Cemetery, "qid" | "name" | "locatedIn">;
  eligible: Eligible;
  hub: Pick<Hub, "isHaunt" | "other" | "makeHaunt">;
}) {
  // null on the server: the EVP chip appears only once the phone says it can record.
  const mic = useSyncExternalStore<boolean | null>(noSubscribe, micAvailable, () => null);
  const list = tools(cemetery).filter(
    (t) =>
      !t.needs ||
      (t.needs === "spirit" && eligible.spirit > 0) ||
      (t.needs === "calendar" && eligible.calendar > 0) ||
      (t.needs === "mic" && mic === true),
  );
  return (
    <section aria-labelledby="toolkit-title" className="card space-y-2 px-3 py-3" data-testid="haunt-toolkit">
      <div className="flex items-center justify-between gap-3 px-1">
        <h2 id="toolkit-title" className="font-bold text-lichen">
          {hub.isHaunt ? "Your haunt" : `Tools at ${cemetery.name}`}
        </h2>
        {hub.isHaunt && (
          <Link href="/" className="tap inline-flex items-center px-1 text-mauve underline underline-offset-4">
            Change haunt
          </Link>
        )}
      </div>
      {hub.other && (
        <div className="flex flex-wrap items-center gap-2 px-1" data-testid="make-haunt">
          <p className="min-w-0 flex-1 text-sm">
            Your haunt is <span className="font-bold">{hub.other.name}</span>.
          </p>
          <button type="button" onClick={hub.makeHaunt} className="btn btn-primary">
            Make this my haunt
          </button>
        </div>
      )}
      {/* Four to a row on a phone (nothing hidden off-screen), one row from 640px. */}
      <ul className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">
        {list.map((t) => {
          const Icon = t.icon;
          return (
            <li key={t.title}>
              <Link
                href={t.href}
                className="tap flex h-full flex-col items-center justify-center gap-0.5 rounded-xl border border-border bg-surface-2 px-1 py-1.5 text-sm font-bold"
              >
                <Icon className="h-5 w-5 text-mauve" />
                {t.title}
              </Link>
            </li>
          );
        })}
      </ul>
      {eligible.spirit === 0 && (
        <p className="px-1 text-sm">No one listed here died 75 or more years ago, so there are no names for the spirit box or a séance.</p>
      )}
      {eligible.calendar === 0 && (
        <p className="px-1 text-sm">No one listed here died 25 or more years ago with a full date, so there&rsquo;s no calendar.</p>
      )}
    </section>
  );
}
