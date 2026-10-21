/*
  The design system's React side. Its CSS is app/globals.css (tokens,
  primitives, then each tool's pieces); its colours are lib/palette.ts.

  Colour roles (REVIEW-3 #4), the same everywhere:
  - mauve:  you can act on it (buttons, links, the selected option, tool signs).
  - candle: light and warmth (the darkroom's safelight, R.I.P., dates, a lit line).
  - wisp:   a live instrument reading, only inside .instrument. Also the focus ring.
  - lichen: alive, found or kept (a found square, a pinned grave, birthdays, a
            saved tour, "Turn it off near mourners.").
  - bone, muted, ash: reading text, captions and quiet labels, control edges.

  Type: IM Fell for names and headings (never numbers); Atkinson for everything
  people read, digits and codes included; Michroma only for short, redundant
  labels and readouts (12 px or more).

  One primary (filled) button per screen; everything else is a ghost pill.

  What's here:
  - symbols.tsx   the line-art set; tools.tsx maps one sign to each tool (TOOL_ICON)
                  and draws tool tiles (ToolTile: chip or row).
  - Motifs.tsx    PageHeader (title + tool sign + life sign), SymbolPair, ArchFrame,
                  OrbitDivider, FenceDivider, MoonPhases, StepHeading, Specimen, Eyebrow.
  - Instrument.tsx  ReadoutStrip (one line: lamp, status, two values), SplitFlap
                  (codes), SweepDial, SpokenWord, countOf.
*/

export * from "./Instrument";
export * from "./Motifs";
export * from "./symbols";
export * from "./tools";
