"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  SWEEP_DEFAULT_MS,
  SWEEP_MAX_MS,
  SWEEP_MIN_MS,
  speechSeconds,
  startNoise,
  type NoiseEngine,
} from "@/lib/spirit/engine";
import { MAX_NAME, MAX_PLACE, cleanText, shouldAutoSetHaunt } from "@/lib/haunt/haunt";
import { getFreshHaunt, getHaunt, setHaunt } from "@/lib/haunt/store";
import { useHaunt } from "@/lib/haunt/useHaunt";
import { QID_RE, loadCemetery, type LoadResult, type SampleCemetery } from "@/lib/spirit/load";
import { extraCemeteryOption } from "@/lib/spirit/picker";
import { capsFromParam, createSession, formatDuration, stopMessage, type SpiritSession, type Utterance } from "@/lib/spirit/session";
import { pickVoice, silenceVoices, speakFragment, speechAvailable } from "@/lib/spirit/voice";
import { bankHasNames, buildWordBank } from "@/lib/spirit/wordbank";
import { Sprout } from "@/components/ui/symbols";
import { ReadoutStrip, SpokenWord, SweepDial, countOf } from "@/components/ui/Instrument";
import { SEANCE_PITCH, SeanceJoin, SeanceStart } from "./SeanceStart";
import { DISCLAIMER, MOURNERS, NO_SPEECH, audioContextClass, clock, subscribeNothing } from "./shared";

/** Read in the Start handler only (the compiler can't tell a handler from render). */
function wallClock(): number {
  return Date.now();
}

/** Live objects a session needs; kept out of React state because they're not rendered. */
type Runtime = {
  ctx: AudioContext | null;
  noise: NoiseEngine | null;
  session: SpiritSession | null;
  volume: number;
};

export function SpiritBox({ samples }: { samples: SampleCemetery[] }) {
  const params = useSearchParams();
  const rawTour = params.get("cemetery");
  const tourQid = rawTour && QID_RE.test(rawTour) ? rawTour : null;
  // The cemetery in the link wins; otherwise the haunt (decision 18e); the first sample only as a last resort.
  const haunt = useHaunt();
  const extraQid = tourQid ?? haunt?.qid ?? null;
  const extraIsSample = extraQid !== null && samples.some((s) => s.qid === extraQid);
  const { caps, test } = capsFromParam(params.get("test-caps"));
  const canSpeak = useSyncExternalStore(subscribeNothing, speechAvailable, () => true);

  const [choice, setChoice] = useState<string>(extraQid ?? samples[0].qid);
  const [results, setResults] = useState<Record<string, LoadResult>>({});
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<Utterance[]>([]);
  const [stopNote, setStopNote] = useState<string | null>(null);
  const [audioNote, setAudioNote] = useState<string | null>(null);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [volume, setVolume] = useState(70);
  const [sweepMs, setSweepMs] = useState(SWEEP_DEFAULT_MS);
  const rt = useRef<Runtime>({ ctx: null, noise: null, session: null, volume: 70 });

  const result = results[choice];
  const bank = useMemo(() => (result?.ok ? buildWordBank(result.cemetery.people) : null), [result]);
  const ready = bank !== null && bankHasNames(bank);

  // Load the chosen cemetery's burials: live route first, saved copy for the samples.
  useEffect(() => {
    const ctrl = new AbortController();
    loadCemetery(choice, { fallback: samples.find((s) => s.qid === choice), signal: ctrl.signal }).then((r) => {
      if (!ctrl.signal.aborted) setResults((prev) => ({ ...prev, [choice]: r }));
    });
    return () => ctrl.abort();
  }, [choice, samples]);

  // A cemetery from the link becomes the haunt once its burials load (then its name is known),
  // unless it already is (the gate may have set it with its place from ?name=&place=), and
  // never over a fresh haunt elsewhere (F11: a link is used, not adopted).
  const tourResult = tourQid ? results[tourQid] : undefined;
  const tourName = tourResult?.ok ? tourResult.cemetery.name : null;
  useEffect(() => {
    if (tourQid && tourName && getHaunt()?.qid !== tourQid && shouldAutoSetHaunt(tourQid, getFreshHaunt(), null)) {
      setHaunt({ qid: tourQid, name: tourName });
    }
  }, [tourQid, tourName]);

  // "/spirit?cemetery=Q…#seance" (e.g. from a tour) lands on the séance section, which renders after hydration.
  // "?join=1" (from a broken séance link, or "type a code") also puts the cursor in the room-code box.
  const joining = params.get("join") !== null;
  useEffect(() => {
    if (window.location.hash === "#seance" || joining) document.getElementById("seance")?.scrollIntoView();
    if (joining) document.getElementById("seance-room")?.focus({ preventScroll: true });
  }, [joining]);

  // Stop on page hide and on unmount; close the audio context when leaving.
  useEffect(() => {
    const r = rt.current;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") r.session?.stop("hidden");
    };
    const onPageHide = () => r.session?.stop("hidden");
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      r.session?.stop("unmount");
      r.noise?.stop();
      r.noise = null;
      silenceVoices();
      r.ctx?.close().catch(() => {});
      r.ctx = null;
    };
  }, []);

  function start() {
    const r = rt.current;
    if (!bank || !ready || r.session) return;

    // 1. Static. The AudioContext is created or resumed inside this tap so iOS lets it play.
    let noise: NoiseEngine | null = null;
    try {
      const AC = audioContextClass();
      if (AC) {
        r.ctx = r.ctx ?? new AC();
        void r.ctx.resume().catch(() => {});
        noise = startNoise(r.ctx, { sweepMs, volume: volume / 100 });
      }
    } catch {
      noise = null;
    }
    r.noise = noise;
    setAudioNote(noise ? null : "Your browser can’t play the static, so this session is voices only.");

    // 2. Voices. session.start() speaks the first fragment right here, still inside the tap.
    const voice = canSpeak ? pickVoice(window.speechSynthesis.getVoices()) : null;
    const session = createSession({
      bank,
      caps,
      speak: (text) => {
        let rate = 0.7;
        if (canSpeak) {
          try {
            rate = speakFragment(text, { volume: r.volume / 100, voice, rng: Math.random });
          } catch {
            // Speech failed for this one; the caption still shows.
          }
        }
        r.noise?.duck(speechSeconds(text, rate));
      },
      onUtterance: (u) => setLog((prev) => [u, ...prev]),
      onStop: (reason) => {
        r.noise?.stop();
        r.noise = null;
        r.session = null;
        silenceVoices();
        r.ctx?.suspend().catch(() => {});
        setRunning(false);
        setStopNote(stopMessage(reason, caps));
      },
    });
    r.session = session;
    setLog([]);
    setStopNote(null);
    setRunning(true);
    setEndsAt(wallClock() + caps.maxMs);
    session.start();
  }

  function stop() {
    rt.current.session?.stop("user");
  }

  function changeVolume(v: number) {
    setVolume(v);
    rt.current.volume = v;
    rt.current.noise?.setVolume(v / 100);
  }

  function changeSweep(ms: number) {
    setSweepMs(ms);
    rt.current.noise?.setSweepMs(ms);
  }

  const extraResult = extraQid ? results[extraQid] : undefined;
  const options = [
    ...samples.map((s) => ({ qid: s.qid, label: s.name, detail: s.place })),
    ...(extraQid && !extraIsSample
      ? [
          {
            qid: extraQid,
            // A cemetery from the link (?name= and ?place= when it has them) or the haunt; never its ID.
            ...extraCemeteryOption({
              loaded: extraResult?.ok ? extraResult.cemetery.name : null,
              link: tourQid
                ? { name: cleanText(params.get("name"), MAX_NAME), place: cleanText(params.get("place"), MAX_PLACE) }
                : null,
              haunt: haunt && haunt.qid === extraQid ? haunt : null,
            }),
          },
        ]
      : []),
  ];

  const latest = log[0];

  return (
    <div className="space-y-6">
      <section aria-labelledby="spirit-pick" className="card space-y-3 p-4">
        <fieldset disabled={running} className="space-y-2">
          <legend id="spirit-pick" className="mb-1 font-display text-2xl">
            Whose names
          </legend>
          {options.map((o) => (
            <label
              key={o.qid}
              className={`tap flex cursor-pointer items-center gap-3 rounded-xl border p-3 ${
                choice === o.qid ? "border-accent bg-surface-2" : "border-border bg-surface"
              }`}
            >
              <input
                type="radio"
                name="spirit-cemetery"
                value={o.qid}
                checked={choice === o.qid}
                onChange={() => setChoice(o.qid)}
                className="h-5 w-5 accent-[var(--accent)]"
              />
              <span>
                <span className="block font-bold">{o.label}</span>
                <span className="block text-sm text-muted">{o.detail}</span>
              </span>
            </label>
          ))}
        </fieldset>
        {/* Room for the names line up front, so the panel below doesn't move when the names arrive. */}
        <div role="status" className="min-h-[5.25rem] text-sm">
          {!result && <p className="text-muted">Loading the names&hellip;</p>}
          {result && !result.ok && (
            <p className="text-danger">{result.message} Try again in a minute, or pick a sample cemetery.</p>
          )}
          {result?.ok && bank && (
            <>
              {ready ? (
                <p>
                  {bank.eligibleCount === 1 ? "1 person" : `${bank.eligibleCount} people`} buried at{" "}
                  {result.cemetery.name} died 75 or more years ago; only{" "}
                  {bank.eligibleCount === 1 ? "that name is" : "their names are"} used.
                  {bank.excludedCount === 1 && " 1 more recent or undated burial is left out."}
                  {bank.excludedCount > 1 && ` ${bank.excludedCount} more recent or undated burials are left out.`}
                </p>
              ) : (
                <p className="text-danger">
                  Nobody in the list for {result.cemetery.name} died 75 or more years ago, so there are no names to
                  use. Pick a sample cemetery instead.
                </p>
              )}
              {result.note && <p className="text-muted">{result.note}</p>}
            </>
          )}
        </div>
      </section>

      {/* One instrument (L10.4): readouts, the dial, the voice, the controls and the captions log. */}
      <section aria-label="Controls" className="instrument bezel space-y-4 p-4">
        {/* Status, the voice count, and when it stops. The cemetery is in the picker and the header; the sweep is on its knob. */}
        <ReadoutStrip
          live={running}
          status={running ? "Live" : "Standby"}
          values={[
            { label: "Voices", value: countOf(log.length, caps.maxUtterances) },
            running && endsAt ? { label: "Ends", value: clock(endsAt) } : null,
          ]}
        />
        <SweepDial running={running} stepMs={sweepMs} />
        {/* The latest voice, big: the part people film. */}
        <SpokenWord key={latest?.n ?? "idle"} testId="spirit-latest">{latest ? `…${latest.text}…` : running ? "…" : ""}</SpokenWord>
        <button
          type="button"
          onClick={running ? stop : start}
          disabled={!running && !ready}
          className={`btn btn-lg w-full text-2xl ${running ? "btn-stop" : "btn-primary"}`}
        >
          {running ? "Stop" : ready || result ? "Start" : "Loading…"}
        </button>
        <p className="font-bold">{DISCLAIMER}</p>
        {!canSpeak && <p className="text-danger">{NO_SPEECH}</p>}
        {audioNote && <p className="text-danger">{audioNote}</p>}
        {stopNote && (
          <p role="status" className="rounded-lg border border-border bg-surface-2 p-3 font-bold">
            {stopNote}
          </p>
        )}
        <p className="text-sm text-muted">
          A session stops itself after {caps.maxUtterances} voices or {formatDuration(caps.maxMs)}, whichever comes
          first.
          {running && endsAt && ` This one ends by ${clock(endsAt)} at the latest.`}
        </p>
        {test && (
          <p className="rounded-lg border border-border p-2 text-sm">
            Test caps are on (from the address bar): {caps.maxUtterances} voices or {formatDuration(caps.maxMs)}.
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="block font-bold">Volume: {volume}%</span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={volume}
              onChange={(e) => changeVolume(Number(e.target.value))}
              className="knob"
            />
          </label>
          <label className="block">
            <span className="block font-bold">Sweep: every {sweepMs} ms</span>
            <input
              type="range"
              min={SWEEP_MIN_MS}
              max={SWEEP_MAX_MS}
              step={10}
              value={sweepMs}
              onChange={(e) => changeSweep(Number(e.target.value))}
              className="knob"
            />
          </label>
        </div>

        <div className="space-y-2">
          <h2 id="spirit-captions" className="label text-wisp">
            What the box said
          </h2>
          <div role="log" aria-live="polite" aria-label="Captions" className="ticker">
            <ol>
              {log.map((u) => (
                <li key={u.n} className="flex gap-3 border-b border-border py-1 last:border-b-0">
                  <time dateTime={new Date(u.at).toISOString()} className="shrink-0 text-sm tabular-nums text-muted">
                    {clock(u.at)}
                  </time>
                  <span className="font-bold">{u.text}</span>
                </li>
              ))}
            </ol>
            {log.length === 0 && !stopNote && (
              <p className="py-1 text-sm text-muted">Captions of every voice show up here, with the time.</p>
            )}
          </div>
        </div>
        <p className="flex items-center gap-2 font-bold text-lichen">
          {/* The panel's life sign: the living come first (REVIEW-3). */}
          <Sprout className="h-5 w-5 shrink-0" />
          {MOURNERS}
        </p>
      </section>

      <section id="seance" aria-labelledby="seance-heading" className="scroll-mt-4 space-y-4 card p-4">
        <h2 id="seance-heading" className="font-display text-2xl">
          Séance: every phone at once
        </h2>
        <p className="text-muted">{SEANCE_PITCH}</p>
        <SeanceStart
          cemetery={result?.ok ? { qid: choice, name: result.cemetery.name } : null}
          bank={ready ? bank : null}
        />
        <SeanceJoin cemeteryQid={choice} />
      </section>
    </div>
  );
}

/** Shown while the page reads the address bar: the picker's card and the same instrument, standing by. */
export function SpiritBoxFallback() {
  return (
    <div className="space-y-6">
      {/* Roughly the picker's height (legend, two cemeteries, the names line), so the panel doesn't move down. */}
      <div className="card space-y-3 p-4" aria-hidden="true">
        <p className="mb-1 font-display text-2xl">Whose names</p>
        <div className="h-[4.5rem] rounded-xl border border-border bg-surface" />
        <div className="h-[4.5rem] rounded-xl border border-border bg-surface" />
        <div className="h-[5.25rem]" />
      </div>
      <div className="instrument bezel space-y-4 p-4">
        <ReadoutStrip live={false} status="Standby" />
        <SweepDial running={false} stepMs={SWEEP_DEFAULT_MS} />
        <SpokenWord testId="spirit-latest-fallback">{""}</SpokenWord>
        <button type="button" disabled className="btn btn-primary btn-lg w-full text-2xl">
          Loading&hellip;
        </button>
        <p className="font-bold">{DISCLAIMER}</p>
        <p className="flex items-center gap-2 font-bold text-lichen">
          {/* The panel's life sign: the living come first (REVIEW-3). */}
          <Sprout className="h-5 w-5 shrink-0" />
          {MOURNERS}
        </p>
      </div>
    </div>
  );
}
