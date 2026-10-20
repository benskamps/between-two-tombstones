// iCalendar (RFC 5545) building blocks, written by hand: no dependency.
//
// Writing: TEXT escaping (§3.3.11), content lines folded at 75 octets (§3.1)
// without ever splitting a multi-byte UTF-8 character, CRLF line endings.
// Reading: a small parser (unfold, split properties, unescape) that the
// /calendar page uses to preview the very feed a calendar app would get.
//
// Runs on the server (the feed) and in the browser (the preview), so it uses no
// Node APIs.

import type { YMD } from "../stonemath/index";

export const CRLF = "\r\n";
/** Longest content line, in octets, not counting the CRLF (RFC 5545 §3.1). */
export const MAX_LINE_OCTETS = 75;

/** UTF-8 length of one code point. Lone surrogates count as U+FFFD (3 octets), as TextEncoder writes them. */
export function utf8Length(codePoint: number): number {
  if (codePoint < 0x80) return 1;
  if (codePoint < 0x800) return 2;
  if (codePoint < 0x10000) return 3;
  return 4;
}

export function utf8ByteLength(text: string): number {
  let n = 0;
  for (const ch of text) n += utf8Length(ch.codePointAt(0)!);
  return n;
}

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
// TEXT may not carry control characters (TSAFE-CHAR); tab is allowed, and
// newlines are escaped below rather than dropped.
const CONTROLS = /[\u0000-\u0008\u000B-\u001F\u007F]/g;

/** Escape a TEXT value: backslash, semicolon, comma and newline (RFC 5545 §3.3.11). */
export function escapeText(value: string): string {
  return value
    .replace(LONE_SURROGATE, "�")
    .replace(/\r\n?/g, "\n")
    .replace(CONTROLS, "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

/**
 * Fold one content line so no physical line is longer than 75 octets. Each
 * continuation starts with a single space, which counts toward its 75. Splits
 * only between code points, so a multi-byte character (an accent, an emoji)
 * always stays whole on one physical line.
 */
export function foldLine(line: string): string {
  if (utf8ByteLength(line) <= MAX_LINE_OCTETS) return line;
  const parts: string[] = [];
  let current = "";
  let octets = 0;
  let room = MAX_LINE_OCTETS;
  for (const ch of line) {
    const n = utf8Length(ch.codePointAt(0)!);
    if (octets + n > room) {
      parts.push(current);
      current = "";
      octets = 0;
      room = MAX_LINE_OCTETS - 1; // the leading space takes one octet
    }
    current += ch;
    octets += n;
  }
  parts.push(current);
  return parts.join(`${CRLF} `);
}

/** Join unfolded content lines into an iCalendar object: folded, CRLF-terminated. */
export function serializeLines(lines: string[]): string {
  return lines.map(foldLine).join(CRLF) + CRLF;
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, "0");
}

/** DATE value: YYYYMMDD. */
export function formatDate(date: YMD): string {
  return `${pad(date.y, 4)}${pad(date.m, 2)}${pad(date.d, 2)}`;
}

/** DATE-TIME in UTC: YYYYMMDDTHHMMSSZ. */
export function formatUtcDateTime(date: Date): string {
  return (
    `${pad(date.getUTCFullYear(), 4)}${pad(date.getUTCMonth() + 1, 2)}${pad(date.getUTCDate(), 2)}` +
    `T${pad(date.getUTCHours(), 2)}${pad(date.getUTCMinutes(), 2)}${pad(date.getUTCSeconds(), 2)}Z`
  );
}

// ---------------------------------------------------------------------------
// Reading

export type IcsProperty = {
  name: string;
  params: Record<string, string>;
  /** Raw value: still escaped if it's TEXT (see unescapeText). */
  value: string;
};

/** Undo line folding: a CRLF (or bare LF) followed by one space or tab joins the lines. */
export function unfold(text: string): string[] {
  return text
    .replace(/\r?\n[ \t]/g, "")
    .split(/\r?\n/)
    .filter((line) => line.length > 0);
}

/** Split "NAME;PARAM=value;P2="quoted:value":VALUE" into its parts. Null if it isn't a property. */
export function parseProperty(line: string): IcsProperty | null {
  let i = 0;
  let inQuotes = false;
  let colon = -1;
  for (; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQuotes = !inQuotes;
    else if (c === ":" && !inQuotes) {
      colon = i;
      break;
    }
  }
  if (colon <= 0) return null;
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const pieces = head.match(/(?:[^;"]|"[^"]*")+/g) ?? [];
  const name = (pieces.shift() ?? "").toUpperCase();
  if (!/^[A-Z0-9-]+$/.test(name)) return null;
  const params: Record<string, string> = {};
  for (const p of pieces) {
    const eq = p.indexOf("=");
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"(.*)"$/, "$1");
  }
  return { name, params, value };
}

/** Reverse escapeText. */
export function unescapeText(value: string): string {
  return value.replace(/\\([\\;,nN])/g, (_, c: string) => (c === "n" || c === "N" ? "\n" : c));
}

export type IcsComponent = { type: string; properties: IcsProperty[] };

/** Every component of a given type (e.g. "VEVENT"), each with its own properties. Nested components are skipped. */
export function parseComponents(text: string, type: string): IcsComponent[] {
  const out: IcsComponent[] = [];
  let current: IcsComponent | null = null;
  let depth = 0;
  for (const line of unfold(text)) {
    const prop = parseProperty(line);
    if (!prop) continue;
    if (prop.name === "BEGIN") {
      if (current) depth += 1;
      else if (prop.value.toUpperCase() === type) current = { type, properties: [] };
      continue;
    }
    if (prop.name === "END") {
      if (current && depth > 0) depth -= 1;
      else if (current && prop.value.toUpperCase() === type) {
        out.push(current);
        current = null;
      }
      continue;
    }
    if (current && depth === 0) current.properties.push(prop);
  }
  return out;
}

/** Read a DATE value ("YYYYMMDD"), or the date part of a DATE-TIME. */
export function parseIcsDate(value: string): YMD | null {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})/);
  return m ? { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) } : null;
}
