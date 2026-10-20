import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible, IM_Fell_English } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { BottomNav } from "@/components/shell/BottomNav";
import { EtiquetteCard } from "@/components/shell/EtiquetteCard";
import { SiteFooter } from "@/components/shell/SiteFooter";
import { SiteHeader } from "@/components/shell/SiteHeader";
import { SITE } from "@/lib/site";
import "./globals.css";

// Body face chosen for legibility outdoors; the carved serif is for names only.
const body = Atkinson_Hyperlegible({ variable: "--font-body", subsets: ["latin"], weight: ["400", "700"] });
const carved = IM_Fell_English({ variable: "--font-carved", subsets: ["latin"], weight: "400" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: `${SITE.name}: ${SITE.subtitle}`, template: `%s · ${SITE.name}` },
  description: SITE.description,
  applicationName: SITE.name,
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0e110f" },
    { media: "(prefers-color-scheme: light)", color: "#fbf8f1" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${body.variable} ${carved.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <SiteHeader />
        <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-4 pb-28 pt-4">
          {children}
        </main>
        <SiteFooter />
        <BottomNav />
        <EtiquetteCard />
        <Analytics />
      </body>
    </html>
  );
}
