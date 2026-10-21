"use client";

import Link from "next/link";
import { hubHref } from "@/lib/haunt/haunt";
import { useHaunt } from "@/lib/haunt/useHaunt";

/** "Haunting: <cemetery>" in the header, linking to its hub. Nothing until the haunt is read on the phone. */
export function HauntBadge() {
  const haunt = useHaunt();
  if (!haunt) return null;
  return (
    <Link
      href={hubHref(haunt)}
      className="tap flex min-w-0 max-w-[50%] shrink-0 flex-col items-end justify-center text-right leading-tight"
      data-testid="haunt-badge"
    >
      <span className="label text-lichen">Haunting:</span>{" "}
      <span className="w-full truncate text-sm font-bold text-text">{haunt.name}</span>
    </Link>
  );
}
