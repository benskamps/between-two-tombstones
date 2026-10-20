// EVP recorder helpers. The recording stays in memory on the phone: it is never
// uploaded or saved.

export const EVP_SECONDS = 15;
/** Shortened recording for automated tests (`?test-caps=short`); it can only shorten. */
export const EVP_TEST_SECONDS = 2;
/** Reversed and slowed: 0.7× speed drops the pitch and stretches the words. */
export const EVP_PLAYBACK_RATE = 0.7;

export function evpSeconds(testParam: string | null): number {
  return testParam === "short" ? EVP_TEST_SECONDS : EVP_SECONDS;
}

/** True when this browser can record from a microphone at all. */
export function micAvailable(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function" &&
    typeof window !== "undefined" &&
    typeof window.MediaRecorder === "function"
  );
}

/** Reversed copies of each channel. */
export function reverseChannels(channels: readonly Float32Array[]): Float32Array<ArrayBuffer>[] {
  return channels.map((c) => Float32Array.from(c).reverse());
}

/** Copy an AudioBuffer into a new one with every channel reversed. */
export function reverseBuffer(ctx: BaseAudioContext, buf: AudioBuffer): AudioBuffer {
  const out = ctx.createBuffer(buf.numberOfChannels, buf.length, buf.sampleRate);
  const channels = Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i));
  reverseChannels(channels).forEach((data, i) => out.copyToChannel(data, i));
  return out;
}

/** What to say when getUserMedia fails. */
export function micErrorMessage(err: unknown): string {
  const name = (err as { name?: string } | null)?.name;
  if (name === "NotAllowedError" || name === "SecurityError")
    return "Microphone access is blocked. Allow it for this site in your browser settings, then try again.";
  if (name === "NotFoundError" || name === "OverconstrainedError")
    return "No microphone was found on this device.";
  if (name === "NotReadableError") return "The microphone is busy in another app. Close it and try again.";
  return "Couldn’t start the microphone. Try again.";
}
