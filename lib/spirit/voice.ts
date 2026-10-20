// The "voices": the phone's own text-to-speech, pitched way down and slowed.

export function speechAvailable(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as { speechSynthesis?: SpeechSynthesis; SpeechSynthesisUtterance?: unknown };
  return typeof w.speechSynthesis?.speak === "function" && typeof w.SpeechSynthesisUtterance === "function";
}

/** Pitch 0.1–0.4 (low) and rate 0.55–0.8 (slowish). */
export function voiceParams(rng: () => number): { pitch: number; rate: number } {
  return { pitch: 0.1 + rng() * 0.3, rate: 0.55 + rng() * 0.25 };
}

// Apple ships singing and effect voices with English locales; a spirit box that
// suddenly sings in "Cellos" isn't haunted, it's funny.
const NOVELTY = /^(albert|bad news|bahh|bells|boing|bubbles|cellos|deranged|good news|hysterical|jester|organ|pipe organ|superstar|trinoids|whisper|wobble|zarvox)\b/i;

/**
 * The phone's default English voice if it has one, else its first ordinary
 * English voice, else null (the browser's default for en-US).
 */
export function pickVoice(voices: readonly SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const english = voices.filter((v) => /^en([-_]|$)/i.test(v.lang) && !NOVELTY.test(v.name));
  return english.find((v) => v.default) ?? english.find((v) => v.localService) ?? english[0] ?? null;
}

/** Speak one fragment. Returns the rate used so the static can duck for about that long. */
export function speakFragment(
  text: string,
  opts: { volume: number; voice: SpeechSynthesisVoice | null; rng: () => number },
): number {
  const synth = window.speechSynthesis;
  const u = new SpeechSynthesisUtterance(text);
  const { pitch, rate } = voiceParams(opts.rng);
  u.pitch = pitch;
  u.rate = rate;
  u.volume = Math.max(0, Math.min(1, opts.volume));
  if (opts.voice) {
    u.voice = opts.voice;
    u.lang = opts.voice.lang;
  } else {
    u.lang = "en-US";
  }
  // Fragments are short and seconds apart; if one is still going, cut it off.
  if (synth.speaking || synth.pending) synth.cancel();
  synth.speak(u);
  return rate;
}

export function silenceVoices() {
  if (speechAvailable()) window.speechSynthesis.cancel();
}
