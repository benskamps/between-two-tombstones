// Turn what /api/read-stone returns into labelled lines for the page.
// Contract (Lane 3a):
//   200 → { reading: { people: [{ name, birth?, death?, aged? }], epitaph?, symbols: [{ name, meaning }],
//                      material?, legibility: "clear"|"partial"|"poor", notes?, transcription: string,
//                      checks: string[] }, cached: boolean }
//   error → { error: { source, code, message, retryAfterSeconds? }, reading? }  (422 too_blurry carries reading)
// Everything here is defensive: unexpected shapes degrade to fewer lines, never a crash.

export type ReadingSection = { label: string; lines: string[] };

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null);

function lines(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(lines);
  const s = str(value);
  if (s) return [s];
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    const name = str(o.name);
    const meaning = str(o.meaning);
    if (name && meaning) return [`${name}: ${meaning}`];
    if (name) return [name];
  }
  return [];
}

function person(p: unknown): string | null {
  if (typeof p === "string") return str(p);
  if (!p || typeof p !== "object") return null;
  const o = p as Record<string, unknown>;
  const name = str(o.name);
  if (!name) return null;
  const parts = [name];
  const birth = str(o.birth);
  const death = str(o.death);
  const aged = str(o.aged);
  if (birth) parts.push(`born ${birth}`);
  if (death) parts.push(`died ${death}`);
  if (aged) parts.push(`aged ${aged}`);
  return parts.join(" · ");
}

/** The reading object from a reply body: `{ reading }` per the contract, or a bare reading. */
export function readingOf(json: unknown): Record<string, unknown> | null {
  if (!json || typeof json !== "object") return null;
  const root = json as Record<string, unknown>;
  if (root.reading && typeof root.reading === "object") return root.reading as Record<string, unknown>;
  if ("transcription" in root || "people" in root) return root;
  return null;
}

export function formatReading(json: unknown): ReadingSection[] {
  const r = readingOf(json);
  if (!r) return [];
  const sections: ReadingSection[] = [];
  const add = (label: string, l: string[]) => {
    if (l.length) sections.push({ label, lines: l });
  };
  const transcription = typeof r.transcription === "string" ? r.transcription.trim() : "";
  add("What the stone says", transcription ? [transcription] : []);
  add("Names", (Array.isArray(r.people) ? r.people : [r.people]).map(person).filter((x): x is string => !!x));
  add("Epitaph", lines(r.epitaph));
  add("Symbols", lines(r.symbols));
  add("Material", lines(r.material));
  add("Legibility", lines(r.legibility));
  add("Notes", lines(r.notes));
  add("Check by eye", lines(r.checks));
  return sections;
}

/** The message to show for a failed read: the route's `error.message` as-is when it has one. */
export function readErrorMessage(json: unknown): string {
  const fallback = "Couldn't reach the reader.";
  if (!json || typeof json !== "object") return fallback;
  const err = (json as { error?: unknown }).error;
  if (err && typeof err === "object") {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === "string" && msg.trim()) return msg;
  }
  return fallback;
}
