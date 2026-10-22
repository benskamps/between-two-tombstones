"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { ToolTile, type ToolId } from "@/components/ui/tools";
import { micAvailable } from "@/lib/games/evp";
import type { Eligible } from "@/lib/haunt/eligibility";
import { cemeteryQuery } from "@/lib/haunt/haunt";
import type { Cemetery } from "@/lib/types";
import type { Hub } from "./useHub";

type Tool = { href: string; title: string; tool: ToolId; needs?: "spirit" | "calendar" | "mic" };

function tools(cemetery: Pick<Cemetery, "qid" | "name" | "locatedIn">): Tool[] {
  // Every link carries the cemetery, so the tool opens on it even when this phone can't store the haunt.
  const q = cemeteryQuery({ qid: cemetery.qid, name: cemetery.name, place: cemetery.locatedIn });
  return [
    { href: `/stamp?${q}`, title: "Stamp", tool: "stamp" },
    { href: `/spirit?${q}`, title: "Spirit", tool: "spirit", needs: "spirit" },
    { href: `/spirit?${q}#seance`, title: "Séance", tool: "seance", needs: "spirit" },
    { href: `/games/bingo?${q}`, title: "Bingo", tool: "bingo" },
    { href: `/games/party?${q}`, title: "Party", tool: "party" },
    { href: `/games/evp?${q}`, title: "EVP", tool: "evp", needs: "mic" },
    { href: `/calendar?${q}`, title: "Calendar", tool: "calendar", needs: "calendar" },
    { href: "/p", title: "Passport", tool: "passport" },
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
        <h2 id="toolkit-title" className="font-display text-2xl leading-tight">
          {hub.isHaunt ? "Your haunt" : `Tools at ${cemetery.name}`}
        </h2>
        {hub.isHaunt && (
          <Link href="/" className="tap inline-flex items-center px-1 text-mauve underline underline-offset-4">
            Change haunt
          </Link>
        )}
      </div>
      {/* Four to a row on a phone (nothing hidden off-screen), one row from 640px. */}
      <ul className="grid grid-cols-4 gap-1.5 sm:grid-cols-8">
        {list.map((t) => (
          <li key={t.title}>
            <ToolTile variant="chip" tool={t.tool} href={t.href} title={t.title} />
          </li>
        ))}
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
