// Input checks shared by the API routes and the pages.
import { z } from "zod";
import { QID_RE } from "./wikidata";

export const MIN_QUERY = 2;
export const MAX_QUERY = 100;

const decimal = /^\s*-?\d{1,3}(\.\d+)?\s*$/;

const latLon = z.object({
  lat: z.string().regex(decimal, "lat must be a decimal number").transform(Number).pipe(z.number().min(-90).max(90)),
  lon: z.string().regex(decimal, "lon must be a decimal number").transform(Number).pipe(z.number().min(-180).max(180)),
});

export type Invalid = { ok: false; message: string };

export function parseQid(raw: string | null | undefined): { ok: true; qid: string } | Invalid {
  const qid = (raw ?? "").trim().toUpperCase();
  return QID_RE.test(qid) ? { ok: true, qid } : { ok: false, message: "That isn't a Wikidata ID (it should look like Q2008469)." };
}

export function parseLatLon(lat: string | null | undefined, lon: string | null | undefined): { ok: true; lat: number; lon: number } | Invalid {
  const r = latLon.safeParse({ lat: lat ?? "", lon: lon ?? "" });
  if (!r.success) return { ok: false, message: "We need a location as lat (−90 to 90) and lon (−180 to 180)." };
  return { ok: true, ...r.data };
}

export function parseQuery(raw: string | null | undefined): { ok: true; q: string } | Invalid {
  const q = (raw ?? "").trim().replace(/\s+/g, " ");
  if (q.length < MIN_QUERY) return { ok: false, message: `Type at least ${MIN_QUERY} letters of the cemetery's name.` };
  if (q.length > MAX_QUERY) return { ok: false, message: `That's too long. Use up to ${MAX_QUERY} characters.` };
  return { ok: true, q };
}

/** 400 body for our own input checks (not a data source failure). */
export function badRequest(message: string): Response {
  return Response.json({ error: { message } }, { status: 400, headers: { "Cache-Control": "no-store" } });
}
