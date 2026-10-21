import type { BrowserContext, Page } from "@playwright/test";

// One shared way to give a test a haunt (decision 18e): tool pages without a
// cemetery in the link open only once you have one. Seeds localStorage
// "btt-haunt" through an init script, before any page script runs.
//
// `at` is the page's own "now" at load time, so a haunt is always fresh (the
// app treats one older than 12 hours as "last time"), even under page.clock.
// Register it after page.clock.setFixedTime() when a test fakes the date. It
// writes only when nothing fresh is stored, so a haunt the app sets during the
// test survives reloads.

export type SeedHaunt = { qid: string; name: string; place?: string };

export const OAKLAND_HAUNT: SeedHaunt = { qid: "Q2008469", name: "Oakland Cemetery", place: "Atlanta" };
export const SLEEPY_HOLLOW_HAUNT: SeedHaunt = { qid: "Q360779", name: "Sleepy Hollow Cemetery", place: "Sleepy Hollow" };

export async function seedHaunt(target: Page | BrowserContext, haunt: SeedHaunt = OAKLAND_HAUNT): Promise<void> {
  await target.addInitScript((h: SeedHaunt) => {
    try {
      const now = Date.now();
      const raw = localStorage.getItem("btt-haunt");
      const at = raw ? Date.parse((JSON.parse(raw) as { at?: string }).at ?? "") : NaN;
      const fresh = !Number.isNaN(at) && now - at < 11 * 60 * 60 * 1000 && at - now < 60_000;
      if (!fresh) localStorage.setItem("btt-haunt", JSON.stringify({ ...h, at: new Date(now).toISOString() }));
    } catch {
      // Storage blocked: the test sees the gate and fails loudly.
    }
  }, haunt);
}
