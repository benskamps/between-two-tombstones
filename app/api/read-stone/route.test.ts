import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The Anthropic SDK is mocked: the client class is fake, the error classes are real.
const { createMock, ctorMock } = vi.hoisted(() => ({ createMock: vi.fn(), ctorMock: vi.fn() }));
vi.mock("@anthropic-ai/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@anthropic-ai/sdk")>();
  class FakeAnthropic {
    beta = { messages: { create: createMock } };
    constructor(options: unknown) {
      ctorMock(options);
    }
  }
  return { ...actual, default: FakeAnthropic, Anthropic: FakeAnthropic };
});

import {
  APIConnectionError,
  APIConnectionTimeoutError,
  AuthenticationError,
  InternalServerError,
  RateLimitError,
} from "@anthropic-ai/sdk";
import * as routeModule from "./route";
import { POST } from "./route";
import {
  MAX_INPUT_TOKENS,
  NO_KEY_MESSAGE,
  readStoneCommittedUsd,
  resetReadStoneState,
  TOO_BLURRY_MESSAGE,
  WORST_CASE_READ_USD,
} from "@/lib/readstone/handler";
import { estimateCostUsd } from "@/lib/readstone/limits";
import { testGif, testJpeg, testPng, testWebpVp8x } from "@/lib/readstone/test-images";
import { MAX_IMAGE_BYTES, StoneReadingSchema, type ModelReading } from "@/lib/readstone/types";

const IRVING: ModelReading = {
  transcription: "WASHINGTON IRVING\nBORN\nAPRIL 3, 1783\nDIED\nNOV. 28, 1859",
  people: [{ name: "Washington Irving", birth: "April 3, 1783", death: "Nov. 28, 1859", aged: null, unsure: [] }],
  epitaph: null,
  symbols: [],
  material: "marble",
  legibility: "clear",
  notes: null,
};

function apiMessage(
  body: unknown,
  opts: { text?: string; stop_reason?: string; input?: number; output?: number } = {},
) {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-5-5",
    content: [
      { type: "thinking", thinking: "", signature: "sig" },
      { type: "text", text: opts.text ?? JSON.stringify(body) },
    ],
    stop_reason: opts.stop_reason ?? "end_turn",
    stop_details: null,
    stop_sequence: null,
    usage: {
      input_tokens: opts.input ?? 5000,
      output_tokens: opts.output ?? 1500,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
  };
}

type Images = { straightened: Uint8Array<ArrayBuffer>; contrast: Uint8Array<ArrayBuffer> };

function pair(seed: number): Images {
  return { straightened: testJpeg(1600, 1200, { seed }), contrast: testPng(1600, 1200, { seed }) };
}

function multipart(
  images: Partial<Images> & Record<string, Uint8Array<ArrayBuffer> | undefined>,
  opts: { cookie?: string; ip?: string; types?: Record<string, string> } = {},
): Request {
  const form = new FormData();
  for (const [field, bytes] of Object.entries(images)) {
    if (!bytes) continue;
    const type = opts.types?.[field] ?? (field === "straightened" ? "image/jpeg" : "image/png");
    form.append(field, new Blob([bytes], { type }), `${field}.bin`);
  }
  const headers: Record<string, string> = { "x-forwarded-for": opts.ip ?? "203.0.113.10" };
  if (opts.cookie) headers.cookie = opts.cookie;
  return new Request("http://localhost:3103/api/read-stone", { method: "POST", body: form, headers });
}

function cookieFrom(res: Response): string {
  const header = res.headers.get("set-cookie") ?? "";
  return header.split(";")[0];
}

const NOW = Date.UTC(2026, 9, 20, 12, 0, 0);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  process.env.ANTHROPIC_API_KEY = "test-key";
  process.env.DEVICE_COOKIE_SECRET = "test-device-secret";
  delete process.env.CLAUDE_DAILY_USD_CAP;
  resetReadStoneState();
  createMock.mockReset();
  ctorMock.mockReset();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("POST /api/read-stone", () => {
  it("route config: maxDuration 60, no runtime export (Cache Components forbids it)", () => {
    expect(routeModule.maxDuration).toBe(60);
    expect("runtime" in routeModule).toBe(false);
  });

  it("valid response passes, through the checks, with a device cookie", async () => {
    createMock.mockResolvedValue(apiMessage(IRVING));
    const images = pair(1);
    const res = await POST(multipart(images));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body.cached).toBe(false);
    expect(StoneReadingSchema.parse(body.reading)).toEqual({
      people: [{ name: "Washington Irving", birth: "April 3, 1783", death: "Nov. 28, 1859" }],
      symbols: [],
      material: "marble",
      legibility: "clear",
      transcription: IRVING.transcription,
      checks: [],
    });

    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/^btt_dev=[\w-]+\.[\w-]+; Path=\/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax$/);

    expect(ctorMock).toHaveBeenCalledWith(expect.objectContaining({ apiKey: "test-key", maxRetries: 0 }));
    expect(createMock).toHaveBeenCalledTimes(1);
    const params = createMock.mock.calls[0][0];
    expect(params.model).toBe("claude-sonnet-5-5");
    expect(params.system).toContain("[?]");
    expect(params.system).toContain("Never complete a partial date");
    expect(params.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect(params.fallbacks).toBe("default");
    expect(params.output_config.format.type).toBe("json_schema");
    const imageBlocks = params.messages[0].content.filter((b: { type: string }) => b.type === "image");
    expect(imageBlocks.map((b: { source: { media_type: string } }) => b.source.media_type)).toEqual([
      "image/jpeg",
      "image/png",
    ]);
    expect(imageBlocks[0].source.data).toBe(Buffer.from(images.straightened).toString("base64"));
  });

  it("accepts JSON with data URLs and WebP", async () => {
    createMock.mockResolvedValue(apiMessage(IRVING));
    const webp = testWebpVp8x(1200, 1600);
    const res = await POST(
      new Request("http://localhost/api/read-stone", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          straightened: `data:image/webp;base64,${Buffer.from(webp).toString("base64")}`,
          contrast: Buffer.from(testJpeg(1200, 1600)).toString("base64"),
        }),
      }),
    );
    expect(res.status).toBe(200);
    const blocks = createMock.mock.calls[0][0].messages[0].content.filter((b: { type: string }) => b.type === "image");
    expect(blocks.map((b: { source: { media_type: string } }) => b.source.media_type)).toEqual(["image/webp", "image/jpeg"]);
  });

  it("missing key → 503 with the plain message, and no SDK call", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = await POST(multipart(pair(1)));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: { source: "Claude", code: "no_key", message: NO_KEY_MESSAGE } });
    expect(NO_KEY_MESSAGE).toBe("Reading stones is switched off: the server has no API key.");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("malformed JSON from Claude → 502 plain error, not cached", async () => {
    createMock.mockResolvedValue(apiMessage(null, { text: '{"transcription": "JOHN' }));
    const res = await POST(multipart(pair(1)));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      error: { source: "Claude", code: "bad_output", message: "Claude's answer came back garbled. Try again." },
    });
    createMock.mockResolvedValue(apiMessage(IRVING));
    expect((await POST(multipart(pair(1)))).status).toBe(200);
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it("JSON that doesn't fit the schema → 502", async () => {
    createMock.mockResolvedValue(apiMessage({ people: "nobody" }));
    const res = await POST(multipart(pair(1)));
    expect(res.status).toBe(502);
    expect((await res.json()).error.code).toBe("bad_output");
  });

  it("too-large image → 413 (bytes)", async () => {
    const big = testJpeg(1600, 1200, { filler: MAX_IMAGE_BYTES });
    const res = await POST(multipart({ straightened: big, contrast: testPng(800, 600) }));
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.error).toMatchObject({ source: "Photo", code: "too_large" });
    expect(body.error.message).toMatch(/^The straightened photo is 4\.0 MB; the limit is 4 MB\./);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("too-large image → 413 (pixels over 1600 on the long side)", async () => {
    const res = await POST(multipart({ straightened: testJpeg(1200, 1600), contrast: testPng(4032, 3024) }));
    expect(res.status).toBe(413);
    expect((await res.json()).error.message).toBe(
      "The contrast photo is 4032 px on its long side; the limit is 1600 px. Shrink it and try again.",
    );
  });

  it("too-large body → 413 before reading it", async () => {
    const req = new Request("http://localhost/api/read-stone", {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": String(50 * 1024 * 1024) },
      body: "{}",
    });
    const res = await POST(req);
    expect(res.status).toBe(413);
    expect((await res.json()).error.code).toBe("too_large");
  });

  it("checks type by magic bytes, not the label", async () => {
    let res = await POST(multipart({ straightened: testGif(), contrast: testPng(800, 600) }, { types: { straightened: "image/jpeg" } }));
    expect(res.status).toBe(415);
    expect((await res.json()).error.message).toBe("The straightened photo isn't a JPEG, PNG or WebP image.");
    res = await POST(multipart({ straightened: testJpeg(800, 600), contrast: testPng(800, 600) }, { types: { straightened: "image/png" } }));
    expect(res.status).toBe(415);
    expect((await res.json()).error.code).toBe("bad_image");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("needs exactly two images", async () => {
    let res = await POST(multipart({ straightened: testJpeg(800, 600) }));
    expect(res.status).toBe(400);
    res = await POST(multipart({ ...pair(1), extra: testJpeg(10, 10) }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toBe(
      "Send exactly two images, named straightened and contrast, as multipart/form-data or JSON.",
    );
  });

  it("cache hit skips the SDK call", async () => {
    createMock.mockResolvedValue(apiMessage(IRVING));
    const first = await POST(multipart(pair(7)));
    expect((await first.json()).cached).toBe(false);
    const second = await POST(multipart(pair(7)));
    expect(second.status).toBe(200);
    const body = await second.json();
    expect(body.cached).toBe(true);
    expect(body.reading.people[0].name).toBe("Washington Irving");
    expect(createMock).toHaveBeenCalledTimes(1);
    // A different contrast image is a different pair.
    await POST(multipart({ straightened: pair(7).straightened, contrast: testPng(1600, 1200, { seed: 99 }) }));
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it("two identical reads at once make one Claude call", async () => {
    let resolve: (value: unknown) => void = () => {};
    createMock.mockReturnValue(new Promise((r) => (resolve = r)));
    const a = POST(multipart(pair(3)));
    const b = POST(multipart(pair(3)));
    await vi.waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    resolve(apiMessage(IRVING));
    const [ra, rb] = await Promise.all([a, b]);
    expect([ra.status, rb.status]).toEqual([200, 200]);
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it("rate limit trips per phone: 5 in 10 minutes, then 429 with when to retry", async () => {
    createMock.mockResolvedValue(apiMessage(IRVING));
    const first = await POST(multipart(pair(100)));
    const cookie = cookieFrom(first);
    for (let i = 1; i < 5; i += 1) {
      vi.setSystemTime(NOW + i * 60_000);
      const res = await POST(multipart(pair(100 + i), { cookie }));
      expect(res.status).toBe(200);
      expect(res.headers.get("set-cookie")).toBeNull(); // valid cookie is kept
    }
    vi.setSystemTime(NOW + 5 * 60_000);
    const limited = await POST(multipart(pair(200), { cookie }));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("300");
    expect(await limited.json()).toEqual({
      error: {
        source: "Limits",
        code: "rate_limited",
        message: "You've read 5 stones in 10 minutes. Try again in 5 minutes.",
        retryAfterSeconds: 300,
      },
    });
    expect(createMock).toHaveBeenCalledTimes(5);

    // Repeats of a photo already read are free, even while limited.
    expect((await POST(multipart(pair(100), { cookie }))).status).toBe(200);
    // Ten minutes after the first read, there's room again.
    vi.setSystemTime(NOW + 10 * 60_000 + 1);
    expect((await POST(multipart(pair(201), { cookie }))).status).toBe(200);
  });

  it("rate limit trips per network when phones keep getting new cookies", async () => {
    createMock.mockResolvedValue(apiMessage(IRVING));
    for (let i = 0; i < 15; i += 1) {
      expect((await POST(multipart(pair(300 + i), { ip: "198.51.100.4" }))).status).toBe(200);
    }
    const res = await POST(multipart(pair(400), { ip: "198.51.100.4" }));
    expect(res.status).toBe(429);
    expect((await res.json()).error.message).toBe(
      "There have been a lot of readings from your network. Try again in 10 minutes.",
    );
    expect((await POST(multipart(pair(401), { ip: "198.51.100.5" }))).status).toBe(200);
  });

  it("rate limit trips per phone per day", async () => {
    createMock.mockResolvedValue(apiMessage(IRVING));
    const cookie = cookieFrom(await POST(multipart(pair(500))));
    for (let i = 1; i < 20; i += 1) {
      vi.setSystemTime(NOW + i * 11 * 60_000);
      expect((await POST(multipart(pair(500 + i), { cookie, ip: `192.0.2.${i}` }))).status).toBe(200);
    }
    vi.setSystemTime(NOW + 20 * 11 * 60_000);
    const res = await POST(multipart(pair(600), { cookie, ip: "192.0.2.200" }));
    expect(res.status).toBe(429);
    expect((await res.json()).error.message).toMatch(/^You've used today's 20 readings on this phone\. Try again in 21 hours\.$/);
  });

  it("daily cap trips: 503 until midnight UTC", async () => {
    // A read starts only if its worst case still fits under the cap. Each mocked read
    // then costs $0.025, so two fit and the third doesn't.
    process.env.CLAUDE_DAILY_USD_CAP = String(WORST_CASE_READ_USD + 0.04);
    createMock.mockResolvedValue(apiMessage(IRVING));
    expect((await POST(multipart(pair(700)))).status).toBe(200);
    expect((await POST(multipart(pair(701)))).status).toBe(200);
    const res = await POST(multipart(pair(702)));
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe(String(12 * 3600));
    expect(await res.json()).toEqual({
      error: {
        source: "Claude",
        code: "daily_cap",
        message:
          "Reading stones is paused for today: this server has used its daily Claude budget. It starts again at midnight UTC, in 12 hours.",
        retryAfterSeconds: 12 * 3600,
      },
    });
    expect(createMock).toHaveBeenCalledTimes(2);
    vi.setSystemTime(Date.UTC(2026, 9, 21, 0, 0, 1));
    expect((await POST(multipart(pair(703)))).status).toBe(200);
  });

  it("parallel reads never push the estimate past the cap (red team P1-4)", async () => {
    // Worst case for real: every read uses all its input and max_tokens, on both
    // the declined attempt and the server-side fallback.
    const worst = { input_tokens: MAX_INPUT_TOKENS, output_tokens: 16_000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
    const usage = { ...worst, iterations: [{ type: "message", ...worst }, { type: "fallback_message", ...worst }] };
    expect(estimateCostUsd(worst) * 2).toBeCloseTo(WORST_CASE_READ_USD, 10);
    expect(WORST_CASE_READ_USD).toBeGreaterThan(0.3);
    for (const cap of [0.5, 1, 5]) {
      process.env.CLAUDE_DAILY_USD_CAP = String(cap);
      resetReadStoneState();
      createMock.mockReset();
      let release: () => void = () => {};
      const gate = new Promise<void>((r) => (release = r));
      createMock.mockImplementation(async () => {
        await gate; // every admitted read is in flight at once
        return { ...apiMessage(IRVING), usage };
      });
      // 60 different photos from 60 networks, no cookies: only the cap can stop them.
      let answered = 0;
      const pending = Array.from({ length: 60 }, (_, i) =>
        POST(multipart(pair(2000 + i), { ip: `198.51.100.${i + 1}` })).then((res) => {
          answered++;
          return res;
        }),
      );
      await vi.waitFor(() => expect(answered + createMock.mock.calls.length).toBe(60));
      const started = createMock.mock.calls.length;
      // As many as fit, and not one more.
      expect(started * WORST_CASE_READ_USD).toBeLessThanOrEqual(cap);
      expect((started + 1) * WORST_CASE_READ_USD).toBeGreaterThan(cap);
      expect(readStoneCommittedUsd()).toBeLessThanOrEqual(cap);
      release();
      const responses = await Promise.all(pending);
      expect(responses.filter((r) => r.status === 200)).toHaveLength(started);
      expect(responses.filter((r) => r.status === 503)).toHaveLength(60 - started);
      // Settled at what they were billed (both attempts), still within the cap.
      expect(readStoneCommittedUsd()).toBeCloseTo(started * WORST_CASE_READ_USD, 10);
      expect(readStoneCommittedUsd()).toBeLessThanOrEqual(cap);
    }
  });

  it("settles a read at what it was billed, counting a server-side fallback's declined attempt", async () => {
    const declined = { type: "message", input_tokens: 5000, output_tokens: 800, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
    const served = { type: "fallback_message", input_tokens: 5000, output_tokens: 1500, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
    const message = apiMessage(IRVING);
    createMock.mockResolvedValue({ ...message, usage: { ...message.usage, iterations: [declined, served] } });
    expect((await POST(multipart(pair(3000)))).status).toBe(200);
    expect(readStoneCommittedUsd()).toBeCloseTo(estimateCostUsd({ input_tokens: 10_000, output_tokens: 2300 }), 10);
  });

  it("a read that times out counts at its worst case; one that fails outright costs nothing", async () => {
    createMock.mockRejectedValueOnce(new AuthenticationError(401, { type: "error" }, "bad key", new Headers()));
    expect((await POST(multipart(pair(3100)))).status).toBe(503);
    expect(readStoneCommittedUsd()).toBe(0);
    createMock.mockRejectedValueOnce(new APIConnectionTimeoutError());
    expect((await POST(multipart(pair(3101)))).status).toBe(504);
    expect(readStoneCommittedUsd()).toBeCloseTo(WORST_CASE_READ_USD, 10);
  });

  it("a cap of 0 switches reading off", async () => {
    process.env.CLAUDE_DAILY_USD_CAP = "0";
    const res = await POST(multipart(pair(1)));
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("daily_cap");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("poor legibility → 422 with the plain advice and what could be read", async () => {
    createMock.mockResolvedValue(
      apiMessage({ ...IRVING, transcription: "[?]ASH[?]NG[?]ON", people: [], legibility: "poor", material: null }),
    );
    const res = await POST(multipart(pair(1)));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toEqual({ source: "Claude", code: "too_blurry", message: TOO_BLURRY_MESSAGE });
    expect(TOO_BLURRY_MESSAGE).toBe(
      "This photo is too blurry to read. Try again closer, in shade, with the whole face of the stone in frame.",
    );
    expect(body.reading.transcription).toBe("[?]ASH[?]NG[?]ON");
  });

  it("dates that aren't in the transcription are taken out before they reach the phone", async () => {
    createMock.mockResolvedValue(
      apiMessage({
        ...IRVING,
        transcription: "WASHINGTON IRVING\nDIED NOV. 28, 18[?]9",
        people: [{ name: "Washington Irving", birth: "April 3, 1783", death: "Nov. 28, 1859", aged: null, unsure: [] }],
      }),
    );
    const body = await (await POST(multipart(pair(1)))).json();
    expect(body.reading.people).toEqual([{ name: "Washington Irving" }]);
    expect(body.reading.checks).toHaveLength(2);
  });

  it("refusal → 422; cut off → 502", async () => {
    createMock.mockResolvedValue(apiMessage(null, { text: "", stop_reason: "refusal" }));
    let res = await POST(multipart(pair(1)));
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe("refused");
    createMock.mockResolvedValue(apiMessage(null, { text: '{"transcription":"', stop_reason: "max_tokens" }));
    res = await POST(multipart(pair(2)));
    expect(res.status).toBe(502);
    expect((await res.json()).error.message).toBe("Claude's reading was cut off. Try again.");
  });

  it("maps SDK errors to plain messages", async () => {
    const cases: [unknown, number, string][] = [
      [new RateLimitError(429, { type: "error" }, "rate limited", new Headers()), 503, "busy"],
      [new AuthenticationError(401, { type: "error" }, "bad key", new Headers()), 503, "bad_key"],
      [new InternalServerError(529, { type: "error" }, "overloaded", new Headers()), 503, "busy"],
      [new APIConnectionTimeoutError(), 504, "timeout"],
      [new APIConnectionError({ message: "offline" }), 502, "upstream"],
    ];
    let seed = 800;
    for (const [err, status, code] of cases) {
      createMock.mockRejectedValueOnce(err);
      const res = await POST(multipart(pair(seed++), { ip: `192.0.2.${seed}` }));
      expect(res.status).toBe(status);
      expect((await res.json()).error.code).toBe(code);
    }
  });

  it("never logs image bytes; logs a hash prefix and token counts", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    createMock.mockResolvedValue(apiMessage(IRVING));
    const images = pair(900);
    await POST(multipart(images));
    await POST(multipart(images));
    const logged = info.mock.calls.flat().join("\n");
    const b64 = Buffer.from(images.straightened).toString("base64");
    expect(logged).not.toContain(b64.slice(0, 40));
    expect(logged).not.toContain(Buffer.from(images.contrast).toString("base64").slice(0, 40));
    expect(logged).toMatch(/"image":"[0-9a-f]{12}"/);
    expect(logged).toContain('"input_tokens":5000');
    expect(logged).toContain('"output_tokens":1500');
    expect(logged).toContain('"cached":true');
  });
});
