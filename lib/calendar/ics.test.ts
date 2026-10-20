import { describe, expect, it } from "vitest";
import {
  CRLF,
  escapeText,
  foldLine,
  formatDate,
  formatUtcDateTime,
  parseComponents,
  parseProperty,
  serializeLines,
  unescapeText,
  unfold,
  utf8ByteLength,
} from "./ics";

const enc = new TextEncoder();
const dec = new TextDecoder("utf-8", { fatal: true });

/** Every physical line is ≤ 75 octets and decodes on its own (no split character). */
function expectWellFolded(folded: string) {
  const physical = folded.split(CRLF);
  for (const [i, line] of physical.entries()) {
    const bytes = enc.encode(line);
    expect(bytes.length, `line ${i}: ${line}`).toBeLessThanOrEqual(75);
    // fatal decoder throws if a multi-byte character was cut in half
    expect(dec.decode(bytes)).toBe(line);
    if (i > 0) expect(line.startsWith(" ")).toBe(true);
  }
}

describe("escapeText", () => {
  it("escapes backslash, semicolon, comma and newline", () => {
    expect(escapeText("a\\b;c,d\ne")).toBe("a\\\\b\\;c\\,d\\ne");
    expect(escapeText("Oakland Cemetery, Atlanta")).toBe("Oakland Cemetery\\, Atlanta");
  });

  it("turns CRLF and CR into one escaped newline and drops control characters", () => {
    expect(escapeText("one\r\ntwo\rthree")).toBe("one\\ntwo\\nthree");
    expect(escapeText("bell\u0007 tab\tnull\u0000")).toBe("bell tab\tnull");
  });

  it("escapes the backslash before the others, so nothing is double-escaped", () => {
    expect(escapeText("\\,")).toBe("\\\\\\,");
    expect(unescapeText(escapeText("\\,;\n\\n"))).toBe("\\,;\n\\n");
  });

  it("replaces lone surrogates instead of emitting invalid UTF-8", () => {
    expect(escapeText("a\uD800b")).toBe("a\uFFFDb");
  });
});

describe("foldLine", () => {
  it("leaves lines of 75 octets alone and folds at 76", () => {
    const exact = "X".repeat(75);
    expect(foldLine(exact)).toBe(exact);
    const over = "X".repeat(76);
    expect(foldLine(over)).toBe(`${"X".repeat(75)}${CRLF} X`);
  });

  it("gives continuation lines 74 octets after the leading space", () => {
    const folded = foldLine("Y".repeat(75 + 74 + 10));
    const lines = folded.split(CRLF);
    expect(lines.map((l) => l.length)).toEqual([75, 75, 11]);
    expectWellFolded(folded);
  });

  it("never splits an accented character at the boundary", () => {
    // 74 ASCII octets, then "é" (2 octets) would end at octet 76: it must move down whole.
    const line = `${"a".repeat(74)}é${"b".repeat(10)}`;
    const folded = foldLine(line);
    expectWellFolded(folded);
    expect(folded.split(CRLF)[0]).toBe("a".repeat(74));
    expect(folded.split(CRLF)[1].startsWith(" é")).toBe(true);
    expect(unfold(folded).join("")).toBe(line);
  });

  it("never splits an emoji (4 octets, a surrogate pair in JS) at the boundary", () => {
    for (let lead = 70; lead <= 75; lead++) {
      const line = `${"a".repeat(lead)}🪦👻${"z".repeat(90)}`;
      const folded = foldLine(line);
      expectWellFolded(folded);
      expect(unfold(folded).join("")).toBe(line);
    }
  });

  it("handles long runs of multi-byte text (Cyrillic, CJK, ZWJ emoji)", () => {
    const line = `SUMMARY:${"Мемориал ".repeat(12)}${"墓地".repeat(20)}${"👨‍👩‍👧".repeat(8)}`;
    const folded = foldLine(line);
    expectWellFolded(folded);
    expect(unfold(folded)[0]).toBe(line);
    expect(utf8ByteLength(line)).toBe(enc.encode(line).length);
  });
});

describe("dates", () => {
  it("formats DATE and UTC DATE-TIME values", () => {
    expect(formatDate({ y: 1783, m: 4, d: 3 })).toBe("17830403");
    expect(formatDate({ y: 812, m: 1, d: 9 })).toBe("08120109");
    expect(formatUtcDateTime(new Date("2026-10-20T02:41:03.479Z"))).toBe("20261020T024103Z");
  });
});

describe("reading", () => {
  it("splits properties, including quoted parameter values with colons", () => {
    expect(parseProperty('DTSTART;VALUE=DATE:19490816')).toEqual({
      name: "DTSTART",
      params: { VALUE: "DATE" },
      value: "19490816",
    });
    expect(parseProperty('ATTENDEE;CN="Doe: John";ROLE=CHAIR:mailto:j@example.com')).toEqual({
      name: "ATTENDEE",
      params: { CN: "Doe: John", ROLE: "CHAIR" },
      value: "mailto:j@example.com",
    });
    expect(parseProperty("no colon here")).toBeNull();
  });

  it("round-trips through serialize → parse, skipping nested components", () => {
    const text = serializeLines([
      "BEGIN:VCALENDAR",
      "X-WR-CALNAME:Haunted",
      "BEGIN:VEVENT",
      `SUMMARY:${escapeText("Long, long; summary ".repeat(8))}`,
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "END:VALARM",
      "END:VEVENT",
      "END:VCALENDAR",
    ]);
    const [cal] = parseComponents(text, "VCALENDAR");
    expect(cal.properties.map((p) => p.name)).toEqual(["X-WR-CALNAME"]);
    const [ev] = parseComponents(text, "VEVENT");
    expect(ev.properties.map((p) => p.name)).toEqual(["SUMMARY"]);
    expect(unescapeText(ev.properties[0].value)).toBe("Long, long; summary ".repeat(8));
  });
});
