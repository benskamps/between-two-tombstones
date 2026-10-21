// The app's one palette (decision 18): the Gravitator's Victorian half-mourning
// mauve on crepe black, grown into the whole app. Dark only.
//
// app/globals.css carries these values as CSS variables on :root (the hex
// literals live there and here, nowhere else); app/gravitator/gravitator.css
// only aliases them. palette.test.ts checks the CSS matches this file and that
// every pair below reaches its WCAG contrast.

export const TOKENS = [
  "bg",
  "surface",
  "surface-2",
  "border",
  "text",
  "muted",
  "mauve",
  "mauve-ink",
  "candle",
  "lichen",
  "ash",
  "wisp",
  "danger",
  "focus",
] as const;
export type Token = (typeof TOKENS)[number];

export const PALETTE: Record<Token, string> = {
  bg: "#130F15", // crepe black: the page
  surface: "#1D1720", // cards, header, bottom nav
  "surface-2": "#2A2130", // chips, rows inside cards
  border: "#43364B", // hairlines and card outlines only (decorative; see UI_PAIRS)
  text: "#F1EADF", // bone
  muted: "#D2C8D6", // captions, hints (raised for sunlight; never the only carrier of needed info)
  mauve: "#D6BAE6", // half-mourning mauve: primary actions, links (lightened for sunlight, REVIEW-2 #8)
  "mauve-ink": "#1A1220", // text on any light fill (mauve, candle, lichen, ash, wisp)
  candle: "#E2AD4B", // warm highlight
  lichen: "#C3DBB6", // living things (lightened for sunlight)
  ash: "#8E8794", // control boundaries (fields), the Gravitator's pass tint
  wisp: "#86E3D3", // phosphor / ectoplasm glow for instruments
  danger: "#FFB3AA", // errors (lightened for sunlight)
  focus: "#86E3D3", // focus ring (the wisp's glow)
};

/** The CSS variable each token lives in on :root (Tailwind's `muted` reads --text-muted). */
export const CSS_VAR: Record<Token, string> = {
  bg: "--bg",
  surface: "--surface",
  "surface-2": "--surface-2",
  border: "--border",
  text: "--text",
  muted: "--text-muted",
  mauve: "--mauve",
  "mauve-ink": "--mauve-ink",
  candle: "--candle",
  lichen: "--lichen",
  ash: "--ash",
  wisp: "--wisp",
  danger: "--danger",
  focus: "--focus",
};

/**
 * Surfaces the CSS mixes from two tokens with `color-mix(in srgb, A p%, B)`.
 * Text sits on these too, so the test checks pairs on them as well.
 */
export const MIXED: Record<string, { a: Token; b: Token; p: number; where: string }> = {
  instrument: { a: "surface", b: "wisp", p: 92, where: ".instrument panels (spirit box, séance, EVP, party code)" },
  "lit-lichen": { a: "surface-2", b: "lichen", p: 86, where: "--lit-lichen: a found bingo square" },
  "lit-candle": { a: "surface-2", b: "candle", p: 86, where: "--lit-candle: the free square, today in the almanac" },
};

type Surface = Token | keyof typeof MIXED;

/**
 * Every text-on-background pair the UI renders, as [text, background, where]: ≥ 4.5:1.
 * Ash and border are never text. A new pair here is a new test.
 */
export const TEXT_PAIRS: [Token, Surface, string][] = [
  ["text", "bg", "page text, headings"],
  ["text", "surface", "cards, header, bottom nav, match dialog"],
  ["text", "surface-2", "chips, rows, error box"],
  ["text", "instrument", "instrument panel text"],
  ["muted", "bg", "hints and captions on the page"],
  ["muted", "surface", "card captions, inactive nav labels"],
  ["muted", "surface-2", "chip captions"],
  ["muted", "instrument", "instrument captions"],
  ["mauve", "bg", "links on the page"],
  ["mauve", "surface", "links, active nav, verified line"],
  ["mauve", "surface-2", "links inside chips and rows"],
  ["candle", "bg", "warm highlights"],
  ["candle", "surface", "warm highlights on cards"],
  ["candle", "surface-2", "warm highlights in rows"],
  ["lichen", "bg", "living-thing accents"],
  ["lichen", "surface", "living-thing accents on cards"],
  ["lichen", "surface-2", "living-thing accents in rows"],
  ["wisp", "bg", "readouts"],
  ["wisp", "surface", "readouts on cards"],
  ["wisp", "instrument", "readouts on instrument panels"],
  ["danger", "bg", "error text"],
  ["danger", "surface", "error text on cards"],
  ["danger", "surface-2", "error text in rows"],
  ["danger", "instrument", "Stop and error text on the instrument panel"],
  ["lichen", "instrument", "\"Turn it off near mourners.\" on the panel"],
  ["mauve", "instrument", "links on the panel"],
  ["text", "lit-lichen", "a found bingo square's label"],
  ["text", "lit-candle", "R.I.P. on the free square, today's almanac entry"],
  ["muted", "lit-candle", "month and weekday on today's almanac entry"],
  ["candle", "lit-candle", "today's date in the almanac"],
  ["mauve", "lit-candle", "\"Read their story\" on today's almanac entry"],
  ["mauve-ink", "mauve", "primary pill buttons, Save, Use my location"],
  ["mauve-ink", "candle", "Go now, Start a tour here"],
  ["mauve-ink", "lichen", "the SAVE stamp while dragging right"],
  ["mauve-ink", "ash", "the PASS stamp while dragging left"],
  ["mauve-ink", "wisp", "a lit instrument control"],
];

/**
 * Boundaries someone needs to see to find or use a control: ≥ 3:1 (WCAG 1.4.11).
 * `border` (#43364B) is not here on purpose: it outlines cards and draws
 * dividers that never identify a control on their own, and fields and
 * controls take `ash` instead (globals.css gives every text field an ash edge).
 */
export const UI_PAIRS: [Token, Surface, string][] = [
  ["ash", "bg", "text field edge on the page, an unfound bingo square on the board"],
  ["ash", "surface", "text field edge on a card"],
  ["ash", "surface-2", "text field edge in a row"],
  ["mauve", "bg", "primary pill fill on the page"],
  ["mauve", "surface", "primary pill fill on a card, active radio edge"],
  ["mauve", "surface-2", "selected option edge"],
  ["candle", "surface", "candle pill fill on a card"],
  ["focus", "bg", "focus ring on the page"],
  ["focus", "surface", "focus ring on a card"],
  ["focus", "surface-2", "focus ring in a row"],
  ["focus", "instrument", "focus ring on an instrument panel"],
  ["wisp", "instrument", "instrument glow edge"],
  ["mauve", "instrument", "knob rims and the primary pill on the panel"],
  ["ash", "instrument", "knob tracks and fields on the panel"],
  ["danger", "bg", "the Stop pill's edge"],
  ["lichen", "lit-lichen", "a found bingo square's edge, glyph and sprout"],
  ["candle", "lit-candle", "the free square's edge and candle"],
  ["candle", "lit-lichen", "a completed line's edge on a found square"],
];

/** color-mix(in srgb, a p%, b): straight interpolation of the sRGB components. */
export function mixHex(a: string, b: string, p: number): string {
  const parse = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [parse(a), parse(b)];
  const out = x.map((v, i) => Math.round((v * p + y[i] * (100 - p)) / 100));
  return `#${out.map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

/** The color of a token or a mixed surface. */
export function colorOf(name: Surface): string {
  if (name in PALETTE) return PALETTE[name as Token];
  const m = MIXED[name];
  return mixHex(PALETTE[m.a], PALETTE[m.b], m.p);
}
