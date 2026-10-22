import { beforeEach, describe, expect, it } from "vitest";
import {
  computePassportBadges,
  inspectBurialsForBadges,
  parsePassportLog,
  readPassportLog,
  recordBingoWin,
  recordRiddleSolved,
  recordStampMade,
  recordStoneCalculated,
  recordVisitedCemetery,
  resetPassportForTests,
} from "./store";

describe("passport store and badges", () => {
  beforeEach(() => {
    resetPassportForTests();
  });

  it("records visited cemeteries without duplicates and caps at most recent first", () => {
    recordVisitedCemetery({ qid: "Q2008469", name: "Oakland Cemetery", place: "Atlanta" }, new Date("2026-10-20T00:00:00Z"));
    recordVisitedCemetery({ qid: "Q360779", name: "Sleepy Hollow Cemetery", place: "Sleepy Hollow" }, new Date("2026-10-21T00:00:00Z"));
    const log = recordVisitedCemetery({ qid: "Q2008469", name: "Oakland Cemetery", place: "Atlanta, Georgia" }, new Date("2026-10-22T00:00:00Z"));
    expect(log.cemeteries.map((c) => c.qid)).toEqual(["Q2008469", "Q360779"]);
    expect(log.cemeteries[0].place).toBe("Atlanta, Georgia");
  });

  it("increments counters for stamps, bingo, riddles and stone math", () => {
    recordStampMade();
    recordBingoWin();
    recordRiddleSolved();
    recordRiddleSolved();
    const log = recordStoneCalculated();
    expect(log.stampsMade).toBe(1);
    expect(log.bingoWins).toBe(1);
    expect(log.riddlesSolved).toBe(2);
    expect(log.stonesCalculated).toBe(1);
    expect(readPassportLog()).toEqual(log);
  });

  it("tolerates malformed JSON in localStorage", () => {
    expect(parsePassportLog("not-json")).toEqual({
      cemeteries: [],
      stampsMade: 0,
      bingoWins: 0,
      riddlesSolved: 0,
      stonesCalculated: 0,
    });
  });

  it("computes century-gone, Civil War and oldest-stone badges from burials", () => {
    const stats = inspectBurialsForBadges(
      [
        {
          cemeteryName: "Sleepy Hollow Cemetery",
          people: [
            {
              qid: "Q181667",
              name: "Washington Irving",
              birth: "1783-04-03T00:00:00Z",
              birthPrecision: 11,
              death: "1859-11-28T00:00:00Z",
              deathPrecision: 11,
            },
            {
              qid: "Q484265",
              name: "Andrew Carnegie",
              birth: "1835-11-25T00:00:00Z",
              birthPrecision: 11,
              death: "1919-08-11T00:00:00Z",
              deathPrecision: 11,
            },
          ],
        },
      ],
      2026,
    );
    expect(stats.centuryGone).toBe(true);
    expect(stats.civilWar).toBe(true);
    expect(stats.oldestStone).toEqual({
      personName: "Washington Irving",
      cemeteryName: "Sleepy Hollow Cemetery",
      year: 1859,
    });

    const log = recordVisitedCemetery({ qid: "Q360779", name: "Sleepy Hollow Cemetery" });
    const badges = computePassportBadges({
      log,
      pinsCount: 2,
      savedToursCount: 1,
      burialStats: stats,
    });
    const earned = badges.filter((b) => b.earned).map((b) => b.id);
    expect(earned).toContain("first-haunt");
    expect(earned).toContain("oldest-stone");
    expect(earned).toContain("century-gone");
    expect(earned).toContain("civil-war");
    expect(earned).toContain("grave-finder");
  });
});
