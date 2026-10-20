"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "Tours", match: (p: string) => p === "/" || p.startsWith("/cemetery") || p.startsWith("/near") || p.startsWith("/search") },
  { href: "/stamp", label: "Stamp Kit", match: (p: string) => p.startsWith("/stamp") },
  { href: "/spirit", label: "Spirit Box", match: (p: string) => p.startsWith("/spirit") },
  { href: "/games", label: "Games", match: (p: string) => p.startsWith("/games") },
];

export function BottomNav() {
  const pathname = usePathname() ?? "/";
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto grid max-w-2xl grid-cols-4">
        {ITEMS.map((item) => {
          const active = item.match(pathname);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`tap flex h-14 items-center justify-center text-sm font-bold ${
                  active ? "text-accent underline decoration-2 underline-offset-4" : "text-muted"
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
