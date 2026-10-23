"use client";

import Link from "next/link";
import { useState } from "react";
import { BingoGlyph } from "@/components/games/BingoGlyph";
import { SymbolPair } from "@/components/ui/Motifs";
import { Candle, Chisel, EpitaphRiddle, Fern, HourglassSprout, PassportSeal, Planchette, Sprout } from "@/components/ui/symbols";

type FeaturedGrave = {
  qid: string;
  name: string;
  dates: string;
  age: string;
  cemeteryQid: string;
  cemeteryName: string;
  shortPlace: string;
  place: string;
  role: string;
  world: string;
  story: string;
  tags: string[];
  symbols: { death: string; life: string };
};

const FEATURED_GRAVES: FeaturedGrave[] = [
  {
    qid: "Q181667",
    name: "Washington Irving",
    dates: "Apr 3, 1783 – Nov 28, 1859",
    age: "aged 76",
    cemeteryQid: "Q360779",
    cemeteryName: "Sleepy Hollow Cemetery",
    shortPlace: "Sleepy Hollow",
    place: "Sleepy Hollow, NY",
    role: "Author of “The Legend of Sleepy Hollow” and “Rip Van Winkle”",
    world: "Their world: the first telegraph message (1844)",
    story:
      "After writing the tale that made Sleepy Hollow famous across the world, he bought a cottage beside the Hudson and asked to be buried on the hill above the Old Dutch Church.",
    tags: ["Famous", "Gone 100+ years"],
    symbols: { death: "draped-urn", life: "ivy" },
  },
  {
    qid: "Q173540",
    name: "Margaret Mitchell",
    dates: "Nov 8, 1900 – Aug 16, 1949",
    age: "aged 48",
    cemeteryQid: "Q2008469",
    cemeteryName: "Oakland Cemetery",
    shortPlace: "Oakland (Atlanta)",
    place: "Atlanta, GA",
    role: "Novelist and reporter for The Atlanta Journal Sunday Magazine",
    world: "Their world: first powered flight at Kitty Hawk (1903) · U.S. women’s suffrage (1920) · World War II (1939–1945)",
    story:
      "Born in Atlanta, she wrote hundreds of Sunday newspaper sketches before spending a decade drafting Gone with the Wind at a small sewing table while recovering from an ankle injury.",
    tags: ["Famous", "Notable death"],
    symbols: { death: "weeping-willow", life: "laurel-wreath" },
  },
  {
    qid: "Q484265",
    name: "Andrew Carnegie",
    dates: "Nov 25, 1835 – Aug 11, 1919",
    age: "aged 83",
    cemeteryQid: "Q360779",
    cemeteryName: "Sleepy Hollow Cemetery",
    shortPlace: "Sleepy Hollow",
    place: "Sleepy Hollow, NY",
    role: "Telegraph messenger, steel industrialist, and builder of 2,509 public libraries",
    world: "Died during the 1918 flu pandemic · Lived from the first telegraph (1844) to World War I (1914–1918)",
    story:
      "His stone on the Sleepy Hollow ridge is carved with a Celtic cross from Scotland, a few steps from the quiet corner where Washington Irving rests.",
    tags: ["Famous", "Gone 100+ years"],
    symbols: { death: "draped-urn", life: "ivy" },
  },
];

const FIELD_INSTRUMENTS = [
  {
    href: "/stamp",
    badge: "Make a keepsake",
    title: "Stamp Kit & Stone Reader",
    body: "Turn a headstone photo into a keepsake, or get help reading a worn inscription.",
    icon: Fern,
    accent: "text-candle",
  },
  {
    href: "/spirit",
    badge: "Listen together",
    title: "Spirit Box & Multi-Phone Séance",
    body: "Hear names from the cemetery through radio static. Invite friends to listen together.",
    icon: Planchette,
    accent: "text-wisp",
  },
  {
    href: "/games/bingo",
    badge: "Look for the details",
    title: "Tombstone Bingo & Party",
    body: "Find the willows, wings, and hourglasses carved into the stones. Play alone or with friends.",
    icon: HourglassSprout,
    accent: "text-lichen",
  },
  {
    href: "/games/whoami",
    badge: "Follow the clues",
    title: "Who Am I?",
    body: "Three clues. One life. Can you put a name to the story?",
    icon: EpitaphRiddle,
    accent: "text-mauve",
  },
  {
    href: "/games/stonemath",
    badge: "Read between the dates",
    title: "Stone Math Decoder",
    body: "Unravel the years, months, and days on an old stone to find a birth date.",
    icon: Chisel,
    accent: "text-candle",
  },
  {
    href: "/p",
    badge: "Pocket Almanac",
    title: "Graveyard Passport",
    body: "Keep the places, graves, and discoveries from your walks, privately on your phone.",
    icon: PassportSeal,
    accent: "text-lichen",
  },
] as const;

export function HomeShowcase() {
  const [activeIdx, setActiveIdx] = useState(0);
  const grave = FEATURED_GRAVES[activeIdx];

  return (
    <div className="space-y-8" data-testid="home-showcase">
      {/* 5-second interactive hook: sample a real headstone story right from the couch */}
      <section aria-labelledby="sample-grave-heading" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2 px-1">
          <div>
            <p className="label text-candle">Not at a graveyard yet?</p>
            <h2 id="sample-grave-heading" className="font-display text-2xl leading-tight">
              Read a stone right now
            </h2>
          </div>
          <span className="label text-muted">3 iconic stops</span>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Sample graves">
          {FEATURED_GRAVES.map((g, i) => {
            const active = i === activeIdx;
            return (
              <button
                key={g.qid}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveIdx(i)}
                className={`btn shrink-0 px-3.5 text-sm ${active ? "btn-candle" : "btn-ghost"}`}
              >
                {g.name}
              </button>
            );
          })}
        </div>

        <article
          key={grave.qid}
          className="arch arch-rule materialize space-y-3 !px-4 !pb-4 !pt-6"
          data-style="carved"
          data-century={grave.tags.includes("Gone 100+ years") ? "true" : undefined}
        >
          <header className="space-y-1 text-center">
            <SymbolPair
              className="justify-center"
              death={<BingoGlyph id={grave.symbols.death} className="h-6 w-6" />}
              life={<BingoGlyph id={grave.symbols.life} className="h-6 w-6" />}
            />
            <p className="label text-muted">
              {grave.cemeteryName} · {grave.place}
            </p>
            <h3 className="font-display text-3xl leading-tight tracking-wide">{grave.name}</h3>
            <p className="font-bold">
              <span className="whitespace-nowrap">{grave.dates}</span>{" "}
              <span className="font-normal text-muted">· {grave.age}</span>
            </p>
            <p className="text-sm text-muted">{grave.role}</p>
          </header>

          <ul className="flex flex-wrap justify-center gap-1.5">
            {grave.tags.map((t) => (
              <li key={t} className="rounded-full border border-border bg-surface-2 px-3 py-0.5 text-xs font-bold text-accent">
                {t}
              </li>
            ))}
          </ul>

          <p className="rounded-lg border border-border bg-bg/60 px-3 py-2 text-xs text-muted">{grave.world}</p>

          <p className="text-[0.975rem] leading-relaxed">{grave.story}</p>

          <div className="flex flex-wrap gap-2 border-t border-border pt-3">
            <Link href={`/cemetery/${grave.cemeteryQid}`} className="btn btn-primary flex-1 text-sm">
              Walk {grave.shortPlace} (80 graves)
            </Link>
            <Link href={`/spirit?cemetery=${grave.cemeteryQid}`} className="btn btn-ghost text-sm">
              Spirit Box here
            </Link>
          </div>
        </article>
      </section>

      {/* Why go to a graveyard? The 6 field instruments */}
      <section aria-labelledby="instruments-heading" className="space-y-3">
        <div className="space-y-1 px-1">
          <p className="label text-wisp">Pocket Field Kit</p>
          <h2 id="instruments-heading" className="font-display text-2xl leading-tight">
            Six reasons to walk the stones
          </h2>
          <p className="text-sm text-muted">
            Every cemetery becomes an outdoor museum, a darkroom, and a late-night instrument panel.
          </p>
        </div>

        <ul className="grid gap-3 sm:grid-cols-2">
          {FIELD_INSTRUMENTS.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="card tap group flex h-full flex-col justify-between gap-3 p-4 transition-transform active:scale-[0.985]"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="tool-medallion tool-medallion-sm">
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className={`label text-[11px] ${item.accent}`}>{item.badge}</span>
                    </div>
                    <h3 className="font-display text-xl leading-snug group-hover:text-mauve">{item.title}</h3>
                    <p className="text-sm leading-relaxed text-muted">{item.body}</p>
                  </div>
                  <span className="inline-flex items-center gap-1 text-sm font-bold text-mauve">
                    Open tool <span aria-hidden="true">→</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="card flex items-center gap-3 border-lichen/40 bg-lit-lichen p-3.5 text-sm">
          <Sprout className="h-5 w-5 shrink-0 text-lichen" />
          <p>
            <strong className="text-lichen">Built for the living and the dead:</strong> recent burials (within 25 years)
            always render in a quiet, respectful plain style, and the Spirit Box only speaks names of people gone 75+
            years.
          </p>
        </div>
      </section>
    </div>
  );
}

/**
 * Compact 1-tap instant launch strip for people opening the app away from a cemetery:
 * sits inside the top screen without pushing the Doors below the fold.
 */
export function InstantHauntRibbon() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-muted">
      <span className="inline-flex items-center gap-1 font-bold text-candle">
        <Candle className="h-3.5 w-3.5" animate />
        On the couch?
      </span>
      <span>Step straight into</span>
      <Link href="/cemetery/Q360779" className="font-bold text-mauve underline underline-offset-4">
        Sleepy Hollow
      </Link>
      <span>or</span>
      <Link href="/cemetery/Q2008469" className="font-bold text-mauve underline underline-offset-4">
        Oakland (Atlanta)
      </Link>
    </div>
  );
}
