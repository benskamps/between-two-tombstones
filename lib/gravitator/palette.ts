// The Gravitator palette: Victorian half-mourning (mauve, lavender, grey) on
// crepe black, the app's candle for Go now, a will-o'-the-wisp glow for
// matches. app/gravitator/gravitator.css carries the same values as CSS
// variables on the route's root wrapper; palette.test.ts checks they match and
// that every text pair we use reaches WCAG 4.5:1 in both themes.

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
] as const;
export type Token = (typeof TOKENS)[number];

export const NIGHT: Record<Token, string> = {
  bg: "#130F15", // crepe black
  surface: "#1D1720",
  "surface-2": "#2A2130",
  border: "#43364B",
  text: "#F1EADF", // bone
  muted: "#B9AEBF",
  mauve: "#C7A2DC", // half-mourning mauve: primary, Save, match
  "mauve-ink": "#1A1220",
  candle: "#E2AD4B", // the app's accent: Go now
  lichen: "#A3C293", // save-direction drag tint
  ash: "#8E8794", // pass-direction drag tint
  wisp: "#86E3D3", // will-o'-the-wisp: the match glow only
};

export const DAY: Record<Token, string> = {
  bg: "#FAF6F1",
  surface: "#FFFFFF",
  "surface-2": "#F0E9F2",
  border: "#8E8297",
  text: "#151018",
  muted: "#463E4C",
  mauve: "#5E3474",
  "mauve-ink": "#FFFFFF",
  candle: "#7A4A00",
  lichen: "#2F5626",
  ash: "#57505C",
  wisp: "#0F6E62",
};

/**
 * Every text-on-background pair the Gravitator UI renders, as [text, background, where].
 * Keep in sync with the components: a new pair here is a new test.
 */
export const TEXT_PAIRS: [Token, Token, string][] = [
  ["text", "bg", "page text, headings"],
  ["text", "surface", "card name and facts, match dialog"],
  ["text", "surface-2", "chips, saved list rows, error box"],
  ["muted", "bg", "hints and captions on the page"],
  ["muted", "surface", "card captions, credits"],
  ["muted", "surface-2", "chip captions"],
  ["mauve", "bg", "links on the page"],
  ["mauve", "surface", "links and the verified line on cards"],
  ["mauve", "surface-2", "links inside chips and the saved list"],
  ["mauve-ink", "mauve", "Save, Use my location, primary buttons"],
  ["mauve-ink", "candle", "Go now and Start a tour here"],
  ["mauve-ink", "lichen", "the SAVE stamp while dragging right"],
  ["mauve-ink", "ash", "the PASS stamp while dragging left"],
];
