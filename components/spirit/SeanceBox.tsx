"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { syncClock, type ClockSync } from "@/lib/spirit/clock";
import { SWEEP_DEFAULT_MS, speechSeconds, startNoise, type NoiseEngine } from "@/lib/spirit/engine";
import { loadCemetery, type LoadResult, type SampleCemetery } from "@/lib/spirit/load";
import {
  STEP_MS,
  bankHash,
  createSeanceSession,
  seancePath,
  seanceStopMessage,
  type SeanceSession,
  type SeanceUtterance,
} from "@/lib/spirit/seance";
import { formatDuration, type SpiritCaps } from "@/lib/spirit/session";
import { pickVoice, silenceVoices, speakFragment, speechAvailable, unlockSpeech } from "@/lib/spirit/voice";
import { bankHasNames, buildWordBank } from "@/lib/spirit/wordbank";
import { Sprout } from "@/components/ui/symbols";
import { ReadoutStrip, SplitFlap, SpokenWord, SweepDial } from "@/components/ui/Instrument";
import { SeanceInvite } from "./SeanceInvite";
import { DISCLAIMER, MOURNERS, NO_SPEECH, audioContextClass, clockTenths, subscribeNothing } from "./shared";

export const DRIFT_WARNING = "Using this phone’s clock; voices may drift by a second.";
export const MISMATCH_WARNING = "Your copy of the names differs from the host’s, so some voices won’t line up.";

type Phase = "idle" | "countdown" | "live";

/** Live objects kept out of React state because they're not rendered. */
type Runtime = {
  ctx: AudioContext | null;
  noise: NoiseEngine | null;
  session: SeanceSession | null;
  volume: number;
  /** Shared clock = Date.now() + offset. 0 until /api/time answers (or for good, if it can't). */
  offset: number;
};

/**
 * Séance mode for one phone. Nothing plays until this phone's own tap on
 * "Join the séance"; then it counts down to the next 10 s boundary of the
 * shared clock and speaks the room's schedule.
 */
export function SeanceBox({
  samples,
  room,
  cemetery,
  linkBank,
  caps,
  test,
}: {
  samples: SampleCemetery[];
  room: string;
  cemetery: string;
  /** The host's bank hash from the link, or null when joined by typing the code. */
  linkBank: string | null;
  caps: SpiritCaps;
  test: boolean;
}) {
  const canSpeak = useSyncExternalStore(subscribeNothing, speechAvailable, () => true);
  const [result, setResult] = useState<LoadResult | null>(null);
  const [clockSync, setClockSync] = useState<ClockSync | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [countdown, setCountdown] = useState<number | null>(null);
  const [log, setLog] = useState<SeanceUtterance[]>([]);
  const [stopNote, setStopNote] = useState<string | null>(null);
  const [audioNote, setAudioNote] = useState<string | null>(null);
  const [volume, setVolume] = useState(70);
  const rt = useRef<Runtime>({ ctx: null, noise: null, session: null, volume: 70, offset: 0 });

  const bank = useMemo(() => (result?.ok ? buildWordBank(result.cemetery.people) : null), [result]);
  const ownHash = useMemo(() => (bank ? bankHash(bank) : null), [bank]);
  const ready = bank !== null && bankHasNames(bank);
  const mismatch = linkBank !== null && ownHash !== null && linkBank !== ownHash;
  const running = phase !== "idle";
  const sample = samples.find((s) => s.qid === cemetery);
  const cemeteryName = result?.ok ? result.cemetery.name : (sample?.name ?? cemetery);
  const inviteHash = linkBank ?? ownHash;

  // The names: live route first, the saved copy for the samples (same as the spirit box).
  useEffect(() => {
    const ctrl = new AbortController();
    loadCemetery(cemetery, { fallback: samples.find((s) => s.qid === cemetery), signal: ctrl.signal }).then((r) => {
      if (!ctrl.signal.aborted) setResult(r);
    });
    return () => ctrl.abort();
  }, [cemetery, samples]);

  // Set the shared clock as soon as the page opens, so Join can start counting down at once.
  useEffect(() => {
    const ctrl = new AbortController();
    syncClock({ signal: ctrl.signal }).then((s) => {
      if (ctrl.signal.aborted) return;
      rt.current.offset = s.offset;
      setClockSync(s);
    });
    return () => ctrl.abort();
  }, []);

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

  function join() {
    const r = rt.current;
    if (!bank || !ready || r.session) return;

    // 1. Static, created or resumed inside this tap so iOS lets it play. Its band
    //    follows the shared schedule instead of sweeping on its own.
    let noise: NoiseEngine | null = null;
    try {
      const AC = audioContextClass();
      if (AC) {
        r.ctx = r.ctx ?? new AC();
        void r.ctx.resume().catch(() => {});
        noise = startNoise(r.ctx, { sweepMs: SWEEP_DEFAULT_MS, volume: volume / 100, autoSweep: false });
      }
    } catch {
      noise = null;
    }
    r.noise = noise;
    setAudioNote(noise ? null : "Your browser can’t play the static, so this séance is voices only.");

    // 2. Voices come seconds from now, on the shared clock; unlock speech inside the tap (iOS).
    if (canSpeak) {
      try {
        unlockSpeech();
      } catch {
        // The captions still show.
      }
    }

    const session = createSeanceSession({
      seed: { room, cemetery },
      bank,
      caps,
      now: () => Date.now() + r.offset,
      onBand: (b) => r.noise?.setBand(b.frequency, b.q),
      onCountdown: (n) => setCountdown(n),
      onLive: () => {
        setPhase("live");
        setCountdown(null);
      },
      speak: (slot) => {
        if (canSpeak) {
          try {
            // Voices can arrive after the page opens (Chrome), so look each time.
            const voice = pickVoice(window.speechSynthesis.getVoices());
            speakFragment(slot.text, { volume: r.volume / 100, voice, rng: Math.random, rate: slot.rate });
          } catch {
            // Speech failed for this one; the caption still shows.
          }
        }
        r.noise?.duck(speechSeconds(slot.text, slot.rate));
      },
      onUtterance: (u) => setLog((prev) => [u, ...prev]),
      onStop: (reason) => {
        r.noise?.stop();
        r.noise = null;
        r.session = null;
        silenceVoices();
        r.ctx?.suspend().catch(() => {});
        setPhase("idle");
        setCountdown(null);
        setStopNote(seanceStopMessage(reason, caps));
      },
    });
    r.session = session;
    setLog([]);
    setStopNote(null);
    setPhase("countdown");
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

  const latest = log[0];
  let big = "";
  if (phase === "countdown") big = countdown !== null ? `The séance begins in ${countdown}…` : "…";
  else if (phase === "live") big = latest ? `…${latest.text}…` : "…";

  return (
    <div className="space-y-6">
      <section aria-labelledby="seance-title" className="space-y-2">
        <h2 id="seance-title" className="font-display text-3xl">
          Séance {room}
        </h2>
        <p>
          Names from {cemeteryName}. Every phone on this link speaks the same words at the same second. Each person
          taps Join on their own phone; nothing plays until they do.
        </p>
        <div role="status" className="space-y-1 text-sm">
          {!result && <p className="text-muted">Loading the names&hellip;</p>}
          {result && !result.ok && (
            <p className="text-danger">
              {result.message} Ask the host to start the séance with a sample cemetery.
            </p>
          )}
          {result?.ok && bank && (
            <>
              {ready ? (
                <p>
                  {bank.eligibleCount === 1 ? "1 person" : `${bank.eligibleCount} people`} buried there died 75 or more
                  years ago; only {bank.eligibleCount === 1 ? "that name is" : "their names are"} used.
                </p>
              ) : (
                <p className="text-danger">
                  Nobody in the list for {result.cemetery.name} died 75 or more years ago, so there are no names to
                  use.
                </p>
              )}
              {result.note && <p className="text-muted">{result.note}</p>}
            </>
          )}
          {clockSync === null && <p className="text-muted">Setting this phone’s clock from the server&hellip;</p>}
          {clockSync?.source === "server" && (
            <p className="text-muted">
              Clock set from the server, to within about {Math.max(1, Math.round(clockSync.rtt / 2))} ms.
            </p>
          )}
        </div>
        {clockSync?.source === "device" && <p className="font-bold text-danger">{DRIFT_WARNING}</p>}
        {mismatch && <p className="font-bold text-danger">{MISMATCH_WARNING}</p>}
        {linkBank === null && ready && (
          <p className="text-sm text-muted">
            You joined by room code, so this phone can’t check its names against the host’s. Make sure everyone
            picked {cemeteryName}.
          </p>
        )}
      </section>

      {/* The same instrument as the spirit box; the dial steps with the shared schedule. */}
      <section aria-label="Controls" className="instrument bezel space-y-4 p-4">
        {/* The room code, big: two phones side by side match before the first word lands (REVIEW-3). */}
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <p className="label text-muted">Room</p>
          <SplitFlap value={room} testId="seance-room-code" />
        </div>
        <ReadoutStrip
          live={phase === "live"}
          status={phase === "countdown" ? `T−${countdown ?? ""}` : phase === "live" ? "Live" : "Standby"}
          values={[
            {
              value:
                clockSync === null
                  ? "Clock syncing"
                  : clockSync.source === "server"
                    ? `Clock ±${Math.max(1, Math.round(clockSync.rtt / 2))} ms`
                    : "Phone clock",
            },
          ]}
        />
        <SweepDial running={running} stepMs={STEP_MS} />
        <SpokenWord key={phase === "live" ? (latest?.k ?? "live") : phase} testId="seance-latest" digits={phase === "countdown"}>
          {big}
        </SpokenWord>
        <button
          type="button"
          onClick={running ? stop : join}
          disabled={!running && !ready}
          className={`btn btn-lg w-full text-2xl ${running ? "btn-stop" : "btn-primary"}`}
        >
          {running ? "Stop" : result ? "Join the séance" : "Loading…"}
        </button>
        <p className="font-bold">{DISCLAIMER}</p>
        {!canSpeak && <p className="text-danger">{NO_SPEECH}</p>}
        {audioNote && <p className="text-danger">{audioNote}</p>}
        {/* Screen readers get the countdown here; the captions log announces the voices. */}
        <p className="sr-only" aria-live="polite">
          {phase === "countdown" && countdown !== null ? `The séance begins in ${countdown}` : ""}
        </p>
        {stopNote && (
          <p role="status" className="rounded-lg border border-border bg-surface-2 p-3 font-bold">
            {stopNote}
          </p>
        )}
        <p className="text-sm text-muted">
          On each phone a séance stops itself after {caps.maxUtterances} voices or {formatDuration(caps.maxMs)} from
          the start, whichever comes first.
        </p>
        {test && (
          <p className="rounded-lg border border-border p-2 text-sm">
            Test caps are on (from the address bar): {caps.maxUtterances} voices or {formatDuration(caps.maxMs)}.
          </p>
        )}
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
        <p className="text-sm text-muted">The static steps in time with the other phones, so there’s no sweep control.</p>

        <div className="space-y-2">
          <h2 id="seance-captions" className="label text-wisp">
            What the spirits said
          </h2>
          <div role="log" aria-live="polite" aria-label="Captions" className="ticker">
            <ol>
              {log.map((u) => (
                <li key={u.k} data-slot={u.k} className="flex gap-3 border-b border-border py-1 last:border-b-0">
                  <time dateTime={new Date(u.at).toISOString()} className="shrink-0 text-sm tabular-nums text-muted">
                    {clockTenths(u.at)}
                  </time>
                  <span className="font-bold">{u.text}</span>
                </li>
              ))}
            </ol>
            {log.length === 0 && !stopNote && (
              <p className="py-1 text-sm text-muted">
                Each voice shows up here with the time it was due on the shared clock, so phones can be compared side
                by side.
              </p>
            )}
          </div>
        </div>
        <p className="flex items-center gap-2 font-bold text-lichen">
          {/* The panel's life sign: the living come first (REVIEW-3). */}
          <Sprout className="h-5 w-5 shrink-0" />
          {MOURNERS}
        </p>
      </section>

      <section aria-labelledby="seance-invite" className="space-y-3 card p-4">
        <h2 id="seance-invite" className="font-display text-2xl">
          Bring in more phones
        </h2>
        <SeanceInvite code={room} path={seancePath(room, cemetery, inviteHash)} cemeteryName={cemeteryName} />
        <Link href="/spirit" className="btn btn-ghost w-full">
          Leave the séance
        </Link>
      </section>
    </div>
  );
}
