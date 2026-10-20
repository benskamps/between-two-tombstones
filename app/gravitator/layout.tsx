import type { Viewport } from "next";
import "./gravitator.css";

// The Gravitator wears its own palette (half-mourning mauve on crepe black),
// scoped to this wrapper; see gravitator.css.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#130F15" },
    { media: "(prefers-color-scheme: light)", color: "#FAF6F1" },
  ],
};

export default function GravitatorLayout({ children }: LayoutProps<"/gravitator">) {
  return <div className="gravitator">{children}</div>;
}
