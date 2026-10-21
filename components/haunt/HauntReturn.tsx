"use client";

import Link from "next/link";
import { RingedMoon } from "@/components/ui/symbols";
import { hubHref } from "@/lib/haunt/haunt";
import { useHaunt } from "@/lib/haunt/useHaunt";

/** On the home page, once you have a haunt: the way back to it. */
export function HauntReturn() {
  const haunt = useHaunt();
  if (!haunt) return null;
  return (
    <section aria-labelledby="haunt-return" className="card bezel flex items-center gap-3 px-4 py-3" data-testid="haunt-return">
      <RingedMoon className="h-7 w-7 shrink-0 text-wisp" />
      <div className="min-w-0 flex-1">
        <h2 id="haunt-return" className="label text-muted">
          Your haunt
        </h2>
        <p className="truncate font-display text-xl">{haunt.name}</p>
      </div>
      <Link href={hubHref(haunt)} className="btn btn-primary shrink-0">
        Back to it
      </Link>
    </section>
  );
}
