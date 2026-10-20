// GET /api/time: the server's clock, so the phones in a séance agree on what
// second it is (lib/spirit/clock.ts). No state, nothing stored or logged.
//
// No `runtime` export: with Cache Components on, Next 16 rejects it. connection()
// keeps this out of the build-time prerender, so every request gets a fresh time.

import { connection } from "next/server";

export async function GET(): Promise<Response> {
  await connection();
  return Response.json({ now: Date.now() }, { headers: { "Cache-Control": "no-store" } });
}
