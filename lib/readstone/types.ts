// The /api/read-stone contract. Safe to import from client components: this
// file only holds limits, zod schemas and types.

import { z } from "zod";

/** Multipart field names (or JSON keys) for the two images. */
export const READ_STONE_FIELDS = ["straightened", "contrast"] as const;
export type ReadStoneField = (typeof READ_STONE_FIELDS)[number];

export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const MAX_LONG_SIDE_PX = 1600;
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type AcceptedImageType = (typeof ACCEPTED_IMAGE_TYPES)[number];

export const LEGIBILITY = ["clear", "partial", "poor"] as const;
export type Legibility = (typeof LEGIBILITY)[number];

/**
 * What Claude must return (structured output). Every field is present; missing
 * things are null. `transcription` comes first so the model writes out the
 * carved text before it pulls fields from it.
 *
 * `legibility` and `unsure` are plain strings on purpose: the SDK's schema
 * transform (0.135) turns `enum` into a description, so the API doesn't enforce
 * it. The post-check normalizes them instead of failing the whole reading.
 */
export const ModelReadingSchema = z.object({
  transcription: z.string(),
  people: z.array(
    z.object({
      name: z.string(),
      birth: z.string().nullable(),
      death: z.string().nullable(),
      aged: z.string().nullable(),
      unsure: z.array(z.string()).describe('Any of "name", "birth", "death", "aged".'),
    }),
  ),
  epitaph: z.string().nullable(),
  symbols: z.array(z.object({ name: z.string(), meaning: z.string() })),
  material: z.string().nullable(),
  legibility: z.string().describe('Exactly one of "clear", "partial", "poor".'),
  notes: z.string().nullable(),
});
export type ModelReading = z.infer<typeof ModelReadingSchema>;

/** What the route sends back, after the server-side checks. */
export const StoneReadingSchema = z.object({
  people: z.array(
    z.object({
      name: z.string(),
      /** Copied as carved, e.g. "Dec. 21, 1816". Never completed or reformatted. */
      birth: z.string().optional(),
      death: z.string().optional(),
      /** The carved age wording, e.g. "34 y'rs 2 m's 11 d's". Feed it to parseAged. */
      aged: z.string().optional(),
    }),
  ),
  epitaph: z.string().optional(),
  symbols: z.array(z.object({ name: z.string(), meaning: z.string() })),
  material: z.string().optional(),
  legibility: z.enum(LEGIBILITY),
  notes: z.string().optional(),
  /** Every carved line, top to bottom, "\n" between lines; "[?]" marks an unreadable character. */
  transcription: z.string(),
  /** Plain sentences about anything the server removed or wants checked by eye. */
  checks: z.array(z.string()),
});
export type StoneReading = z.infer<typeof StoneReadingSchema>;
export type StonePerson = StoneReading["people"][number];

export type ReadStoneSuccess = { reading: StoneReading; cached: boolean };

export type ReadStoneErrorCode =
  | "cross_site" // 403: another website's page sent the request
  | "no_key" // 503: ANTHROPIC_API_KEY is not set
  | "bad_key" // 503: Anthropic rejected the key
  | "daily_cap" // 503: CLAUDE_DAILY_USD_CAP reached for today (UTC)
  | "busy" // 503: Anthropic rate-limited or overloaded
  | "rate_limited" // 429: too many reads from this phone or network (failed reads count too)
  | "bad_request" // 400: body isn't exactly two images (415 if it isn't multipart or JSON at all)
  | "too_large" // 413: body, file size or pixel size over the limit
  | "bad_image" // 415: not JPEG/PNG/WebP by its bytes, or unreadable header
  | "too_blurry" // 422: Claude read it but legibility is "poor" (reading included)
  | "refused" // 422: Claude declined to read the photo
  | "bad_output" // 502: Claude's answer wasn't valid JSON for the schema
  | "upstream" // 502: couldn't reach Claude, or Claude rejected the request
  | "timeout"; // 504: Claude took too long

export type ReadStoneError = {
  error: {
    /** Who the problem is with: Claude (or our Claude budget), the photo, or the usage limits. */
    source: "Claude" | "Photo" | "Limits";
    code: ReadStoneErrorCode;
    /** Plain sentence for the person holding the phone, including what to do next. */
    message: string;
    /** Set on 429 and on 503 daily_cap; also sent as the Retry-After header. */
    retryAfterSeconds?: number;
  };
  /** Present with too_blurry: whatever could be made out. */
  reading?: StoneReading;
};

export type ReadStoneResponse = ReadStoneSuccess | ReadStoneError;
