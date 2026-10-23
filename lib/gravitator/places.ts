// Places anyone can swipe without sharing a location: the Gravitator's start
// screen and the home page both link straight to these decks.

export const SAMPLE_PLACES = [
  { label: "Atlanta", button: "Try it around Atlanta", lat: 33.7486, lon: -84.3733 },
  { label: "Savannah, GA", button: "Try it around Savannah, GA", lat: 32.0809, lon: -81.0912 },
  { label: "New Orleans, LA", button: "Try it around New Orleans, LA", lat: 29.9511, lon: -90.0715 },
  { label: "Sleepy Hollow, NY", button: "Try it around Sleepy Hollow, NY", lat: 41.0956, lon: -73.8607 },
] as const;

export function deckHref(lat: number, lon: number, opts: { near?: string; r?: number } = {}): string {
  const q = new URLSearchParams({ lat: lat.toFixed(4), lon: lon.toFixed(4) });
  if (opts.near) q.set("near", opts.near);
  if (opts.r && opts.r !== 25) q.set("r", String(opts.r));
  return `/gravitator?${q}`;
}
