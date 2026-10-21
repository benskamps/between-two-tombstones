"use client";

import Link from "next/link";
import { RingedMoon } from "@/components/ui/symbols";
import { hubHref, isFresh } from "@/lib/haunt/haunt";
import { useHaunt, useLastHaunt } from "@/lib/haunt/useHaunt";

/**
 * On the home page, the way back to your haunt (F10). `fresh` (set in the last
 * 12 hours) sits above the doors: you're probably still there. `stale` sits
 * under them as "Last time": you're probably somewhere new.
 */
export function HauntReturn({ when }: { when: "fresh" | "stale" }) {
  const fresh = useHaunt();
  const last = useLastHaunt();

  if (when === "fresh") {
    if (!fresh) return null;
    return (
      <section aria-labelledby="haunt-return" className="card bezel flex items-center gap-3 px-4 py-3" data-testid="haunt-return">
        <RingedMoon className="h-7 w-7 shrink-0 text-wisp" />
        <div className="min-w-0 flex-1">
          <h2 id="haunt-return" className="text-sm font-bold text-lichen">
            Your haunt
          </h2>
          <p className="truncate text-lg font-bold" title={fresh.name}>
            {fresh.name}
          </p>
        </div>
        <Link href={hubHref(fresh)} className="btn btn-primary shrink-0">
          Back to it
        </Link>
      </section>
    );
  }

  if (!last || isFresh(last)) return null;
  const day = new Date(last.at).toLocaleDateString(undefined, { weekday: "short" });
  return (
    <p className="text-center" data-testid="haunt-last">
      Last time: <span className="font-bold">{last.name}</span> ({day}) ·{" "}
      <Link href={hubHref(last)} className="tap inline-flex items-center font-bold text-mauve underline underline-offset-4">
        Back to it
      </Link>
    </p>
  );
}
