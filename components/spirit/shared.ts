// Copy and small browser helpers shared by the spirit box and séance mode.

export const DISCLAIMER = "The spirits use your phone’s text-to-speech.";
export const NO_SPEECH = "Your browser can’t speak, so the voices appear as captions.";
export const MOURNERS = "Turn it off near mourners.";

export function subscribeNothing() {
  return () => {};
}

export function audioContextClass(): typeof AudioContext | null {
  const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/** "3:12:07 PM" in the phone's own format. */
export function clock(ms: number) {
  return new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
}

const tenths = new Intl.DateTimeFormat([], {
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  fractionalSecondDigits: 1,
});

/** "3:12:07.5 PM": séance captions, so two phones' logs can be lined up by eye. */
export function clockTenths(ms: number) {
  return tenths.format(new Date(ms));
}
