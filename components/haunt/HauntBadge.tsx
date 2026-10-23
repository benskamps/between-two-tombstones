"use client";

import Link from "next/link";
import { hubHref } from "@/lib/haunt/haunt";
import { useHaunt } from "@/lib/haunt/useHaunt";

/** "Haunting: <cemetery>" (or "Ghost pass: <cemetery>") in the header, linking to its hub. Nothing until a fresh haunt is read on the phone. */
export function HauntBadge() {
  const haunt = useHaunt();
  if (!haunt) return null;
  return (
    <Link
      href={hubHref(haunt)}
      className="tap flex min-w-0 flex-1 flex-col items-end justify-center text-right leading-tight"
      data-testid="haunt-badge"
    >
      {/* A Ghost pass says so wherever the haunt shows: nobody should think you're really there. */}
      <span className={`text-sm whitespace-nowrap ${haunt.ghost ? "text-wisp" : "text-muted"}`}>{haunt.ghost ? "Ghost pass:" : "Haunting:"}</span>{" "}
      <span className="w-full truncate font-bold text-text" title={haunt.name}>
        {haunt.name}
      </span>
    </Link>
  );
}
