import type { Metadata } from "next";
import { Suspense } from "react";
import { EvpRecorder } from "@/components/games/EvpRecorder";

export const metadata: Metadata = {
  title: "EVP Recorder",
  description: "Record 15 seconds of graveyard quiet, then hear it backwards and slowed. Nothing leaves your phone.",
};

export default function EvpPage() {
  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <h1 className="font-display text-4xl leading-tight">EVP Recorder</h1>
        <p className="text-muted">
          Ghost hunters call voices on tape &ldquo;electronic voice phenomena.&rdquo; Record 15 seconds of the quiet
          around you, then listen to it backwards and slowed down. Wind and birds do strange things in reverse.
        </p>
      </header>
      <Suspense fallback={<p className="text-muted">Checking for a microphone&hellip;</p>}>
        <EvpRecorder />
      </Suspense>
    </div>
  );
}
