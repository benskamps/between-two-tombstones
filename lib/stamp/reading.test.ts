import { describe, expect, it, vi } from "vitest";
import { formatReading, readErrorMessage } from "./reading";
import { READ_STONE_URL, buildReadForm, postReadStone } from "./readStone";

// Shapes from Lane 3a's /api/read-stone contract.
const reply = {
  reading: {
    people: [{ name: "Washington Irving", birth: "April 3, 1783", death: "Nov. 28, 1859" }],
    symbols: [{ name: "Draped urn", meaning: "Mourning" }],
    material: "marble",
    legibility: "clear",
    transcription: "WASHINGTON IRVING\nBORN\nApril 3, 1783.\nDIED\nNov. 28, 1859.",
    checks: ["The day of birth is worn; check the 3 by eye."],
  },
  cached: false,
};

describe("formatReading", () => {
  it("shows the transcription first, then names, symbols and every check line", () => {
    expect(formatReading(reply)).toEqual([
      { label: "What the stone says", lines: [reply.reading.transcription] },
      { label: "Names", lines: ["Washington Irving · born April 3, 1783 · died Nov. 28, 1859"] },
      { label: "Symbols", lines: ["Draped urn: Mourning"] },
      { label: "Material", lines: ["marble"] },
      { label: "Legibility", lines: ["clear"] },
      { label: "Check by eye", lines: ["The day of birth is worn; check the 3 by eye."] },
    ]);
  });

  it("includes aged, epitaph and notes when present, and skips empty fields", () => {
    const sections = formatReading({
      reading: {
        people: [{ name: "J[?]hn Doe", aged: "34 y'rs 2 m's 11 d's" }],
        epitaph: "Gone home",
        symbols: [],
        legibility: "partial",
        notes: "Lower third under lichen.",
        transcription: "",
        checks: [],
      },
    });
    expect(sections.map((s) => s.label)).toEqual(["Names", "Epitaph", "Legibility", "Notes"]);
    expect(sections[0].lines).toEqual(["J[?]hn Doe · aged 34 y'rs 2 m's 11 d's"]);
  });

  it("returns nothing for bodies without a reading", () => {
    expect(formatReading(null)).toEqual([]);
    expect(formatReading({ error: { message: "x" } })).toEqual([]);
  });
});

describe("readErrorMessage", () => {
  it("uses the route's error.message as-is, else a fallback", () => {
    expect(
      readErrorMessage({
        error: { source: "Claude", code: "no_key", message: "Reading stones is switched off: the server has no API key." },
      }),
    ).toBe("Reading stones is switched off: the server has no API key.");
    expect(readErrorMessage({ error: "nope" })).toBe("Couldn't reach the reader.");
    expect(readErrorMessage(null)).toBe("Couldn't reach the reader.");
  });
});

describe("postReadStone", () => {
  const jpeg = new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: "image/jpeg" });
  const respond = (body: unknown, status: number) =>
    (async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status })) as typeof fetch;

  it("posts exactly two multipart fields, straightened and contrast", async () => {
    const form = buildReadForm(jpeg, jpeg);
    expect([...form.keys()]).toEqual(["straightened", "contrast"]);
    expect((form.get("contrast") as File).name).toBe("contrast.jpg");
    const fetchImpl = vi.fn(respond({ ...reply, cached: true }, 200));
    const res = await postReadStone(jpeg, jpeg, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith(READ_STONE_URL, expect.objectContaining({ method: "POST" }));
    expect(res).toMatchObject({ ok: true, cached: true });
  });

  it("shows the route's message for errors, like the local no-key 503", async () => {
    const body = {
      error: { source: "Claude", code: "no_key", message: "Reading stones is switched off: the server has no API key." },
    };
    expect(await postReadStone(jpeg, jpeg, respond(body, 503))).toEqual({
      ok: false,
      message: "Reading stones is switched off: the server has no API key.",
    });
  });

  it("keeps the reading that a 422 too_blurry carries", async () => {
    const body = { error: { source: "Claude", code: "too_blurry", message: "The photo is too blurry to read." }, ...reply };
    const res = await postReadStone(jpeg, jpeg, respond(body, 422));
    expect(res.ok).toBe(false);
    expect(res).toMatchObject({ message: "The photo is too blurry to read." });
    expect(!res.ok && res.sections?.[0].label).toBe("What the stone says");
  });

  it("falls back to a plain message on a 404 page or a network failure", async () => {
    expect(await postReadStone(jpeg, jpeg, respond("<html>404</html>", 404))).toEqual({
      ok: false,
      message: "Couldn't reach the reader.",
    });
    const down = (async () => {
      throw new TypeError("Failed to fetch");
    }) as typeof fetch;
    expect(await postReadStone(jpeg, jpeg, down)).toEqual({ ok: false, message: "Couldn't reach the reader." });
  });
});
