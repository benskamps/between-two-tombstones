// "Why this grave": tags a visitor can read, and a score that orders the tour.
// Fame (sitelinks) carries most of the weight; a Wikipedia story matters next,
// because a stop without a story is just a name. Unusual deaths get a small
// boost, except suicide (no boost, no tag). Recent deaths (lib/respect.ts) get
// neither the unusual-death nor the died-young boost or tag.

import { needsRespectfulStyle } from "@/lib/respect";
import type { Person } from "@/lib/types";
import { ageAtDeath, parseWikiDate } from "./dates";
import { hasTrustedGravePhoto } from "./photo";

export type TagId = "famous" | "died-young" | "long-life" | "century-gone" | "unusual-death" | "grave-photo" | "grave-located";

export type Tag = { id: TagId; label: string };

export const FAMOUS_SITELINKS = 20;
export const DIED_YOUNG_UNDER = 30;
export const LONG_LIFE_FROM = 95;
export const CENTURY_GONE_YEARS = 100;

export const WEIGHTS = {
  famePerDoubling: 10,
  story: 30,
  "died-young": 12,
  "long-life": 8,
  "century-gone": 5,
  "unusual-death": 10,
  "grave-photo": 8,
  "grave-located": 6,
} as const;

const ORDINARY_MANNERS = /^(natural causes|unknown|undetermined)$/i;
const SUICIDE = /suicide/i;

/** True when Wikidata records an unusual manner of death that isn't suicide. */
export function hasUnusualDeath(p: Pick<Person, "mannersOfDeath">): boolean {
  const manners = p.mannersOfDeath.map((m) => m.trim()).filter(Boolean);
  if (manners.length === 0 || manners.some((m) => SUICIDE.test(m))) return false;
  return manners.some((m) => !ORDINARY_MANNERS.test(m));
}

export type Scored = { person: Person; score: number; tags: Tag[]; hasStory: boolean };

export type ScoreOptions = {
  now?: Date;
  /** The cemetery being toured, so a grave photo of some other cemetery doesn't count. */
  cemeteryName?: string | null;
  /**
   * People whose Wikipedia story is still on its way (the tour page shows the
   * first stories before the rest arrive). They rank as if the story were in,
   * so the stops don't reorder when it lands.
   */
  storyPending?: ReadonlySet<string>;
};

export function scorePerson(p: Person, opts: ScoreOptions = {}): Scored {
  const now = opts.now ?? new Date();
  const tags: Tag[] = [];
  let score = WEIGHTS.famePerDoubling * Math.log2(1 + Math.max(0, p.sitelinks));

  const hasStory = Boolean(p.wikipedia?.extract?.trim()) || Boolean(opts.storyPending?.has(p.qid));
  if (hasStory) score += WEIGHTS.story;

  if (p.sitelinks >= FAMOUS_SITELINKS) tags.push({ id: "famous", label: "Famous" });

  const birth = parseWikiDate(p.birth, p.birthPrecision);
  const death = parseWikiDate(p.death, p.deathPrecision);
  const age = ageAtDeath(birth, death);
  // A recent (or undated) death gets the plain card, so no "died young" either: the grief may be fresh.
  const recent = needsRespectfulStyle(p, now);
  if (age && age.years < DIED_YOUNG_UNDER && !recent) {
    tags.push({ id: "died-young", label: "Died young" });
    score += WEIGHTS["died-young"];
  }
  if (age && age.years >= LONG_LIFE_FROM) {
    tags.push({ id: "long-life", label: `Lived to ${age.years}${age.exact ? "" : "-ish"}` });
    score += WEIGHTS["long-life"];
  }
  if (death && now.getUTCFullYear() - death.year >= CENTURY_GONE_YEARS) {
    tags.push({ id: "century-gone", label: "Gone 100+ years" });
    score += WEIGHTS["century-gone"];
  }
  if (!recent && hasUnusualDeath(p)) {
    tags.push({ id: "unusual-death", label: "Notable death" });
    score += WEIGHTS["unusual-death"];
  }
  if (hasTrustedGravePhoto(p, opts.cemeteryName ?? null)) {
    tags.push({ id: "grave-photo", label: "Grave photo on file" });
    score += WEIGHTS["grave-photo"];
  }
  if (p.graveCoord) {
    tags.push({ id: "grave-located", label: "Grave location known" });
    score += WEIGHTS["grave-located"];
  }
  return { person: p, score: Math.round(score * 10) / 10, tags, hasStory };
}

/** Greatest hits: people with a story first, then by score, then by name. */
export function rankPeople(people: Person[], opts: ScoreOptions = {}): Scored[] {
  return people
    .map((p) => scorePerson(p, opts))
    .sort((a, b) => Number(b.hasStory) - Number(a.hasStory) || b.score - a.score || a.person.name.localeCompare(b.person.name));
}
