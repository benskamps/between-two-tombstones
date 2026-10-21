// "Where was I going?" (F12): a tool page that asked for a haunt first
// remembers itself for this tab, so the cemetery page you end up on (through
// the near list, a search or a famous one) can offer "Continue to …".
// sessionStorage, so it never outlives the tab; every access is wrapped.

import { parseNext } from "./haunt";

const KEY = "btt-next";
/** An intent older than this is forgotten. */
const MAX_AGE_MS = 30 * 60 * 1000;

export function rememberNext(tool: string, now: number = Date.now()): void {
  if (!parseNext(tool)) return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ tool, at: now }));
  } catch {
    // Storage blocked: no "Continue to …", nothing else lost.
  }
}

export function readNext(now: number = Date.now()): string | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { tool?: unknown; at?: unknown };
    const tool = typeof v.tool === "string" ? parseNext(v.tool) : null;
    if (!tool || typeof v.at !== "number" || now - v.at > MAX_AGE_MS || v.at - now > 60_000) return null;
    return tool;
  } catch {
    return null;
  }
}

export function forgetNext(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
