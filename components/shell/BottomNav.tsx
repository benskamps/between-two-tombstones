"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import { Comet, Fern, Gate, Lily, Moth, Planchette, RingedMoon, type SymbolProps } from "@/components/ui/symbols";
import { hubHref, type Haunt } from "@/lib/haunt/haunt";
import { useHaunt } from "@/lib/haunt/useHaunt";

type Item = { href: string; label: string; icon: ComponentType<SymbolProps>; match: (p: string) => boolean };

/** Without a haunt: the ways in, and the graves you saved in the Gravitator. */
const DOORS: Item[] = [
  { href: "/", label: "Search", icon: Gate, match: (p) => p === "/" || p.startsWith("/search") || p.startsWith("/near") },
  { href: "/gravitator", label: "Gravitator", icon: Moth, match: (p) => p.startsWith("/gravitator") && !p.startsWith("/gravitator/saved") },
  { href: "/gravitator/saved", label: "Saved", icon: Lily, match: (p) => p.startsWith("/gravitator/saved") },
];

/** With a haunt: its hub and its tools. The hub has the way back to the doors ("Change haunt"). */
function hauntItems(h: Haunt): Item[] {
  return [
    { href: hubHref(h), label: "Haunt", icon: RingedMoon, match: (p) => p.startsWith("/cemetery") },
    { href: "/stamp", label: "Stamp", icon: Fern, match: (p) => p.startsWith("/stamp") },
    { href: "/spirit", label: "Spirit", icon: Planchette, match: (p) => p.startsWith("/spirit") },
    { href: "/games", label: "Games", icon: Comet, match: (p) => p.startsWith("/games") },
  ];
}

export function BottomNav() {
  const pathname = usePathname() ?? "/";
  // The server can't know the haunt: it renders the doors, and the phone swaps in the haunt's tools.
  const haunt = useHaunt();
  const items = haunt ? hauntItems(haunt) : DOORS;
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]"
    >
      <ul className={`mx-auto grid max-w-2xl ${items.length === 4 ? "grid-cols-4" : "grid-cols-3"}`}>
        {items.map((item) => {
          const active = item.match(pathname);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`tap flex h-16 flex-col items-center justify-center gap-1 ${active ? "text-mauve" : "text-muted"}`}
              >
                <Icon className="h-5 w-5" />
                <span
                  className={`whitespace-nowrap font-label text-xs uppercase tracking-[0.08em] ${
                    active ? "underline decoration-2 underline-offset-4" : ""
                  }`}
                >
                  {item.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
