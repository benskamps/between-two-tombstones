"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { ReadoutStrip } from "@/components/ui/Instrument";
import { SymbolPair } from "@/components/ui/Motifs";
import { Lily, Moth } from "@/components/ui/symbols";
import { EVP_PLAYBACK_RATE, evpSeconds, micAvailable, micErrorMessage, reverseBuffer } from "@/lib/games/evp";
import "./games.css";

type Phase = "idle" | "recording" | "processing" | "ready" | "playing";

type Runtime = {
  ctx: AudioContext | null;
  stream: MediaStream | null;
  recorder: MediaRecorder | null;
  source: AudioBufferSourceNode | null;
  reversed: AudioBuffer | null;
  timers: Set<ReturnType<typeof setTimeout>>;
  ticker: ReturnType<typeof setInterval> | null;
  disposed: boolean;
};

function subscribeNothing() {
  return () => {};
}

/** null while rendering on the server, then true/false in the browser. */
export function useMicAvailable(): boolean | null {
  return useSyncExternalStore<boolean | null>(subscribeNothing, micAvailable, () => null);
}

/** Games hub entry; hidden entirely when the browser has no microphone API. */
export function EvpHubLink() {
  const mic = useMicAvailable();
  if (!mic) return null;
  return (
    <li>
      <Link href="/games/evp" className="card tap flex items-center gap-4 p-4">
        <span aria-hidden="true" className="games-medallion">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M2.5 12h3l1.5-4 2 9 2.5-12 2.5 14 2-9 1.5 4.5 1.2-2.5h3.3" />
          </svg>
        </span>
        <span>
          <span className="font-display text-xl">EVP Recorder</span>
          <span className="block text-muted">
            Record 15 seconds of the quiet, then hear it played backwards and slowed.
          </span>
        </span>
      </Link>
    </li>
  );
}

function audioContextClass(): typeof AudioContext | null {
  const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

export function EvpRecorder() {
  const params = useSearchParams();
  const seconds = evpSeconds(params.get("test-caps"));
  const mic = useMicAvailable();
  const [phase, setPhase] = useState<Phase>("idle");
  const [remaining, setRemaining] = useState(seconds);
  const [duration, setDuration] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rt = useRef<Runtime>({
    ctx: null,
    stream: null,
    recorder: null,
    source: null,
    reversed: null,
    timers: new Set(),
    ticker: null,
    disposed: false,
  });

  function clearTimers() {
    const r = rt.current;
    for (const id of r.timers) clearTimeout(id);
    r.timers.clear();
    if (r.ticker !== null) clearInterval(r.ticker);
    r.ticker = null;
  }

  function releaseMic() {
    const r = rt.current;
    r.stream?.getTracks().forEach((t) => t.stop());
    r.stream = null;
  }

  function stopRecording() {
    const r = rt.current;
    clearTimers();
    if (r.recorder && r.recorder.state !== "inactive") r.recorder.stop();
    else releaseMic();
  }

  function stopPlayback() {
    const r = rt.current;
    const src = r.source;
    r.source = null;
    if (src) {
      try {
        src.stop();
      } catch {
        // Already ended.
      }
      src.disconnect();
    }
  }

  // Stop recording/playback when the page is hidden; release everything on unmount.
  useEffect(() => {
    const r = rt.current;
    r.disposed = false;
    const onHide = () => {
      if (document.visibilityState !== "hidden") return;
      if (r.recorder && r.recorder.state !== "inactive") {
        for (const id of r.timers) clearTimeout(id);
        r.timers.clear();
        if (r.ticker !== null) clearInterval(r.ticker);
        r.ticker = null;
        r.recorder.stop();
      }
      if (r.source) {
        try {
          r.source.stop();
        } catch {
          // Already ended.
        }
      }
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      r.disposed = true;
      for (const id of r.timers) clearTimeout(id);
      r.timers.clear();
      if (r.ticker !== null) clearInterval(r.ticker);
      r.ticker = null;
      if (r.recorder && r.recorder.state !== "inactive") r.recorder.stop();
      r.stream?.getTracks().forEach((t) => t.stop());
      r.stream = null;
      try {
        r.source?.stop();
      } catch {
        // Already ended.
      }
      r.source = null;
      r.ctx?.close().catch(() => {});
      r.ctx = null;
    };
  }, []);

  async function record() {
    const r = rt.current;
    if (r.recorder) return;
    setError(null);
    stopPlayback();
    // Create/resume the AudioContext inside this tap so iOS lets playback start later.
    try {
      const AC = audioContextClass();
      if (AC) {
        r.ctx = r.ctx ?? new AC();
        void r.ctx.resume().catch(() => {});
      }
    } catch {
      r.ctx = null;
    }
    if (!r.ctx) {
      setError("This browser can’t play audio back, so the recorder can’t work here.");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      setError(micErrorMessage(e));
      return;
    }
    if (r.disposed) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    r.stream = stream;

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream);
    } catch {
      releaseMic();
      setError("This browser can’t record audio.");
      return;
    }
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = async () => {
      clearTimers();
      releaseMic();
      r.recorder = null;
      if (r.disposed || !r.ctx) return;
      setPhase("processing");
      try {
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        const decoded = await r.ctx.decodeAudioData(await blob.arrayBuffer());
        if (r.disposed) return;
        r.reversed = reverseBuffer(r.ctx, decoded);
        setDuration(decoded.duration);
        setPhase("ready");
      } catch {
        r.reversed = null;
        setError("Couldn’t decode the recording on this browser. Try again.");
        setPhase("idle");
      }
    };
    r.recorder = recorder;
    recorder.start();
    const startedAt = Date.now();
    setRemaining(seconds);
    setPhase("recording");
    const stopId = setTimeout(() => {
      r.timers.delete(stopId);
      stopRecording();
    }, seconds * 1000);
    r.timers.add(stopId);
    r.ticker = setInterval(() => {
      setRemaining(Math.max(0, Math.ceil(seconds - (Date.now() - startedAt) / 1000)));
    }, 250);
  }

  function play() {
    const r = rt.current;
    if (!r.ctx || !r.reversed) return;
    void r.ctx.resume().catch(() => {});
    stopPlayback();
    const src = r.ctx.createBufferSource();
    src.buffer = r.reversed;
    src.playbackRate.value = EVP_PLAYBACK_RATE;
    src.connect(r.ctx.destination);
    src.onended = () => {
      if (r.source !== src) return;
      r.source = null;
      src.disconnect();
      setPhase("ready");
    };
    r.source = src;
    src.start();
    setPhase("playing");
  }

  function stopPlay() {
    stopPlayback();
    setPhase("ready");
  }

  if (mic === null) return <EvpPanel phase="idle" readout={["EVP", "Standby"]} note="Checking for a microphone…" />;
  if (!mic) {
    return (
      <p className="card p-4">
        This browser can&rsquo;t record from a microphone, so the EVP recorder is hidden.{" "}
        <Link href="/games" className="underline">
          Back to the games
        </Link>
      </p>
    );
  }

  const elapsed = seconds - remaining;
  const played = duration !== null ? duration / EVP_PLAYBACK_RATE : null;
  const readout: string[] =
    phase === "recording"
      ? ["Rec", `${clock(elapsed)} / ${clock(seconds)}`]
      : phase === "processing"
        ? ["Reversing"]
        : phase === "playing"
          ? ["Playback", `${Math.round(EVP_PLAYBACK_RATE * 100)}%`, played !== null ? clock(played) : ""]
          : phase === "ready"
            ? ["Reversed", played !== null ? clock(played) : ""]
            : ["Standby", clock(seconds)];

  return (
    <div className="space-y-5">
      <EvpPanel phase={phase} readout={["EVP", ...readout.filter(Boolean)]}>
        {(phase === "ready" || phase === "playing") && duration !== null && (
          <p role="status">
            Recorded {duration.toFixed(1)} seconds. Played backwards at {Math.round(EVP_PLAYBACK_RATE * 100)}% speed it
            lasts {(duration / EVP_PLAYBACK_RATE).toFixed(1)} seconds.
          </p>
        )}
        {(phase === "ready" || phase === "playing") &&
          duration !== null &&
          (phase === "playing" ? (
            <button type="button" onClick={stopPlay} className="btn btn-ghost btn-lg w-full">
              Stop playback
            </button>
          ) : (
            <button type="button" onClick={play} className="btn btn-primary btn-lg w-full">
              Play it backwards
            </button>
          ))}
        {/* One button element in this slot throughout, so focus stays on it from Record to Recording to Record again. */}
        {phase === "recording" ? (
          <button type="button" onClick={stopRecording} className="btn btn-lg w-full btn-stop">
            Recording&hellip; {remaining} s (tap to stop early)
          </button>
        ) : (
          <button
            type="button"
            onClick={record}
            disabled={phase === "processing"}
            className={`btn btn-lg w-full ${duration === null ? "btn-primary" : "btn-ghost"}`}
          >
            {phase === "processing"
              ? "Reversing…"
              : duration === null
                ? `Record ${seconds} seconds`
                : `Record again (${seconds} s)`}
          </button>
        )}

        {error && (
          <p role="alert" className="text-danger">
            {error}
          </p>
        )}
      </EvpPanel>
      <section aria-labelledby="evp-tips" className="card space-y-2 p-4">
        <h2 id="evp-tips" className="flex items-center gap-2 font-display text-2xl">
          <SymbolPair death={<Moth className="h-5 w-5" />} life={<Lily className="h-5 w-5" />} />
          How to listen
        </h2>
        <ul className="list-disc space-y-1 pl-5 marker:text-muted">
          <li>Hold still and keep quiet: your breathing and footsteps record too.</li>
          <li>Shield the microphone from strong wind; a gust drowns out everything else.</li>
          <li>Headphones help. Keep the volume low near mourners.</li>
        </ul>
      </section>
    </div>
  );
}

/** "0:07", or "0:02.9" with tenths for a recording's length. */
function clock(sec: number): string {
  const s = Math.max(0, sec);
  const whole = Number.isInteger(s);
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  return `${m}:${whole ? String(rest).padStart(2, "0") : rest.toFixed(1).padStart(4, "0")}`;
}

/**
 * A seeded scribble of a waveform: two identical periods side by side (viewBox
 * 400 × 100), so sliding it left by half loops without a seam.
 */
function wave(seed: number, amp: number): string {
  let x = seed;
  const rnd = () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648;
  };
  const n = 64;
  const ys = Array.from({ length: n }, (_, i) => {
    const envelope = 0.3 + 0.7 * Math.abs(Math.sin((i / n) * Math.PI * 3));
    return 50 + (rnd() * 2 - 1) * envelope * amp;
  });
  const pts: string[] = [];
  for (let k = 0; k < 2; k++) ys.forEach((y, i) => pts.push(`${(k * 200 + (i / n) * 200).toFixed(1)} ${y.toFixed(1)}`));
  pts.push(`400 ${ys[0].toFixed(1)}`);
  return `M${pts.join("L")}`;
}
const LIVE_WAVE = wave(7, 40);
const FLAT_WAVE = wave(3, 2.5);

/** The recorder as an instrument: a readout strip, an oscilloscope, the controls, and the privacy line at its foot. */
function EvpPanel({
  phase,
  readout,
  note,
  children,
}: {
  phase: Phase;
  readout: string[];
  note?: string;
  children?: ReactNode;
}) {
  const live = phase === "recording" || phase === "playing";
  const trace = phase === "idle" || phase === "processing" ? FLAT_WAVE : LIVE_WAVE;
  return (
    <div className="instrument bezel space-y-4 p-4" data-testid="evp-panel">
      <ReadoutStrip testId="evp-readouts" live={live} items={readout.map((value) => ({ value }))} />
      <div className="evp-scope" data-phase={phase} aria-hidden="true">
        <svg viewBox="0 0 400 100" preserveAspectRatio="none" className="evp-trace">
          <path
            d={trace}
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.25}
            strokeWidth={5}
            vectorEffect="non-scaling-stroke"
          />
          <path d={trace} fill="none" stroke="currentColor" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
      {note && (
        <p role="status" className="text-muted">
          {note}
        </p>
      )}
      {children}
      <p className="text-sm text-muted">
        The recording stays on this phone. It is never uploaded or saved, and it&rsquo;s gone when you leave the page.
      </p>
    </div>
  );
}
