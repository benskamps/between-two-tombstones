// POST /api/read-stone: two photos of one gravestone in, a checked transcription out.
//
// Order of work: API key → images (size, magic bytes, pixels) → cache by image
// hash → rate limits (phone, network) → daily spend cap → Claude → checks.
// Image bytes are never stored, logged or echoed; logs carry a hash prefix and
// token counts only.

import Anthropic, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  AuthenticationError,
  BadRequestError,
  PermissionDeniedError,
  RateLimitError,
} from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { clientIp, deviceFromRequest } from "./device";
import {
  DailyBudget,
  DEVICE_RULES,
  estimateCostUsd,
  HOUR,
  IP_RULES,
  LruCache,
  SlidingWindowLimiter,
  whenAgain,
} from "./limits";
import { checkReading } from "./postcheck";
import { READ_STONE_MODEL, READ_STONE_SYSTEM_PROMPT, READ_STONE_USER_TEXT } from "./prompt";
import { pairHash, readStoneImages, toBase64, type StoneImage } from "./request";
import {
  ModelReadingSchema,
  type ReadStoneError,
  type ReadStoneErrorCode,
  type ReadStoneSuccess,
  type StoneReading,
} from "./types";

export const NO_KEY_MESSAGE = "Reading stones is switched off: the server has no API key.";
export const TOO_BLURRY_MESSAGE =
  "This photo is too blurry to read. Try again closer, in shade, with the whole face of the stone in frame.";

/** Used when CLAUDE_DAILY_USD_CAP is unset or not a number ≥ 0. */
export const DEFAULT_DAILY_USD_CAP = 5;
/** Held against the cap while a read is running, so parallel reads can't all slip under it. */
const IN_FLIGHT_ESTIMATE_USD = 0.05;
/** Leaves room under the route's maxDuration (60 s). No SDK retries, so this is the whole wait. */
export const CLAUDE_TIMEOUT_MS = 50_000;
const MAX_OUTPUT_TOKENS = 16_000;

type Outcome =
  | { kind: "reading"; reading: StoneReading }
  | { kind: "error"; status: number; source: ReadStoneError["error"]["source"]; code: ReadStoneErrorCode; message: string };

// Per-instance state. Best effort by design (decision 12).
const deviceLimiter = new SlidingWindowLimiter(DEVICE_RULES);
const ipLimiter = new SlidingWindowLimiter(IP_RULES);
const budget = new DailyBudget();
const cache = new LruCache<StoneReading>(200, 24 * HOUR);
const inFlight = new Map<string, Promise<Outcome>>();
let warnedAboutCap = false;

/** Test hook: forget limits, spend, cache and in-flight reads. */
export function resetReadStoneState(): void {
  deviceLimiter.clear();
  ipLimiter.clear();
  budget.clear();
  cache.clear();
  inFlight.clear();
  warnedAboutCap = false;
}

export function dailyCapUsd(): number {
  const raw = process.env.CLAUDE_DAILY_USD_CAP?.trim();
  if (!raw) return DEFAULT_DAILY_USD_CAP;
  const cap = Number(raw);
  if (Number.isFinite(cap) && cap >= 0) return cap;
  if (!warnedAboutCap) {
    warnedAboutCap = true;
    console.warn(`[read-stone] CLAUDE_DAILY_USD_CAP is not a number; using $${DEFAULT_DAILY_USD_CAP}.`);
  }
  return DEFAULT_DAILY_USD_CAP;
}

function json(body: ReadStoneSuccess | ReadStoneError, status: number, extra: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", ...extra } });
}

function errorResponse(
  status: number,
  source: ReadStoneError["error"]["source"],
  code: ReadStoneErrorCode,
  message: string,
  opts: { setCookie?: string; retryAfterMs?: number; reading?: StoneReading } = {},
): Response {
  const headers: Record<string, string> = {};
  if (opts.setCookie) headers["Set-Cookie"] = opts.setCookie;
  const body: ReadStoneError = { error: { source, code, message } };
  if (opts.retryAfterMs !== undefined) {
    const seconds = Math.max(1, Math.ceil(opts.retryAfterMs / 1000));
    body.error.retryAfterSeconds = seconds;
    headers["Retry-After"] = String(seconds);
  }
  if (opts.reading) body.reading = opts.reading;
  return json(body, status, headers);
}

function outcomeResponse(outcome: Outcome, cached: boolean, setCookie?: string): Response {
  if (outcome.kind === "error") {
    return errorResponse(outcome.status, outcome.source, outcome.code, outcome.message, { setCookie });
  }
  if (outcome.reading.legibility === "poor") {
    return errorResponse(422, "Claude", "too_blurry", TOO_BLURRY_MESSAGE, { setCookie, reading: outcome.reading });
  }
  return json({ reading: outcome.reading, cached }, 200, setCookie ? { "Set-Cookie": setCookie } : {});
}

function log(fields: Record<string, string | number | boolean | null>): void {
  console.info(`[read-stone] ${JSON.stringify(fields)}`);
}

function claudeError(status: number, code: ReadStoneErrorCode, message: string): Outcome {
  return { kind: "error", status, source: "Claude", code, message };
}

/** SDK errors to plain outcomes, most specific class first. */
function outcomeForSdkError(err: unknown): Outcome {
  if (err instanceof APIConnectionTimeoutError) {
    return claudeError(504, "timeout", "Claude took too long to answer. Try again in a moment.");
  }
  if (err instanceof APIConnectionError) {
    return claudeError(502, "upstream", "Couldn't reach Claude. Check your signal and try again in a minute.");
  }
  if (err instanceof AuthenticationError || err instanceof PermissionDeniedError) {
    return claudeError(503, "bad_key", "Reading stones is switched off: the server's API key was refused.");
  }
  if (err instanceof RateLimitError) {
    return claudeError(503, "busy", "Claude is handling too many readings right now. Try again in a minute.");
  }
  if (err instanceof BadRequestError) {
    return claudeError(
      502,
      "upstream",
      "Claude couldn't take this request. Try another photo; if it keeps happening, reading may be paused for today.",
    );
  }
  if (err instanceof APIError && (err.status ?? 0) >= 500) {
    return claudeError(503, "busy", "Claude is busy or down right now. Try again in a minute.");
  }
  return claudeError(502, "upstream", "Something went wrong talking to Claude. Try again in a minute.");
}

function imageBlock(image: StoneImage): Anthropic.Beta.BetaImageBlockParam {
  return { type: "image", source: { type: "base64", media_type: image.type, data: toBase64(image.bytes) } };
}

async function readWithClaude(apiKey: string, images: [StoneImage, StoneImage], hash: string): Promise<Outcome> {
  const client = new Anthropic({ apiKey, maxRetries: 0, timeout: CLAUDE_TIMEOUT_MS });
  const release = budget.reserve(IN_FLIGHT_ESTIMATE_USD);
  let message: Anthropic.Beta.BetaMessage;
  try {
    message = await client.beta.messages.create({
      model: READ_STONE_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      // On a policy decline, retry server-side on Anthropic's recommended fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: READ_STONE_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Image 1: the photo, straightened." },
            imageBlock(images[0]),
            { type: "text", text: "Image 2: the same photo with the contrast boosted." },
            imageBlock(images[1]),
            { type: "text", text: READ_STONE_USER_TEXT },
          ],
        },
      ],
      output_config: { effort: "medium", format: betaZodOutputFormat(ModelReadingSchema) },
    });
  } catch (err) {
    release();
    const outcome = outcomeForSdkError(err);
    log({ image: hash.slice(0, 12), error: outcome.kind === "error" ? outcome.code : null });
    return outcome;
  }
  release();

  const usd = estimateCostUsd(message.usage);
  budget.add(usd, Date.now());
  log({
    image: hash.slice(0, 12),
    cached: false,
    stop_reason: message.stop_reason,
    input_tokens: message.usage.input_tokens,
    output_tokens: message.usage.output_tokens,
    usd: Number(usd.toFixed(5)),
  });

  if (message.stop_reason === "refusal") {
    return {
      kind: "error",
      status: 422,
      source: "Claude",
      code: "refused",
      message: "Claude wouldn't read this photo. Try a photo that shows only the stone.",
    };
  }
  if (message.stop_reason === "max_tokens") {
    return claudeError(502, "bad_output", "Claude's reading was cut off. Try again.");
  }

  const text = message.content.map((block) => (block.type === "text" ? block.text : "")).join("");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return claudeError(502, "bad_output", "Claude's answer came back garbled. Try again.");
  }
  const result = ModelReadingSchema.safeParse(parsed);
  if (!result.success) {
    return claudeError(502, "bad_output", "Claude's answer was missing parts of the reading. Try again.");
  }
  return { kind: "reading", reading: checkReading(result.data, { currentYear: new Date().getUTCFullYear() }) };
}

export async function handleReadStone(request: Request): Promise<Response> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return errorResponse(503, "Claude", "no_key", NO_KEY_MESSAGE);

  const device = deviceFromRequest(request);
  const setCookie = device.setCookie;

  const input = await readStoneImages(request);
  if ("problem" in input) {
    const { status, code, message } = input.problem;
    return errorResponse(status, "Photo", code, message, { setCookie });
  }
  const hash = pairHash(input.images);
  const now = Date.now();

  // The same pair of photos is read once; repeats are free and skip the limits.
  const hit = cache.get(hash, now);
  if (hit) {
    log({ image: hash.slice(0, 12), cached: true });
    return outcomeResponse({ kind: "reading", reading: hit }, true, setCookie);
  }
  const running = inFlight.get(hash);
  if (running) return outcomeResponse(await running, true, setCookie);

  const ip = clientIp(request);
  const phone = deviceLimiter.check(device.id, now);
  if (!phone.ok) {
    const message =
      phone.rule === "burst"
        ? `You've read ${DEVICE_RULES.burst.max} stones in 10 minutes. Try again ${whenAgain(phone.retryAfterMs)}.`
        : `You've used today's ${DEVICE_RULES.daily.max} readings on this phone. Try again ${whenAgain(phone.retryAfterMs)}.`;
    return errorResponse(429, "Limits", "rate_limited", message, { setCookie, retryAfterMs: phone.retryAfterMs });
  }
  const network = ipLimiter.check(ip, now);
  if (!network.ok) {
    return errorResponse(
      429,
      "Limits",
      "rate_limited",
      `There have been a lot of readings from your network. Try again ${whenAgain(network.retryAfterMs)}.`,
      { setCookie, retryAfterMs: network.retryAfterMs },
    );
  }

  if (budget.isOver(dailyCapUsd(), now)) {
    const retryAfterMs = DailyBudget.msUntilReset(now);
    return errorResponse(
      503,
      "Claude",
      "daily_cap",
      `Reading stones is paused for today: this server has used its daily Claude budget. It starts again at midnight UTC, ${whenAgain(retryAfterMs)}.`,
      { setCookie, retryAfterMs },
    );
  }

  deviceLimiter.record(device.id, now);
  ipLimiter.record(ip, now);

  const reading = readWithClaude(apiKey, input.images, hash);
  inFlight.set(hash, reading);
  let outcome: Outcome;
  try {
    outcome = await reading;
  } finally {
    inFlight.delete(hash);
  }
  if (outcome.kind === "reading") cache.set(hash, outcome.reading, Date.now());
  return outcomeResponse(outcome, false, setCookie);
}
