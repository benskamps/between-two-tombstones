"use client";

import { useState } from "react";
import {
  acresLine,
  capitalize,
  commonsFileUrl,
  establishedLine,
  findAGraveUrl,
  firstSentences,
  HOURS_LINE,
  placeLine,
} from "@/lib/gravitator/format";
import type { GraveyardProfile } from "@/lib/gravitator/types";
import { PlaceholderArt } from "./PlaceholderArt";

/** Commons photo, or the drawn placeholder when there's none or it fails to load. Never a broken image. */
export function CardPhoto({ card, eager = false }: { card: GraveyardProfile; eager?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (!card.image || failed) return <PlaceholderArt qid={card.qid} />;
  return (
    // Commons serves the 500 px thumbnail; next/image would need a remotePatterns
    // change in the shared next.config.ts and adds nothing for one thumbnail.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={card.image}
      alt={`Photo of ${card.name}, from Wikimedia Commons`}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}

function hasProfileFacts(c: GraveyardProfile): boolean {
  return !!(c.established || c.acres || c.heritage.length || c.types.length || c.bio || c.notable?.count);
}

function Notable({ notable }: { notable: GraveyardProfile["notable"] }) {
  // Null = the burials query failed; the deck shows a note about it instead.
  if (!notable) return null;
  if (notable.count === 0) {
    return <p className="text-(--g-muted)">No notable burials on record yet.</p>;
  }
  return (
    <div>
      <h3 className="font-bold">
        {notable.count.toLocaleString("en-US")} notable {notable.count === 1 ? "person" : "people"} buried here
      </h3>
      {notable.top.length > 0 && (
        <ul className="mt-1 space-y-0.5" aria-label="Most notable">
          {notable.top.map((p) => (
            <li key={p.qid}>
              {p.name}
              {/* Respect rule: died within 25 years (or unknown) → the name only. */}
              {!p.recent && p.deathYear !== null && (
                <span className="text-(--g-muted)"> · d. {p.deathYear}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BioCredit({ url }: { url: string }) {
  return (
    <p className="mt-1 text-sm text-(--g-muted)">
      From{" "}
      <a href={url} target="_blank" rel="noopener">
        Wikipedia
      </a>
      ,{" "}
      <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener license">
        CC BY-SA 4.0
      </a>
    </p>
  );
}

export function ProfileBody({
  card,
  expanded,
  now,
}: {
  card: GraveyardProfile;
  expanded: boolean;
  now: Date;
}) {
  const est = establishedLine(card.established, now);
  const acres = acresLine(card.acres);
  const teaser = card.bio ? firstSentences(card.bio.intro, 2) : null;
  return (
    <div className="space-y-3">
      <p className="text-sm text-(--g-muted)">{HOURS_LINE}</p>

      {(est || acres || card.heritage.length > 0) && (
        <ul className="flex flex-wrap gap-2" aria-label="At a glance">
          {est && (
            <li className="g-chip">
              <span className="sr-only">Age: </span>
              {est}
            </li>
          )}
          {acres && (
            <li className="g-chip">
              <span className="sr-only">Size: </span>
              {acres}
            </li>
          )}
          {card.heritage.length > 0 && (
            <li className="g-chip">
              <span className="g-verified">
                <span aria-hidden="true">✓ </span>Verified
              </span>
            </li>
          )}
        </ul>
      )}

      {card.heritage.length > 0 && (
        <p className="g-verified text-sm">
          {card.heritage.map((h) => capitalize(h)).join(" · ")}
        </p>
      )}

      {card.types.length > 0 && (
        <p>
          <span className="font-bold">Into </span>
          {card.types.join(" · ")}
        </p>
      )}

      <Notable notable={card.notable} />

      {card.bio && (
        <div>
          {expanded ? (
            card.bio.intro.split(/\n\n/).map((para, i) => (
              <p key={i} className={i > 0 ? "mt-2" : undefined}>
                {para}
              </p>
            ))
          ) : (
            <p>{teaser}</p>
          )}
          <BioCredit url={card.bio.url} />
        </div>
      )}

      {!hasProfileFacts(card) && (
        <p className="text-(--g-muted)">
          The quiet type. Wikidata knows its name and where it is, and not much else. Go see it for yourself.
        </p>
      )}

      {expanded && (
        <ul className="space-y-2 border-t border-(--g-border) pt-3 text-sm">
          {card.findAGraveId && (
            <li>
              <a href={findAGraveUrl(card.findAGraveId)} target="_blank" rel="noopener">
                See it on Find a Grave
              </a>
            </li>
          )}
          <li>
            <a
              href={`https://www.openstreetmap.org/?mlat=${card.lat}&mlon=${card.lon}#map=17/${card.lat}/${card.lon}`}
              target="_blank"
              rel="noopener"
            >
              Open the map (OpenStreetMap)
            </a>
          </li>
          <li>
            <a href={`https://www.wikidata.org/wiki/${card.qid}`} target="_blank" rel="noopener">
              Wikidata entry {card.qid}
            </a>
          </li>
          {card.imageFile && (
            <li className="text-(--g-muted)">
              Photo:{" "}
              <a href={commonsFileUrl(card.imageFile)} target="_blank" rel="noopener">
                {card.imageFile}
              </a>{" "}
              on Wikimedia Commons
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

/** The card face: photo, nameplate, and the profile. Gestures live in SwipeDeck. */
export function ProfileFace({
  card,
  km,
  expanded,
  onToggleExpanded,
  interactive,
  now,
}: {
  card: GraveyardProfile;
  km: number;
  expanded: boolean;
  onToggleExpanded?: () => void;
  interactive: boolean;
  now: Date;
}) {
  return (
    <>
      <div className="g-photo">
        <CardPhoto card={card} eager={interactive} />
        {interactive && onToggleExpanded && (
          <button type="button" className="g-btn g-btn-ghost g-info" aria-expanded={expanded} onClick={onToggleExpanded}>
            {expanded ? "Less" : "Full profile"}
          </button>
        )}
        <div className="g-nameplate">
          <h2
            className={`font-display leading-[1.1] break-words ${card.name.length > 26 ? "text-[1.55rem]" : "text-[1.9rem]"}`}
          >
            {card.name}
          </h2>
          <p className="text-(--g-muted)">{placeLine(card.place, km)}</p>
        </div>
      </div>
      <div className="g-body">
        <ProfileBody card={card} expanded={expanded} now={now} />
      </div>
      <div className="g-tint g-tint-save" aria-hidden="true" />
      <div className="g-tint g-tint-pass" aria-hidden="true" />
      <div className="g-stamp g-stamp-save" aria-hidden="true">
        Save
      </div>
      <div className="g-stamp g-stamp-pass" aria-hidden="true">
        Pass
      </div>
    </>
  );
}
