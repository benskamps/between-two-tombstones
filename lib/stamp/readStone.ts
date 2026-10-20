// Client side of "Read with Claude". The photo leaves the phone only here, only
// on a tap, and only as the two derived JPEGs.

import { formatReading, readErrorMessage, type ReadingSection } from "./reading";

export const READ_STONE_URL = "/api/read-stone";

/** Keep both images together under this (Vercel's request body cap is about 4.5 MB). */
export const READ_BODY_BUDGET = 3.8 * 1024 * 1024;

/**
 * Request body (Lane 3a's contract): multipart/form-data with exactly two
 * fields, `straightened` (the stone face, perspective-corrected) and `contrast`
 * (the same, contrast-boosted grayscale). JPEG, ≤ 1600 px on the long side.
 */
export function buildReadForm(straightened: Blob, contrast: Blob): FormData {
  const form = new FormData();
  form.append("straightened", straightened, "straightened.jpg");
  form.append("contrast", contrast, "contrast.jpg");
  return form;
}

export type ReadResult =
  | { ok: true; sections: ReadingSection[]; cached: boolean }
  /** `sections` is set when an error reply still carries a reading (422 too_blurry). */
  | { ok: false; message: string; sections?: ReadingSection[] };

export async function postReadStone(
  straightened: Blob,
  contrast: Blob,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<ReadResult> {
  let res: Response;
  try {
    res = await fetchImpl(READ_STONE_URL, { method: "POST", body: buildReadForm(straightened, contrast), signal });
  } catch {
    return { ok: false, message: "Couldn't reach the reader." };
  }
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  const sections = formatReading(json);
  if (!res.ok) {
    const message = readErrorMessage(json);
    return sections.length ? { ok: false, message, sections } : { ok: false, message };
  }
  if (!sections.length) return { ok: false, message: "The reader answered, but found nothing it could read on this stone." };
  const cached = !!(json && typeof json === "object" && (json as { cached?: unknown }).cached === true);
  return { ok: true, sections, cached };
}
