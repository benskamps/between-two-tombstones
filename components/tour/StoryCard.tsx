"use client";

import type { ReactNode } from "react";
import type { Pin } from "@/components/offline/store";
import { SymbolPair } from "@/components/ui/Motifs";
import { Candle, Fern, HourglassSprout, Lily, Moth, Poppy, RingedMoon } from "@/components/ui/symbols";
import { needsRespectfulStyle } from "@/lib/respect";
import { ageAtDeath, formatAge, formatWikiDate, parseWikiDate, type WikiDate } from "@/lib/tour/dates";
import { findAGraveUrl } from "@/lib/tour/links";
import { diedDuring } from "@/lib/tour/periods";
import { cardPhoto } from "@/lib/tour/photo";
import type { Scored } from "@/lib/tour/score";
import { cleanExtract } from "@/lib/tour/text";
import { FoundItButton } from "./FoundItButton";
import { GravePhoto } from "./GravePhoto";

const CARVED_NAME = "[text-shadow:0_-1px_0_rgba(0,0,0,0.55),0_1px_0_rgba(255,255,255,0.14)]";

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Nov 8, 1900": the carved card's inscription keeps both dates on one line. */
export function shortDate(d: WikiDate | null): string | null {
  if (!d) return null;
  if (d.precision >= 11 && d.month >= 1 && d.day >= 1) return formatWikiDate(d)!.replace(/^\w+/, SHORT_MONTHS[d.month - 1]);
  if (d.precision === 10 && d.month >= 1) return formatWikiDate(d)!.replace(/^\w+/, SHORT_MONTHS[d.month - 1]);
  return formatWikiDate(d);
}

/** The death sign and the life sign at the apex of a carved card, picked by why the grave is on the tour. */
function apexPair(tagIds: string[]): { death: ReactNode; life: ReactNode } {
  const g = "h-6 w-6";
  if (tagIds.includes("century-gone")) return { death: <HourglassSprout className={g} />, life: <Fern className={g} /> };
  if (tagIds.includes("died-young")) return { death: <Candle className={g} />, life: <Poppy className={g} /> };
  if (tagIds.includes("long-life")) return { death: <Moth className={g} />, life: <Lily className={g} /> };
  return { death: <RingedMoon className={g} />, life: <Lily className={g} /> };
}

/** "01" for stop 1 of 80; the width follows the total. */
function pad(n: number, total: number): string {
  return String(n).padStart(Math.max(2, String(total).length), "0");
}

function lifeLine(birth: string | null, death: string | null): string | null {
  if (birth && death) return `${birth} – ${death}`;
  if (death) return `Died ${death}`;
  if (birth) return `Born ${birth}`;
  return null;
}

function occupationsLine(occupations: string[]): string | null {
  if (occupations.length === 0) return null;
  const list = occupations.slice(0, 4).join(", ");
  return list.charAt(0).toUpperCase() + list.slice(1);
}

function distanceText(m: number): string {
  return m < 1000 ? `About ${Math.round(m / 10) * 10} m from you` : `About ${(m / 1000).toFixed(1)} km from you`;
}

export function StoryCard({
  scored,
  stop,
  total,
  cemeteryQid,
  cemeteryName,
  pin,
  onPinsChange,
  distanceM,
  now,
  storiesIncomplete = false,
}: {
  /** True when Wikipedia didn't answer for every story, so a missing one may exist. */
  storiesIncomplete?: boolean;
  scored: Scored;
  stop: number;
  /** Stops in the whole tour, for "STOP 01 / 80" on carved cards. */
  total?: number;
  cemeteryQid: string;
  cemeteryName: string;
  pin: Pin | undefined;
  onPinsChange: (pins: Record<string, Pin>) => void;
  distanceM: number | null;
  now: Date;
}) {
  const p = scored.person;
  const plain = needsRespectfulStyle(p, now);
  const birth = parseWikiDate(p.birth, p.birthPrecision);
  const death = parseWikiDate(p.death, p.deathPrecision);
  // Plain cards keep the plain long form; carved ones get the inscription with short months.
  const life = plain ? lifeLine(formatWikiDate(birth), formatWikiDate(death)) : lifeLine(shortDate(birth), shortDate(death));
  const age = formatAge(ageAtDeath(birth, death));
  const during = diedDuring(p.death, p.deathPrecision);
  const occupations = occupationsLine(p.occupations);
  const fag = findAGraveUrl(p);
  const photo = cardPhoto(p, cemeteryName);
  // Cleaned here too: cached (7 days) and downloaded tours keep text from before the parse-time fix.
  const paragraphs = cleanExtract(p.wikipedia?.extract ?? "").split(/\n+/).map((s) => s.trim()).filter(Boolean);
  const [lead, ...rest] = paragraphs;
  const headingId = `stop-${p.qid}`;

  return (
    <article
      aria-labelledby={headingId}
      data-testid="story-card"
      data-qid={p.qid}
      data-style={plain ? "plain" : "carved"}
      className={
        plain
          ? "space-y-3 rounded-xl border border-border bg-surface p-4"
          : // A headstone: the arch with its inner rule, a death/life pair at the apex (L10.4).
            "arch arch-rule space-y-3 !px-4 !pb-4 !pt-6"
      }
    >
      {plain ? (
        <header className="space-y-1">
          <p className="text-sm text-muted">Stop {stop}</p>
          <h3 id={headingId} data-testid="story-name" className="font-display text-2xl leading-tight">
            {p.name}
          </h3>
          {(life || age) && (
            <p className="font-bold">
              {life}
              {life && age ? " " : ""}
              {age && <span className="whitespace-nowrap">{life ? `· ${age}` : age}</span>}
            </p>
          )}
          {p.description && <p className="text-muted">{p.description}</p>}
        </header>
      ) : (
        <header className="space-y-1 text-center">
          <SymbolPair className="justify-center" {...apexPair(scored.tags.map((t) => t.id))} />
          <p className="label text-muted">
            <span aria-hidden="true">
              Stop {pad(stop, total ?? stop)}
              {total ? ` / ${total}` : ""}
            </span>
            <span className="sr-only">
              Stop {stop}
              {total ? ` of ${total}` : ""}
            </span>
          </p>
          <h3 id={headingId} data-testid="story-name" className={`font-display text-3xl leading-tight tracking-wide ${CARVED_NAME}`}>
            {p.name}
          </h3>
          {/* The inscription: dates on one line (short months), the age under them, both in Atkinson (F9). */}
          {(life || age) && (
            <p className="font-bold">
              {life && <span className="whitespace-nowrap">{life}</span>}
              {life && age && <br />}
              {age && <span className="whitespace-nowrap font-normal">{age}</span>}
            </p>
          )}
          {p.description && <p className="text-muted">{p.description}</p>}
        </header>
      )}

      {occupations && <p className="text-sm">Worked as: {occupations}</p>}

      {scored.tags.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Why this grave">
          {scored.tags.map((t) => (
            <li key={t.id} className="rounded-full border border-border px-3 py-0.5 text-sm text-accent">
              {t.label}
            </li>
          ))}
        </ul>
      )}

      {during.length > 0 && (
        <ul className="space-y-0.5 text-sm text-muted">
          {during.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}

      {lead ? (
        <div className="space-y-2">
          <p data-testid="story-text">{lead}</p>
          {/* The story first, then the photo: the words are what people came for, and the first screen
              paints text instead of waiting on Commons' redirects for a picture (LCP). */}
          {photo && <GravePhoto src={photo.src} name={p.name} kind={photo.kind} priority={stop === 1} />}
          {rest.length > 0 && (
            <details>
              <summary className="tap flex cursor-pointer items-center font-bold text-accent">Read more</summary>
              <div className="space-y-2 pt-1">
                {rest.map((para, i) => (
                  <p key={i}>{para}</p>
                ))}
              </div>
            </details>
          )}
          {p.wikipedia && (
            <p className="text-sm">
              <a href={p.wikipedia.url} className="underline" target="_blank" rel="noopener noreferrer">
                From Wikipedia, CC BY-SA 4.0
              </a>
            </p>
          )}
        </div>
      ) : (
        <>
          <p className="text-muted" data-testid="story-text">
            {storiesIncomplete
              ? `No Wikipedia story loaded for ${p.name} this time. Wikipedia didn't answer every request; try again in a minute.`
              : `There's no English Wikipedia article about ${p.name} yet.`}
          </p>
          {photo && <GravePhoto src={photo.src} name={p.name} kind={photo.kind} priority={stop === 1} />}
        </>
      )}

      {distanceM !== null && <p className="text-sm font-bold">{distanceText(distanceM)}</p>}

      <footer className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
        <a href={fag.url} className="tap inline-flex items-center underline" target="_blank" rel="noopener noreferrer">
          {fag.kind === "memorial" ? "Find a Grave memorial" : "Search Find a Grave"}
        </a>
        <FoundItButton personQid={p.qid} cemeteryQid={cemeteryQid} name={p.name} pin={pin} onPinsChange={onPinsChange} />
      </footer>
    </article>
  );
}
