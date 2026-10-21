"use client";

import type { Pin } from "@/components/offline/store";
import { needsRespectfulStyle } from "@/lib/respect";
import { ageAtDeath, formatAge, formatWikiDate, parseWikiDate } from "@/lib/tour/dates";
import { findAGraveUrl } from "@/lib/tour/links";
import { diedDuring } from "@/lib/tour/periods";
import { cardPhoto } from "@/lib/tour/photo";
import type { Scored } from "@/lib/tour/score";
import { cleanExtract } from "@/lib/tour/text";
import { FoundItButton } from "./FoundItButton";
import { GravePhoto } from "./GravePhoto";

const CARVED_NAME = "[text-shadow:0_-1px_0_rgba(0,0,0,0.55),0_1px_0_rgba(255,255,255,0.14)]";

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
  const life = lifeLine(formatWikiDate(birth), formatWikiDate(death));
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
          : "space-y-3 rounded-b-xl rounded-t-[3rem] border border-border bg-surface px-4 pb-4 pt-7 shadow-[inset_0_2px_12px_rgba(0,0,0,0.35)]"
      }
    >
      <header className={plain ? "space-y-1" : "space-y-1 text-center"}>
        <p className="text-sm text-muted">Stop {stop}</p>
        <h3
          id={headingId}
          data-testid="story-name"
          className={plain ? "font-display text-2xl leading-tight" : `font-display text-3xl leading-tight tracking-wide ${CARVED_NAME}`}
        >
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

      {photo && <GravePhoto src={photo.src} name={p.name} kind={photo.kind} />}

      {lead ? (
        <div className="space-y-2">
          <p data-testid="story-text">{lead}</p>
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
        <p className="text-muted" data-testid="story-text">
          {storiesIncomplete
            ? `No Wikipedia story loaded for ${p.name} this time. Wikipedia didn't answer every request; try again in a minute.`
            : `There's no English Wikipedia article about ${p.name} yet.`}
        </p>
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
