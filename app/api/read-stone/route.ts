// "Read with Claude": see lib/readstone/handler.ts for the flow and
// lib/readstone/types.ts for the request/response contract.
//
// No `runtime` export: with Cache Components on, Next 16 runs route handlers on
// Node.js and rejects the `runtime` segment config, even `runtime = 'nodejs'`.

import { handleReadStone } from "@/lib/readstone/handler";

/** Seconds. Claude gets 50 s (no retries); the rest covers upload and checks. */
export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  return handleReadStone(request);
}
