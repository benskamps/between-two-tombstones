// The share cards, drawn by next/og (Satori: flexbox and a subset of CSS; every
// box with more than one child says display: flex, and an absolute box needs
// an explicit width: left + right doesn't stretch it). Two formats: "og" is
// the 1200×630 link preview, "story" the 1080×1920 image for stories.
//
// The look is the app's: crepe black, bone, mauve, candle, lichen, wisp
// (lib/palette.ts); a headstone arch with its inner rule; a thin double rule
// round the edge; the ringed moon. IM Fell for names, Atkinson for numbers
// and dates, Michroma for short labels. The plain card (recent or unknown
// deaths, lib/respect.ts) drops every ornament: no arch, no glyphs, no moon,
// no stars, no space-age labels.

import type { CSSProperties, ReactNode } from "react";
import { Candle, Fern, HourglassSprout, Key, Lily, Moth, Poppy, RingedMoon, Sprout, type SymbolProps } from "@/components/ui/symbols";
import { PALETTE, colorOf, mixHex } from "@/lib/palette";
import { OG_FONT } from "./fonts";
import type { ShareKind } from "./links";
import { peopleListed, type GlyphName, type RoomCard, type ShareCard, type StopCard, type TourCard } from "./model";

export type CardFormat = "og" | "story";
export const CARD_SIZE: Record<CardFormat, { width: number; height: number }> = {
  og: { width: 1200, height: 630 },
  story: { width: 1080, height: 1920 },
};

const C = {
  bg: PALETTE.bg,
  surface: PALETTE.surface,
  border: PALETTE.border,
  text: PALETTE.text,
  muted: PALETTE.muted,
  mauve: PALETTE.mauve,
  candle: PALETTE.candle,
  lichen: PALETTE.lichen,
  ash: PALETTE.ash,
  wisp: PALETTE.wisp,
  instrument: colorOf("instrument"),
  // The inner rules: mauve 35% into the hairline, as .arch-rule does in globals.css.
  rule: mixHex(PALETTE.mauve, PALETTE.border, 35),
  flapEdge: mixHex(PALETTE.wisp, PALETTE.border, 35),
  flapSplit: mixHex(PALETTE.bg, PALETTE.border, 70),
  panelEdge: mixHex(PALETTE.wisp, PALETTE.border, 40),
};

const GLYPH: Record<GlyphName | "sprout" | "key", (p: SymbolProps) => ReactNode> = {
  "hourglass-sprout": HourglassSprout,
  fern: Fern,
  candle: Candle,
  poppy: Poppy,
  moth: Moth,
  lily: Lily,
  "ringed-moon": RingedMoon,
  sprout: Sprout,
  key: Key,
};

/** One of the app's line-art signs in a fixed colour and size. */
function Sign({ name, size, color, stroke = 1.5 }: { name: keyof typeof GLYPH; size: number; color: string; stroke?: number }) {
  const Icon = GLYPH[name];
  return <Icon width={size} height={size} stroke={color} strokeWidth={stroke} style={{ color }} className="" />;
}

function abs(left: number, top: number, width?: number, height?: number): CSSProperties {
  return { position: "absolute", left, top, ...(width === undefined ? {} : { width }), ...(height === undefined ? {} : { height }), display: "flex" };
}

/** Bigger type for shorter text: [max characters, size] steps, then `min`. */
function fit(text: string, steps: [number, number][], min: number): number {
  const n = Array.from(text).length;
  for (const [maxChars, size] of steps) if (n <= maxChars) return size;
  return min;
}

/** At most `max` characters, cut at a word, with an ellipsis. */
export function clip(text: string, max: number): string {
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  const cut = chars.slice(0, max).join("");
  const at = cut.lastIndexOf(" ");
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[\s,;:.–-]+$/, "")}…`;
}

const label = (size: number, color: string = C.muted): CSSProperties => ({
  fontFamily: OG_FONT.space,
  fontSize: size,
  letterSpacing: size * 0.18,
  color,
});
const carved = (size: number, color: string = C.text): CSSProperties => ({
  fontFamily: OG_FONT.carved,
  fontSize: size,
  color,
  lineHeight: 1.06,
  textAlign: "center",
  textShadow: "0 -2px 0 rgba(0,0,0,0.55), 0 2px 0 rgba(255,255,255,0.12)",
});
const body = (size: number, color: string = C.muted, bold = false): CSSProperties => ({
  fontFamily: OG_FONT.body,
  fontWeight: bold ? 700 : 400,
  fontSize: size,
  color,
  lineHeight: 1.25,
});

// ---------------------------------------------------------------- the frame

const STARS: [number, number, number, string][] = [
  [0.06, 0.2, 2, C.text],
  [0.14, 0.62, 1.5, C.muted],
  [0.22, 0.12, 2, C.wisp],
  [0.33, 0.8, 1.5, C.mauve],
  [0.71, 0.1, 1.5, C.text],
  [0.78, 0.7, 2, C.mauve],
  [0.88, 0.42, 1.5, C.text],
  [0.93, 0.86, 2, C.wisp],
  [0.47, 0.06, 1.5, C.muted],
  [0.6, 0.9, 1.5, C.text],
];

type Geometry = { W: number; H: number; og: boolean; inset: number };

function geometry(format: CardFormat): Geometry {
  const { width: W, height: H } = CARD_SIZE[format];
  const og = format === "og";
  return { W, H, og, inset: og ? 18 : 36 };
}

/**
 * The page every ornamented card sits on: crepe black with a faint glow at
 * the top, a few stars, the thin double rule, the wordmark top left and the
 * ringed moon top right (the brand).
 */
function Frame({ g, tint = C.mauve, bare = false, children }: { g: Geometry; tint?: string; bare?: boolean; children: ReactNode }) {
  const { W, H, og, inset } = g;
  const rule = (i: number): CSSProperties => ({ ...abs(i, i, W - i * 2, H - i * 2) });
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        width: W,
        height: H,
        backgroundColor: C.bg,
        backgroundImage: `radial-gradient(ellipse 90% 70% at 50% -10%, ${tint}26, ${C.bg}00 70%)`,
      }}
    >
      {STARS.map(([x, y, r, color], i) => (
        <div key={i} style={{ ...abs(x * W, y * H, r * 2, r * 2), borderRadius: r, backgroundColor: color, opacity: 0.7 }} />
      ))}
      <div style={{ ...rule(inset), border: `1.5px solid ${C.border}`, borderRadius: 18 }} />
      <div style={{ ...rule(inset + 7), border: `1px solid ${C.rule}`, borderRadius: 12 }} />
      {!bare && <div style={{ ...abs(og ? 54 : 84, og ? 50 : 96), ...label(og ? 15 : 26, C.mauve) }}>BETWEEN TWO TOMBSTONES</div>}
      {!bare && (
        <div style={abs(W - (og ? 48 : 80) - (og ? 84 : 150), og ? 36 : 80)}>
          <Sign name="ringed-moon" size={og ? 84 : 150} color={C.candle} stroke={1.1} />
        </div>
      )}
      {children}
    </div>
  );
}

/** The ground the stones stand on, with a sprout at each end: life at the foot of the stones. */
function Ground({ g, y }: { g: Geometry; y: number }) {
  const inset = g.og ? 40 : 70;
  const s = g.og ? 34 : 52;
  return (
    <>
      <div style={{ ...abs(inset, y, g.W - inset * 2, 1.5), backgroundColor: C.ash, opacity: 0.8 }} />
      <div style={abs(inset + 20, y - s)}>
        <Sign name="sprout" size={s} color={C.lichen} />
      </div>
      <div style={abs(g.W - inset - 20 - s, y - s)}>
        <Sign name="sprout" size={s} color={C.lichen} />
      </div>
    </>
  );
}

/** A headstone: an arch-topped stone with the inner rule, standing on the ground (open at the foot). */
function ArchStone({ x, y, w, h, shoulder, padTop, children }: { x: number; y: number; w: number; h: number; shoulder: number; padTop: number; children: ReactNode }) {
  const d = 12;
  const outer = `M1 ${h} L1 ${shoulder} A ${w / 2 - 1} ${shoulder - 1} 0 0 1 ${w - 1} ${shoulder} L${w - 1} ${h}`;
  const inner = `M${d} ${h} L${d} ${shoulder} A ${w / 2 - d} ${shoulder - d} 0 0 1 ${w - d} ${shoulder} L${w - d} ${h}`;
  return (
    <div style={abs(x, y, w, h)}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ position: "absolute", left: 0, top: 0 }}>
        <path d={`${outer} Z`} fill={C.surface} stroke="none" />
        <path d={outer} fill="none" stroke={C.border} strokeWidth={2} />
        <path d={inner} fill="none" stroke={C.rule} strokeWidth={1.5} />
      </svg>
      <div
        style={{
          ...abs(0, 0, w, h),
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          paddingTop: padTop,
          paddingBottom: d * 2,
          paddingLeft: 44,
          paddingRight: 44,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function GlyphPair({ death, life, size }: { death: GlyphName; life: GlyphName; size: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: size * 0.35 }}>
      <Sign name={death} size={size} color={C.mauve} />
      <div style={{ width: size * 0.14, height: size * 0.14, borderRadius: size, backgroundColor: C.ash }} />
      <Sign name={life} size={size} color={C.lichen} />
    </div>
  );
}

/** A hairline with a small ringed moon in the middle (the app's orbit divider). */
function OrbitRule({ size, width, top }: { size: number; width: number; top: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: top }}>
      <div style={{ width, height: 1, backgroundColor: C.rule }} />
      <Sign name="ringed-moon" size={size} color={C.mauve} stroke={1.3} />
      <div style={{ width, height: 1, backgroundColor: C.rule }} />
    </div>
  );
}

function Caption({ g, y, children }: { g: Geometry; y: number; children: ReactNode }) {
  return (
    <div style={{ ...abs(0, y, g.W), justifyContent: "center" }}>
      <div style={body(g.og ? 22 : 34)}>{children}</div>
    </div>
  );
}

function pad2(n: number, total: number): string {
  return String(n).padStart(Math.max(2, String(total).length), "0");
}

// ---------------------------------------------------------------- stop

function CarvedStop({ card, g }: { card: StopCard; g: Geometry }) {
  const { W, H, og } = g;
  const archW = og ? 700 : 920;
  const archTop = og ? 56 : 380;
  const groundY = og ? H - 50 : H - 220;
  const nameSize = og ? fit(card.name, [[14, 80], [20, 68], [28, 56], [40, 48]], 42) : fit(card.name, [[14, 112], [20, 96], [28, 80], [40, 68]], 58);
  const where = card.cemetery.place ? `${card.cemetery.name}, ${card.cemetery.place}` : card.cemetery.name;
  return (
    <Frame g={g}>
      <ArchStone x={(W - archW) / 2} y={archTop} w={archW} h={groundY - archTop} shoulder={og ? 150 : 240} padTop={og ? 40 : 60}>
        {card.glyphs && <GlyphPair death={card.glyphs.death} life={card.glyphs.life} size={og ? 40 : 72} />}
        <div style={{ ...label(og ? 16 : 28), marginTop: og ? 12 : 34 }}>{`STOP ${pad2(card.stop, card.total)} / ${card.total}`}</div>
        <div style={{ ...carved(nameSize), marginTop: og ? 8 : 26 }}>{card.name}</div>
        {card.dates && <div style={{ ...body(og ? 32 : 52, C.candle, true), marginTop: og ? 12 : 34, textAlign: "center" }}>{card.dates}</div>}
        {card.age && <div style={{ ...body(og ? 26 : 42), marginTop: og ? 2 : 8 }}>{card.age}</div>}
        {card.description && (
          <div style={{ ...body(og ? 23 : 38), marginTop: og ? 10 : 40, textAlign: "center", maxWidth: archW - 120 }}>
            {clip(card.description, og ? 58 : 90)}
          </div>
        )}
        <OrbitRule size={og ? 22 : 38} width={og ? 70 : 130} top={og ? 16 : 60} />
        <div style={{ ...carved(og ? 30 : 60), marginTop: og ? 8 : 28 }}>{og ? where : card.cemetery.name}</div>
        {!og && card.cemetery.place && <div style={{ ...body(40), marginTop: 12 }}>{card.cemetery.place}</div>}
      </ArchStone>
      <Ground g={g} y={groundY} />
      {!og && (
        <Caption g={g} y={groundY + 70}>
          A stop on the tour, from Wikidata and Wikipedia
        </Caption>
      )}
    </Frame>
  );
}

/** Recent or unknown death: a plain stone-coloured card with the facts and nothing else. */
function PlainStop({ card, g }: { card: StopCard; g: Geometry }) {
  const { W, H, og } = g;
  const nameSize = og ? fit(card.name, [[16, 72], [24, 62], [34, 52]], 44) : fit(card.name, [[16, 100], [24, 86], [34, 72]], 60);
  const m = og ? 44 : 80;
  return (
    <div style={{ display: "flex", width: W, height: H, backgroundColor: C.bg }}>
      <div
        style={{
          ...abs(m, m, W - m * 2, H - m * 2),
          flexDirection: "column",
          justifyContent: "center",
          backgroundColor: C.surface,
          border: `1.5px solid ${C.border}`,
          borderRadius: 24,
          padding: og ? 64 : 90,
        }}
      >
        <div style={{ fontFamily: OG_FONT.carved, fontSize: nameSize, lineHeight: 1.08, color: C.text }}>{card.name}</div>
        {card.dates && <div style={{ ...body(og ? 32 : 48, C.text, true), marginTop: og ? 20 : 40 }}>{card.dates}</div>}
        {card.age && <div style={{ ...body(og ? 28 : 42), marginTop: 4 }}>{card.age}</div>}
        <div style={{ height: 1, backgroundColor: C.border, marginTop: og ? 36 : 70, marginBottom: og ? 28 : 60 }} />
        <div style={body(og ? 30 : 46, C.text, true)}>{card.cemetery.name}</div>
        {card.cemetery.place && <div style={{ ...body(og ? 26 : 40), marginTop: 4 }}>{card.cemetery.place}</div>}
        <div style={{ ...body(og ? 22 : 34), marginTop: og ? 40 : 90 }}>Between Two Tombstones</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- tour

function Tour({ card, g }: { card: TourCard; g: Geometry }) {
  const { W, H, og } = g;
  const groundY = og ? H - 50 : H - 220;
  const titleSize = og ? fit(card.cemetery.name, [[14, 78], [22, 64], [32, 54]], 46) : fit(card.cemetery.name, [[14, 116], [22, 98], [32, 80]], 68);
  // One box (Satori lays a fragment out as its own row).
  const heading = (
    <div style={{ display: "flex", flexDirection: "column", alignItems: og ? "flex-start" : "center" }}>
      <div style={label(og ? 17 : 28)}>A CEMETERY TOUR</div>
      <div style={{ ...carved(titleSize), textAlign: og ? "left" : "center", marginTop: og ? 14 : 30 }}>{card.cemetery.name}</div>
      {card.cemetery.place && <div style={{ ...body(og ? 28 : 44), marginTop: og ? 10 : 18 }}>{card.cemetery.place}</div>}
      <div style={{ ...body(og ? 36 : 56, C.candle, true), marginTop: og ? 26 : 46 }}>{peopleListed(card.people)}</div>
    </div>
  );
  const names =
    card.top.length > 0 ? (
      card.top.map((t) => (
        <div key={t.name} style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: og ? 14 : 44 }}>
          <div style={carved(og ? fit(t.name, [[18, 36], [26, 31]], 27) : fit(t.name, [[18, 64], [26, 54]], 46))}>{t.name}</div>
          {t.years && <div style={{ ...body(og ? 21 : 36, C.candle), marginTop: 2 }}>{t.years}</div>}
        </div>
      ))
    ) : (
      <div style={{ ...body(og ? 26 : 40), marginTop: 30, textAlign: "center" }}>Their stories, from Wikipedia</div>
    );
  return (
    <Frame g={g}>
      {og ? (
        <div style={{ ...abs(72, 90, 560, groundY - 110), flexDirection: "column", justifyContent: "center" }}>{heading}</div>
      ) : (
        <div style={{ ...abs(80, 270, W - 160), flexDirection: "column", alignItems: "center" }}>{heading}</div>
      )}
      <ArchStone
        x={og ? 676 : 110}
        y={og ? 120 : 840}
        w={og ? 450 : 860}
        h={groundY - (og ? 120 : 840)}
        shoulder={og ? 120 : 220}
        padTop={og ? 30 : 100}
      >
        <Sign name="lily" size={og ? 34 : 64} color={C.lichen} />
        <div style={{ ...label(og ? 15 : 26), marginTop: og ? 8 : 24 }}>FIRST STOPS</div>
        {names}
      </ArchStone>
      <Ground g={g} y={groundY} />
      {!og && (
        <Caption g={g} y={groundY + 70}>
          Stories from Wikipedia, names from Wikidata
        </Caption>
      )}
    </Frame>
  );
}

// ---------------------------------------------------------------- séance, party

function SplitFlap({ code, cell, gap }: { code: string; cell: number; gap: number }) {
  const h = Math.round(cell * 1.32);
  return (
    <div style={{ display: "flex", gap }}>
      {Array.from(code).map((ch, i) => (
        <div
          key={i}
          style={{
            position: "relative",
            display: "flex",
            width: cell,
            height: h,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: cell * 0.12,
            border: `1.5px solid ${C.flapEdge}`,
            backgroundColor: C.bg,
          }}
        >
          {/* The split goes behind the letter, as on the app's readout. */}
          <div style={{ ...abs(0, h / 2 - 1, cell - 3, 2), backgroundColor: C.flapSplit }} />
          <div style={{ ...body(cell * 0.82, C.wisp, true), lineHeight: 1 }}>{ch}</div>
        </div>
      ))}
    </div>
  );
}

function Room({ card, g }: { card: RoomCard; g: Geometry }) {
  const { W, og } = g;
  const seance = card.kind === "seance";
  const name = card.cemetery?.name ?? null;
  const panelW = 920;
  const panelH = og ? 410 : 780;
  const sub = seance ? "Every phone speaks the same names at the same second." : "Tombstone Bingo, on the same card on every phone.";
  return (
    <Frame g={g} tint={C.wisp}>
      <div
        style={{
          ...abs((W - panelW) / 2, og ? 126 : 520, panelW, panelH),
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 30,
          border: `1.5px solid ${C.panelEdge}`,
          backgroundColor: C.instrument,
          boxShadow: `0 0 40px -10px ${C.wisp}80`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Sign name={seance ? "candle" : "key"} size={og ? 34 : 56} color={C.mauve} />
          <div style={label(og ? 19 : 30)}>{seance ? "SÉANCE ROOM CODE" : "PARTY ROOM CODE"}</div>
        </div>
        <div style={{ display: "flex", marginTop: og ? 24 : 54 }}>
          <SplitFlap code={card.room} cell={og ? 96 : 118} gap={og ? 12 : 16} />
        </div>
        {name && (
          <div style={{ ...carved(og ? fit(name, [[20, 46], [30, 38]], 32) : fit(name, [[20, 66], [30, 56]], 46)), marginTop: og ? 26 : 64, maxWidth: panelW - 80 }}>
            {`at ${name}`}
          </div>
        )}
        {!og && card.cemetery?.place && <div style={{ ...body(38), marginTop: 12 }}>{card.cemetery.place}</div>}
        <div style={{ ...body(og ? 24 : 36), marginTop: og ? (name ? 12 : 30) : 50, textAlign: "center", maxWidth: panelW - 100 }}>{sub}</div>
      </div>
      {!og && (
        <div style={{ ...abs(0, 1450, W), justifyContent: "center" }}>
          <div style={body(42, C.lichen)}>{seance ? "Open the link to join the séance" : "Open the link to join the party"}</div>
        </div>
      )}
    </Frame>
  );
}

// ---------------------------------------------------------------- no data

/** While the data source is down: the brand and what kind of link it is. Never a person. */
function Generic({ kind, g }: { kind: ShareKind; g: Geometry }) {
  const { W, H, og } = g;
  const what = kind === "stop" ? "A stop on a cemetery tour" : kind === "tour" ? "A cemetery tour" : kind === "seance" ? "A séance invite" : "A graveyard party invite";
  return (
    // The wordmark and the moon are the card here, so the corners stay empty.
    <Frame g={g} bare>
      <div style={{ ...abs(0, 0, W, H), flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <Sign name="ringed-moon" size={og ? 120 : 220} color={C.candle} stroke={1.1} />
        <div style={{ ...carved(og ? 76 : 96), marginTop: og ? 18 : 40 }}>Between Two Tombstones</div>
        <div style={{ ...body(og ? 32 : 48), marginTop: og ? 10 : 24 }}>{what}</div>
      </div>
    </Frame>
  );
}

/** Which card a share gets; sent as a response header, so tests can tell the plain card apart. */
export function cardVariant(card: ShareCard | null): "carved" | "plain" | "tour" | "room" | "generic" {
  if (!card) return "generic";
  if (card.kind === "stop") return card.plain ? "plain" : "carved";
  return card.kind === "tour" ? "tour" : "room";
}

export function CardImage({ card, kind, format }: { card: ShareCard | null; kind: ShareKind; format: CardFormat }) {
  const g = geometry(format);
  if (!card) return <Generic kind={kind} g={g} />;
  switch (card.kind) {
    case "stop":
      return card.plain ? <PlainStop card={card} g={g} /> : <CarvedStop card={card} g={g} />;
    case "tour":
      return <Tour card={card} g={g} />;
    case "seance":
    case "party":
      return <Room card={card} g={g} />;
  }
}
