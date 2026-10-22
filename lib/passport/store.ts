// Graveyard Passport (Lane 5.3): an on-phone pocket ledger of cemeteries
// visited, graves pinned ("I found it"), stamps pressed, riddles solved, and
// badges earned. Stored in localStorage ("btt-passport") and combined with
// IndexedDB tours/pins on read. Never uploaded; fails soft when storage is
// blocked.

import { isQid, cleanText, MAX_NAME, MAX_PLACE } from "@/lib/haunt/haunt";
import { parseWikiDate } from "@/lib/tour/dates";
import { diedDuring, spannedWorldEvents } from "@/lib/tour/periods";
import type { Person } from "@/lib/types";

export type BadgePerson = Pick<Person, "qid" | "name" | "birth" | "birthPrecision" | "death" | "deathPrecision">;

export const PASSPORT_KEY = "btt-passport";
export const PASSPORT_EVENT = "btt-passport-change";
export const MAX_VISITED = 50;

export type VisitedCemetery = {
  qid: string;
  name: string;
  place?: string;
  visitedAt: string;
};

export type PassportLog = {
  cemeteries: VisitedCemetery[];
  stampsMade: number;
  bingoWins: number;
  riddlesSolved: number;
  stonesCalculated: number;
};

export type OldestStone = {
  personName: string;
  cemeteryName: string;
  year: number;
};

export type BadgeId =
  | "first-haunt"
  | "grave-finder"
  | "darkroom-hand"
  | "century-gone"
  | "civil-war"
  | "oldest-stone"
  | "riddle-reader"
  | "stonecutter";

export type PassportBadge = {
  id: BadgeId;
  title: string;
  detail: string;
  earned: boolean;
  /** Specific note when earned (e.g. the oldest stone's name and year). */
  earnedNote?: string;
};

const EMPTY_LOG: PassportLog = {
  cemeteries: [],
  stampsMade: 0,
  bingoWins: 0,
  riddlesSolved: 0,
  stonesCalculated: 0,
};

let memoryLog: PassportLog = { ...EMPTY_LOG, cemeteries: [] };

function clampCount(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.min(9999, Math.floor(v)) : 0;
}

export function parsePassportLog(raw: string | null | undefined): PassportLog {
  if (!raw) return { ...EMPTY_LOG, cemeteries: [] };
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return { ...EMPTY_LOG, cemeteries: [] };
    const cemeteries: VisitedCemetery[] = [];
    if (Array.isArray(parsed.cemeteries)) {
      for (const item of parsed.cemeteries) {
        if (!item || typeof item !== "object") continue;
        const o = item as Record<string, unknown>;
        const qid = typeof o.qid === "string" ? o.qid.trim().toUpperCase() : "";
        const name = cleanText(o.name, MAX_NAME);
        const place = cleanText(o.place, MAX_PLACE);
        const visitedAt =
          typeof o.visitedAt === "string" && !Number.isNaN(Date.parse(o.visitedAt))
            ? o.visitedAt
            : new Date(0).toISOString();
        if (isQid(qid) && name && !cemeteries.some((c) => c.qid === qid)) {
          cemeteries.push({ qid, name, ...(place ? { place } : {}), visitedAt });
        }
      }
    }
    return {
      cemeteries: cemeteries.slice(0, MAX_VISITED),
      stampsMade: clampCount(parsed.stampsMade),
      bingoWins: clampCount(parsed.bingoWins),
      riddlesSolved: clampCount(parsed.riddlesSolved),
      stonesCalculated: clampCount(parsed.stonesCalculated),
    };
  } catch {
    return { ...EMPTY_LOG, cemeteries: [] };
  }
}

export function readPassportLog(): PassportLog {
  if (typeof window === "undefined") return memoryLog;
  try {
    const raw = window.localStorage.getItem(PASSPORT_KEY);
    if (!raw) return memoryLog;
    const parsed = parsePassportLog(raw);
    memoryLog = parsed;
    return parsed;
  } catch {
    return memoryLog;
  }
}

function writePassportLog(next: PassportLog): PassportLog {
  memoryLog = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(PASSPORT_KEY, JSON.stringify(next));
    } catch {
      // Storage blocked; memoryLog holds it for the view.
    }
    try {
      window.dispatchEvent(new Event(PASSPORT_EVENT));
    } catch {
      // ignore
    }
  }
  return next;
}

export function recordVisitedCemetery(
  input: { qid: string; name: string; place?: string | null },
  now: Date = new Date(),
): PassportLog {
  const qid = typeof input.qid === "string" ? input.qid.trim().toUpperCase() : "";
  const name = cleanText(input.name, MAX_NAME);
  if (!isQid(qid) || !name) return readPassportLog();
  const place = cleanText(input.place, MAX_PLACE);
  const current = readPassportLog();
  const entry: VisitedCemetery = {
    qid,
    name,
    ...(place ? { place } : {}),
    visitedAt: now.toISOString(),
  };
  const rest = current.cemeteries.filter((c) => c.qid !== qid);
  return writePassportLog({
    ...current,
    cemeteries: [entry, ...rest].slice(0, MAX_VISITED),
  });
}

export function recordStampMade(): PassportLog {
  const current = readPassportLog();
  return writePassportLog({ ...current, stampsMade: clampCount(current.stampsMade + 1) });
}

export function recordBingoWin(): PassportLog {
  const current = readPassportLog();
  return writePassportLog({ ...current, bingoWins: clampCount(current.bingoWins + 1) });
}

export function recordRiddleSolved(): PassportLog {
  const current = readPassportLog();
  return writePassportLog({ ...current, riddlesSolved: clampCount(current.riddlesSolved + 1) });
}

export function recordStoneCalculated(): PassportLog {
  const current = readPassportLog();
  return writePassportLog({ ...current, stonesCalculated: clampCount(current.stonesCalculated + 1) });
}

export function resetPassportForTests(): void {
  memoryLog = { ...EMPTY_LOG, cemeteries: [] };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(PASSPORT_KEY);
    } catch {
      // ignore
    }
  }
}

/**
 * Inspects burials from visited/saved cemeteries and pinned graves to find:
 * - whether any burial is 100+ years gone;
 * - whether any burial's life or death touched the American Civil War;
 * - the oldest dated stone.
 */
export function inspectBurialsForBadges(
  collections: { cemeteryName: string; people: BadgePerson[] }[],
  nowYear: number = 2026,
): {
  centuryGone: boolean;
  civilWar: boolean;
  oldestStone: OldestStone | null;
} {
  let centuryGone = false;
  let civilWar = false;
  let oldestStone: OldestStone | null = null;

  for (const { cemeteryName, people } of collections) {
    for (const p of people) {
      const d = parseWikiDate(p.death, p.deathPrecision);
      if (d && d.precision >= 9 && d.year > 0) {
        if (nowYear - d.year >= 100) centuryGone = true;
        if (!oldestStone || d.year < oldestStone.year) {
          oldestStone = { personName: p.name, cemeteryName, year: d.year };
        }
      }
      const during = diedDuring(p.death, p.deathPrecision);
      const world = spannedWorldEvents(p.birth, p.birthPrecision, p.death, p.deathPrecision);
      if (
        during.some((s) => s.includes("Civil War")) ||
        world.some((e) => e.id === "us-civil-war")
      ) {
        civilWar = true;
      }
    }
  }

  return { centuryGone, civilWar, oldestStone };
}

export function computePassportBadges({
  log,
  pinsCount,
  savedToursCount,
  burialStats,
}: {
  log: PassportLog;
  pinsCount: number;
  savedToursCount: number;
  burialStats: { centuryGone: boolean; civilWar: boolean; oldestStone: OldestStone | null };
}): PassportBadge[] {
  const hasHaunt = log.cemeteries.length > 0 || savedToursCount > 0;
  return [
    {
      id: "first-haunt",
      title: "First Haunt",
      detail: "Opened a cemetery and made it your haunt.",
      earned: hasHaunt,
      earnedNote: log.cemeteries[0] ? `Latest: ${log.cemeteries[0].name}` : undefined,
    },
    {
      id: "oldest-stone",
      title: "Oldest Stone",
      detail: "Walked a graveyard with a dated stone from an earlier century.",
      earned: burialStats.oldestStone !== null,
      earnedNote: burialStats.oldestStone
        ? `${burialStats.oldestStone.personName} (${burialStats.oldestStone.year}) · ${burialStats.oldestStone.cemeteryName}`
        : undefined,
    },
    {
      id: "century-gone",
      title: "100+ Years Gone",
      detail: "Encountered a stone for someone who died more than a century ago.",
      earned: burialStats.centuryGone,
    },
    {
      id: "civil-war",
      title: "Civil War Era",
      detail: "Encountered a life that spanned or ended during the American Civil War (1861–1865).",
      earned: burialStats.civilWar,
    },
    {
      id: "grave-finder",
      title: "Grave Finder",
      detail: "Pinned a grave on your phone with “I found it” or saved a tour for offline walks.",
      earned: pinsCount > 0 || savedToursCount > 0,
      earnedNote:
        pinsCount > 0
          ? `${pinsCount} ${pinsCount === 1 ? "grave" : "graves"} pinned`
          : savedToursCount > 0
            ? `${savedToursCount} ${savedToursCount === 1 ? "tour" : "tours"} saved`
            : undefined,
    },
    {
      id: "darkroom-hand",
      title: "Darkroom Hand",
      detail: "Framed a headstone photo into a rubbing, ink stamp and postage stamp.",
      earned: log.stampsMade > 0,
      earnedNote: log.stampsMade > 0 ? `${log.stampsMade} ${log.stampsMade === 1 ? "stone" : "stones"} pressed` : undefined,
    },
    {
      id: "riddle-reader",
      title: "Epitaph Reader",
      detail: "Solved a three-clue “Who Am I?” riddle from the burials of your haunt.",
      earned: log.riddlesSolved > 0,
      earnedNote: log.riddlesSolved > 0 ? `${log.riddlesSolved} solved` : undefined,
    },
    {
      id: "stonecutter",
      title: "Stonecutter’s Apprentice",
      detail: "Decoded a carved age with Stone Math or completed a line of Tombstone Bingo.",
      earned: log.stonesCalculated > 0 || log.bingoWins > 0,
      earnedNote:
        log.bingoWins > 0
          ? `${log.bingoWins} bingo ${log.bingoWins === 1 ? "line" : "lines"}`
          : log.stonesCalculated > 0
            ? `${log.stonesCalculated} ${log.stonesCalculated === 1 ? "inscription" : "inscriptions"} decoded`
            : undefined,
    },
  ];
}
