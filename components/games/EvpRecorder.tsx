"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { EVP_PLAYBACK_RATE, evpSeconds, micAvailable, micErrorMessage, reverseBuffer } from "@/lib/games/evp";

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
      <Link href="/games/evp" className="tap block rounded-xl border border-border bg-surface p-4">
        <span className="font-display text-xl">EVP Recorder</span>
        <span className="block text-muted">Record 15 seconds of the quiet, then hear it played backwards and slowed.</span>
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

  if (mic === null) return <p className="text-muted">Checking for a microphone&hellip;</p>;
  if (!mic) {
    return (
      <p className="rounded-xl border border-border bg-surface p-4">
        This browser can&rsquo;t record from a microphone, so the EVP recorder is hidden.{" "}
        <Link href="/games" className="underline">
          Back to the games
        </Link>
      </p>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-border bg-surface p-4">
      {phase === "recording" ? (
        <button
          type="button"
          onClick={stopRecording}
          className="tap w-full rounded-xl border-2 border-danger px-6 py-5 text-2xl font-bold text-danger"
        >
          Recording&hellip; {remaining} s (tap to stop early)
        </button>
      ) : (
        <button
          type="button"
          onClick={record}
          disabled={phase === "processing"}
          className="tap w-full rounded-xl bg-accent px-6 py-5 text-2xl font-bold text-accent-ink disabled:opacity-60"
        >
          {phase === "processing"
            ? "Reversing…"
            : duration === null
              ? `Record ${seconds} seconds`
              : `Record again (${seconds} s)`}
        </button>
      )}

      {(phase === "ready" || phase === "playing") && duration !== null && (
        <div className="space-y-2">
          <p role="status">
            Recorded {duration.toFixed(1)} seconds. Played backwards at {Math.round(EVP_PLAYBACK_RATE * 100)}% speed it
            lasts {(duration / EVP_PLAYBACK_RATE).toFixed(1)} seconds.
          </p>
          {phase === "playing" ? (
            <button type="button" onClick={stopPlay} className="tap w-full rounded-xl border border-border px-5 font-bold">
              Stop playback
            </button>
          ) : (
            <button
              type="button"
              onClick={play}
              className="tap w-full rounded-xl border-2 border-accent px-5 text-lg font-bold"
            >
              Play it backwards
            </button>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      <p className="text-sm text-muted">
        The recording stays on this phone. It is never uploaded or saved, and it&rsquo;s gone when you leave the page.
      </p>
    </div>
  );
}
