"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getPins, getSavedTour, listSavedTours, type SavedTourSummary } from "@/components/offline/store";
import { ReadoutStrip } from "@/components/ui/Instrument";
import { SymbolPair } from "@/components/ui/Motifs";
import { Candle, Lily, PassportSeal, Sprout } from "@/components/ui/symbols";
import { HAUNT_EVENT } from "@/lib/haunt/haunt";
import { getHaunt } from "@/lib/haunt/store";
import {
  PASSPORT_EVENT,
  computePassportBadges,
  inspectBurialsForBadges,
  readPassportLog,
  type BadgePerson,
  type PassportLog,
} from "@/lib/passport/store";

export type SampleBurialsMap = Record<string, { name: string; people: BadgePerson[] }>;

export function PassportView({ sampleBurials }: { sampleBurials: SampleBurialsMap }) {
  const [log, setLog] = useState<PassportLog>(() => readPassportLog());
  const [savedTours, setSavedTours] = useState<SavedTourSummary[]>([]);
  const [pinsCount, setPinsCount] = useState(0);
  const [extraBurials, setExtraBurials] = useState<{ cemeteryName: string; people: BadgePerson[] }[]>([]);

  useEffect(() => {
    const sync = () => {
      const currentLog = readPassportLog();
      const currentHaunt = getHaunt();
      if (currentHaunt && !currentLog.cemeteries.some((c) => c.qid === currentHaunt.qid)) {
        setLog({
          ...currentLog,
          cemeteries: [
            {
              qid: currentHaunt.qid,
              name: currentHaunt.name,
              place: currentHaunt.place,
              visitedAt: currentHaunt.at,
            },
            ...currentLog.cemeteries,
          ],
        });
      } else {
        setLog(currentLog);
      }
    };
    sync();
    window.addEventListener(PASSPORT_EVENT, sync);
    window.addEventListener(HAUNT_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(PASSPORT_EVENT, sync);
      window.removeEventListener(HAUNT_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadOfflineData() {
      const tours = await listSavedTours();
      const qids = new Set<string>([
        ...log.cemeteries.map((c) => c.qid),
        ...tours.map((t) => t.qid),
        ...Object.keys(sampleBurials),
      ]);
      let totalPins = 0;
      for (const qid of qids) {
        const pins = await getPins(qid);
        totalPins += Object.keys(pins).length;
      }
      const extras: { cemeteryName: string; people: BadgePerson[] }[] = [];
      for (const t of tours) {
        if (sampleBurials[t.qid]) continue;
        const saved = await getSavedTour(t.qid);
        if (saved?.data?.people) {
          extras.push({ cemeteryName: saved.data.cemetery.name, people: saved.data.people });
        }
      }
      if (!cancelled) {
        setSavedTours(tours);
        setPinsCount(totalPins);
        setExtraBurials(extras);
      }
    }
    void loadOfflineData();
    return () => {
      cancelled = true;
    };
  }, [log.cemeteries, sampleBurials]);

  const burialCollections = useMemo(() => {
    const list: { cemeteryName: string; people: BadgePerson[] }[] = [...extraBurials];
    const visitedQids = new Set([
      ...log.cemeteries.map((c) => c.qid),
      ...savedTours.map((t) => t.qid),
    ]);
    for (const qid of visitedQids) {
      const sample = sampleBurials[qid];
      if (sample) {
        list.push({ cemeteryName: sample.name, people: sample.people });
      }
    }
    return list;
  }, [log.cemeteries, savedTours, extraBurials, sampleBurials]);

  const burialStats = useMemo(() => inspectBurialsForBadges(burialCollections), [burialCollections]);

  const badges = useMemo(
    () =>
      computePassportBadges({
        log,
        pinsCount,
        savedToursCount: savedTours.length,
        burialStats,
      }),
    [log, pinsCount, savedTours.length, burialStats],
  );

  const earnedCount = badges.filter((b) => b.earned).length;
  const gamesTotal = log.bingoWins + log.riddlesSolved + log.stonesCalculated;

  return (
    <div className="space-y-6" data-testid="passport-view">
      <section aria-labelledby="passport-ledger-heading" className="arch arch-rule space-y-4">
        <div className="text-center space-y-1">
          <SymbolPair
            className="justify-center"
            death={<PassportSeal className="h-6 w-6" />}
            life={<Candle className="h-6 w-6" animate />}
          />
          <p className="label text-muted">Kept on this phone</p>
          <h2 id="passport-ledger-heading" className="font-display text-3xl">
            Field Ledger
          </h2>
        </div>

        <ReadoutStrip
          tone="candle"
          live={earnedCount > 0}
          status={`Badges ${earnedCount}/${badges.length}`}
          values={[
            { label: "Haunts", value: String(log.cemeteries.length) },
            { label: "Pins", value: String(pinsCount) },
          ]}
        />

        <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-4" data-testid="passport-stats">
          <div className="card bg-surface-2 p-3 text-center">
            <dt className="label text-muted">Haunts</dt>
            <dd className="font-sans text-2xl font-bold text-candle">{log.cemeteries.length}</dd>
          </div>
          <div className="card bg-surface-2 p-3 text-center">
            <dt className="label text-muted">Graves pinned</dt>
            <dd className="font-sans text-2xl font-bold text-lichen">{pinsCount}</dd>
          </div>
          <div className="card bg-surface-2 p-3 text-center">
            <dt className="label text-muted">Stamps made</dt>
            <dd className="font-sans text-2xl font-bold text-candle">{log.stampsMade}</dd>
          </div>
          <div className="card bg-surface-2 p-3 text-center">
            <dt className="label text-muted">Games &amp; math</dt>
            <dd className="font-sans text-2xl font-bold text-lichen">{gamesTotal}</dd>
          </div>
        </dl>

        {burialStats.oldestStone && (
          <p className="text-center text-sm text-muted" data-testid="passport-oldest">
            Oldest dated stone in your haunts:{" "}
            <strong className="text-text">{burialStats.oldestStone.personName}</strong> (died{" "}
            {burialStats.oldestStone.year}, {burialStats.oldestStone.cemeteryName}).
          </p>
        )}
      </section>

      <section aria-labelledby="passport-badges-heading" className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="passport-badges-heading" className="font-display text-2xl">
            Mourning Badges
          </h2>
          <span className="label text-muted">
            {earnedCount} of {badges.length} earned
          </span>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2" data-testid="passport-badges">
          {badges.map((b) => (
            <li
              key={b.id}
              data-testid={`badge-${b.id}`}
              data-earned={b.earned ? "true" : "false"}
              className={`card p-4 space-y-1.5 ${
                b.earned ? "border-lichen bg-lit-lichen" : "opacity-80"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display text-xl">{b.title}</h3>
                {b.earned ? (
                  <span className="inline-flex items-center gap-1 text-sm font-bold text-lichen">
                    <Sprout className="h-4 w-4" />
                    Earned
                  </span>
                ) : (
                  <span className="label text-muted">Unclaimed</span>
                )}
              </div>
              <p className="text-sm text-muted">{b.detail}</p>
              {b.earned && b.earnedNote && (
                <p className="text-sm font-bold text-lichen">{b.earnedNote}</p>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="passport-haunts-heading" className="card space-y-3 p-4">
        <h2 id="passport-haunts-heading" className="flex items-center gap-2 font-display text-2xl">
          <Lily className="h-5 w-5 text-lichen" />
          Cemeteries in your passport
        </h2>
        {log.cemeteries.length > 0 ? (
          <ul className="divide-y divide-border" data-testid="passport-cemeteries">
            {log.cemeteries.map((c) => (
              <li key={c.qid} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <div>
                  <p className="font-display text-xl">{c.name}</p>
                  {c.place && <p className="text-sm text-muted">{c.place}</p>}
                </div>
                <Link href={`/cemetery/${c.qid}`} className="btn btn-ghost px-4 text-sm">
                  Open tour
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="space-y-3">
            <p className="text-muted">
              No haunts recorded on this phone yet. Open a cemetery tour to stamp its name into your passport.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link href="/cemetery/Q2008469" className="btn btn-primary">
                Oakland Cemetery (Atlanta)
              </Link>
              <Link href="/cemetery/Q360779" className="btn btn-ghost">
                Sleepy Hollow Cemetery
              </Link>
            </div>
          </div>
        )}
      </section>

      <p className="text-sm text-muted">
        Your passport is stored only on this phone (local storage and offline tour storage). Nothing is sent to a
        server.
      </p>
    </div>
  );
}
