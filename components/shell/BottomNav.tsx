"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ToolIcon, type ToolId } from "@/components/ui/tools";
import { useHaunt } from "@/lib/haunt/useHaunt";

type Item = { href: string; label: string; tool: ToolId; match: (p: string) => boolean };

/** Where the kit's tools live: the Kit tab stays lit on all of them, and on the haunt's hub. */
const KIT_PATHS = ["/kit", "/cemetery", "/stamp", "/spirit", "/games", "/calendar"];

/**
 * One nav for the whole night (decision 29): find a graveyard, the ones you
 * matched, the kit for the one you picked, and what you kept.
 */
const NAV: Item[] = [
  { href: "/gravitator", label: "Swipe", tool: "gravitator", match: (p) => p.startsWith("/gravitator") && !p.startsWith("/gravitator/saved") },
  { href: "/gravitator/saved", label: "Matches", tool: "saved", match: (p) => p.startsWith("/gravitator/saved") },
  { href: "/kit", label: "Kit", tool: "haunt", match: (p) => KIT_PATHS.some((k) => p === k || p.startsWith(`${k}/`)) },
  { href: "/p", label: "Passport", tool: "passport", match: (p) => p === "/p" },
];

export function BottomNav() {
  const pathname = usePathname() ?? "/";
  // The haunt lives on the phone: the Kit tab wears a lock once the phone says there's none.
  const locked = useHaunt() === null;
  return (
    <nav
      aria-label="Main"
      className="nav-dock fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto grid max-w-2xl grid-cols-4">
        {NAV.map((item) => {
          const active = item.match(pathname);
          const lock = locked && item.href === "/kit";
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                title={lock ? "Opens once you pick a graveyard" : undefined}
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
                <span className="relative">
                  <ToolIcon tool={item.tool} className="h-5 w-5" />
                  {lock && (
                    <svg
                      aria-hidden="true"
                      data-testid="kit-lock"
                      viewBox="0 0 24 24"
                      className="absolute -right-2.5 -bottom-1 h-3 w-3"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                    >
                      <rect x="5" y="11" width="14" height="9" rx="2" />
                      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                    </svg>
                  )}
                </span>
                {/* Title case: four labels in Michroma capitals don't fit a 390 px phone ("PASSPORT" clipped). */}
                <span
                  className={`whitespace-nowrap font-label text-[13px] tracking-[0.02em] ${
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
