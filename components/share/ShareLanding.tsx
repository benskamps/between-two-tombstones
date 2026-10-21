import type { ReactNode } from "react";
import { SplitFlap } from "@/components/ui/Instrument";
import { PageHeader, SymbolPair } from "@/components/ui/Motifs";
import { Candle, Fern, HourglassSprout, Lily, Moth, Poppy, RingedMoon, Sprout } from "@/components/ui/symbols";
import { canonicalShareUrl, reportIssueUrl, shareCtaHref, type ShareRef } from "@/lib/share/links";
import type { ShareLoad } from "@/lib/share/load";
import { ctaLabel, peopleListed, type GlyphName, type RoomCard, type StopCard, type TourCard } from "@/lib/share/model";
import { ShareCta, ShareViewed } from "./ShareCta";

/*
  The page a shared link opens (L5.2). The design system's own pieces: the
  page title with its tool sign, the headstone arch (or the plain card for a
  recent death), the instrument panel for a room code, and exactly one call
  to action, the primary pill. A link from a friend is never gated (decision
  18e): the action goes straight to the tour, the séance or the party.
*/

const GLYPHS: Record<GlyphName, (p: { className?: string }) => ReactNode> = {
  "hourglass-sprout": HourglassSprout,
  fern: Fern,
  candle: Candle,
  poppy: Poppy,
  moth: Moth,
  lily: Lily,
  "ringed-moon": RingedMoon,
};

function Glyph({ name }: { name: GlyphName }) {
  const Icon = GLYPHS[name];
  return <Icon className="h-6 w-6" />;
}

const CARVED_NAME = "[text-shadow:0_-1px_0_rgba(0,0,0,0.55),0_1px_0_rgba(255,255,255,0.14)]";

function pad(n: number, total: number): string {
  return String(n).padStart(Math.max(2, String(total).length), "0");
}

/** "Report this page": the takedown path for families. */
function ReportLink({ shareRef }: { shareRef: ShareRef }) {
  return (
    <p className="text-center text-sm">
      <a
        href={reportIssueUrl(canonicalShareUrl(shareRef))}
        target="_blank"
        rel="noopener noreferrer"
        className="tap inline-flex items-center text-muted underline underline-offset-4"
        data-testid="share-report"
      >
        Report this page
      </a>
    </p>
  );
}

/** A named failure (Gate 8): what didn't answer and what still works. */
function SourceNote({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="card card-plain px-4 py-3" data-testid="share-source-note">
      {children}
    </p>
  );
}

function StopBody({ card }: { card: StopCard }) {
  const life = (
    <>
      {card.dates && <span className="whitespace-nowrap">{card.dates}</span>}
      {card.dates && card.age && (card.plain ? " · " : <br />)}
      {card.age && <span className="whitespace-nowrap font-normal">{card.age}</span>}
    </>
  );
  return (
    <article
      aria-labelledby="share-name"
      data-testid="share-card"
      data-style={card.plain ? "plain" : "carved"}
      className={card.plain ? "card card-plain space-y-3 p-4" : "arch arch-rule space-y-3 !px-4 !pb-5 !pt-6"}
    >
      <header className={card.plain ? "space-y-1" : "space-y-1 text-center"}>
        {card.glyphs && <SymbolPair className="justify-center" death={<Glyph name={card.glyphs.death} />} life={<Glyph name={card.glyphs.life} />} />}
        {card.plain ? (
          <p className="text-sm text-muted">
            Stop {card.stop} of {card.total}
          </p>
        ) : (
          <p className="label text-muted">
            <span aria-hidden="true">
              Stop {pad(card.stop, card.total)} / {card.total}
            </span>
            <span className="sr-only">
              Stop {card.stop} of {card.total}
            </span>
          </p>
        )}
        <h2 id="share-name" className={card.plain ? "font-display text-3xl leading-tight" : `font-display text-3xl leading-tight tracking-wide ${CARVED_NAME}`}>
          {card.name}
        </h2>
        {(card.dates || card.age) && <p className="font-bold">{life}</p>}
        {card.description && <p className="text-muted">{card.description}</p>}
      </header>
      {card.lead && (
        <div className="space-y-2">
          <p className="story-lead">{card.lead}</p>
          {card.wikipediaUrl && (
            <p className="text-sm">
              <a href={card.wikipediaUrl} className="underline" target="_blank" rel="noopener noreferrer">
                From Wikipedia, CC BY-SA 4.0
              </a>
            </p>
          )}
        </div>
      )}
    </article>
  );
}

function TourBody({ card }: { card: TourCard }) {
  return (
    <section aria-labelledby="share-first" data-testid="share-card" data-style="tour" className="arch arch-rule space-y-3 !px-4 !pb-5 !pt-6 text-center">
      <SymbolPair className="justify-center" death={<RingedMoon className="h-6 w-6" />} life={<Lily className="h-6 w-6" />} />
      <p className="text-xl font-bold text-candle">{peopleListed(card.people)}</p>
      {card.top.length > 0 && (
        <>
          <h2 id="share-first" className="label text-muted">
            First stops
          </h2>
          <ol className="space-y-2">
            {card.top.map((t) => (
              <li key={t.name}>
                <span className={`block font-display text-2xl leading-tight ${CARVED_NAME}`}>{t.name}</span>
                {t.years && <span className="block text-sm text-muted">{t.years}</span>}
              </li>
            ))}
          </ol>
        </>
      )}
      {card.top.length === 0 && (
        <h2 id="share-first" className="text-muted">
          Each stop has its story from Wikipedia.
        </h2>
      )}
    </section>
  );
}

function RoomBody({ card }: { card: RoomCard }) {
  const seance = card.kind === "seance";
  return (
    <section aria-labelledby="share-room" data-testid="share-card" data-style="room" className="instrument bezel space-y-3 px-4 py-4">
      <h2 id="share-room" className="label text-muted">
        {seance ? "Séance room code" : "Party room code"}
      </h2>
      <SplitFlap value={card.room} testId="share-room-code" />
      {card.cemetery && (
        <p>
          At <span className="font-bold">{card.cemetery.name}</span>
          {card.cemetery.place ? `, ${card.cemetery.place}` : ""}.
        </p>
      )}
      <p className="text-sm text-muted">
        {seance
          ? "Every phone that joins speaks the same names at the same second, in its own text-to-speech voice. Only people who died at least 75 years ago are used."
          : "Everyone who joins plays Tombstone Bingo on the same card: find the symbols carved on the stones."}
      </p>
    </section>
  );
}

export function ShareLanding({ shareRef, load }: { shareRef: ShareRef; load: Exclude<ShareLoad, { status: "not-found" }> }) {
  const card = load.card;
  const cemetery = card?.cemetery ?? null;
  const cta = shareCtaHref(shareRef, cemetery ? { qid: cemetery.qid, name: cemetery.name, place: cemetery.place } : null);
  const label = ctaLabel(shareRef.kind, cemetery?.name ?? null);
  const failed = load.status === "error" ? load : null;

  let header: ReactNode;
  let body: ReactNode = null;
  if (card?.kind === "stop") {
    header = <PageHeader title={card.cemetery.name} intro={`A stop on the tour of this cemetery${card.cemetery.place ? ` in ${card.cemetery.place}` : ""}, shared with you.`} tool="haunt" life={<Lily className="h-5 w-5" />} />;
    body = <StopBody card={card} />;
  } else if (card?.kind === "tour") {
    header = <PageHeader title={card.cemetery.name} intro={`A tour of this cemetery${card.cemetery.place ? ` in ${card.cemetery.place}` : ""}, shared with you.`} tool="haunt" life={<Lily className="h-5 w-5" />} />;
    body = <TourBody card={card} />;
  } else if (card?.kind === "seance") {
    header = <PageHeader title="Séance" intro="You’re invited to a séance." tool="seance" life={<Sprout className="h-5 w-5" />} />;
    body = <RoomBody card={card} />;
  } else if (card?.kind === "party") {
    header = <PageHeader title="Graveyard Party" intro="You’re invited to a graveyard party." tool="party" life={<Lily className="h-5 w-5" />} />;
    body = <RoomBody card={card} />;
  } else {
    header = (
      <PageHeader
        title={shareRef.kind === "stop" ? "A stop on a tour" : "A cemetery tour"}
        intro="Someone shared a cemetery tour with you."
        tool="haunt"
        life={<Lily className="h-5 w-5" />}
      />
    );
  }

  return (
    <div className="space-y-5" data-testid="share-page" data-kind={shareRef.kind}>
      <ShareViewed kind={shareRef.kind} />
      {header}
      {failed && (
        <SourceNote>
          {shareRef.kind === "stop" || shareRef.kind === "tour"
            ? failed.message
            : `Couldn’t reach ${failed.source} to name the cemetery. The room code still works.`}
        </SourceNote>
      )}
      {body}
      <ShareCta kind={shareRef.kind} href={cta} label={label} />
      <ReportLink shareRef={shareRef} />
    </div>
  );
}
