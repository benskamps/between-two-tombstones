import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible, IM_Fell_English, Michroma } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { BottomNav } from "@/components/shell/BottomNav";
import { EtiquetteCard } from "@/components/shell/EtiquetteCard";
import { SiteFooter } from "@/components/shell/SiteFooter";
import { SiteHeader } from "@/components/shell/SiteHeader";
import { PALETTE } from "@/lib/palette";
import { SiteJsonLd } from "@/lib/seo/jsonld";
import { SITE } from "@/lib/site";
import "./globals.css";

// Three faces, Latin only, few weights. Body and buttons: Atkinson Hyperlegible
// (legibility outdoors wins). Names of the dead and big headings: IM Fell
// English, the carved half. Short labels and readouts: Michroma, a wide
// Microgramma-like space-age face (the instrument half), only via .label /
// .readout / font-label, uppercase and never under 12px.
const body = Atkinson_Hyperlegible({ variable: "--font-body", subsets: ["latin"], weight: ["400", "700"] });
const carved = IM_Fell_English({ variable: "--font-carved", subsets: ["latin"], weight: "400" });
const space = Michroma({ variable: "--font-space", subsets: ["latin"], weight: "400" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: SITE.name, template: `%s · ${SITE.name}` },
  description: SITE.description,
  applicationName: SITE.name,
};

export const viewport: Viewport = {
  // Dark only (decision 18): one theme color, and the browser's own UI stays dark.
  themeColor: PALETTE.bg,
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${body.variable} ${carved.variable} ${space.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <SiteJsonLd />
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
