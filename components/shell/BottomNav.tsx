"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ToolIcon, type ToolId } from "@/components/ui/tools";
import { hubHref, type Haunt } from "@/lib/haunt/haunt";
import { useHaunt } from "@/lib/haunt/useHaunt";

type Item = { href: string; label: string; tool: ToolId; match: (p: string) => boolean };

/** Without a haunt: the ways in, and the graves you saved in the Gravitator. */
const DOORS: Item[] = [
  { href: "/", label: "Explore", tool: "search", match: (p) => p === "/" || p.startsWith("/search") || p.startsWith("/near") },
  { href: "/gravitator", label: "Gravitator", tool: "gravitator", match: (p) => p.startsWith("/gravitator") && !p.startsWith("/gravitator/saved") },
  { href: "/gravitator/saved", label: "Saved", tool: "saved", match: (p) => p.startsWith("/gravitator/saved") },
];

/** With a haunt: its hub and its tools. The hub has the way back to the doors ("Change haunt"). */
function hauntItems(h: Haunt): Item[] {
  return [
    { href: hubHref(h), label: "Haunt", tool: "haunt", match: (p) => p.startsWith("/cemetery") },
    { href: "/stamp", label: "Stamp", tool: "stamp", match: (p) => p.startsWith("/stamp") },
    { href: "/spirit", label: "Spirit", tool: "spirit", match: (p) => p.startsWith("/spirit") },
    { href: "/games", label: "Games", tool: "games", match: (p) => p.startsWith("/games") },
  ];
}

export function BottomNav() {
  const pathname = usePathname() ?? "/";
  // The server can't know the haunt (it lives on the phone). Until it's read,
  // the bar keeps its height with no tabs, so it doesn't flip from the doors'
  // tabs to the haunt's on every load (F25).
  const haunt = useHaunt();
  const items = haunt === undefined ? null : haunt ? hauntItems(haunt) : DOORS;
  return (
    <nav
      aria-label="Main"
      className="nav-dock fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]"
    >
      {items === null ? (
        <div className="h-16" aria-hidden="true" />
      ) : (
        <ul className={`mx-auto grid max-w-2xl ${items.length === 4 ? "grid-cols-4" : "grid-cols-3"}`}>
          {items.map((item) => {
            const active = item.match(pathname);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`tap relative flex h-16 flex-col items-center justify-center gap-1 transition-colors ${
                    active ? "text-mauve" : "text-muted hover:text-text"
                  }`}
                >
                  {active && (
                    <span
                      aria-hidden="true"
                      className="nav-pill-active pointer-events-none absolute top-1.5 h-1 w-7 rounded-full"
                    />
                  )}
                  <ToolIcon tool={item.tool} className="h-5 w-5" />
                  <span
                    className={`whitespace-nowrap font-label text-[13px] uppercase tracking-[0.05em] ${
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
      )}
    </nav>
  );
}
