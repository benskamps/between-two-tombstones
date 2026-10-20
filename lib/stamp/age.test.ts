import { describe, expect, it } from "vitest";
import { ageFromDates, datesLine, extractYear, parseFullDate } from "./age";

describe("age at death", () => {
  it("parses full dates in the usual written forms", () => {
    expect(parseFullDate("April 3, 1783")).toEqual({ y: 1783, m: 4, d: 3 });
    expect(parseFullDate("Nov. 28, 1859")).toEqual({ y: 1859, m: 11, d: 28 });
    expect(parseFullDate("3rd April 1783")).toEqual({ y: 1783, m: 4, d: 3 });
    expect(parseFullDate("1859-11-28")).toEqual({ y: 1859, m: 11, d: 28 });
    expect(parseFullDate("11/28/1859")).toEqual({ y: 1859, m: 11, d: 28 });
    expect(parseFullDate("1859")).toBeNull();
    expect(parseFullDate("Feb 30, 1859")).toBeNull();
  });

  it("uses the exact age when both dates are full (birthday not yet reached)", () => {
    // Whole-year subtraction would say 35; the carved age is 34.
    expect(ageFromDates("Dec 21, 1816", "March 4, 1851")).toBe(34);
    expect(ageFromDates("April 3, 1783", "Nov. 28, 1859")).toBe(76);
    expect(ageFromDates("Nov. 28, 1859", "April 3, 1783")).toBeNull();
  });

  it("pulls the last four-digit year out of free text", () => {
    expect(extractYear("April 3, 1783")).toBe(1783);
    expect(extractYear("1859")).toBe(1859);
    expect(extractYear("Nov. 28")).toBeNull();
    expect(extractYear("")).toBeNull();
  });

  it("subtracts the two years", () => {
    expect(ageFromDates("April 3, 1783", "Nov. 28, 1859")).toBe(76);
    expect(ageFromDates("1827", "Oct 16 1901")).toBe(74);
  });

  it("gives up on missing or impossible years", () => {
    expect(ageFromDates("", "1859")).toBeNull();
    expect(ageFromDates("1900", "1850")).toBeNull();
    expect(ageFromDates("1700", "1900")).toBeNull();
  });

  it("formats the dates line", () => {
    expect(datesLine(" 1783 ", "1859")).toBe("1783 – 1859");
    expect(datesLine("1783", "")).toBe("Born 1783");
    expect(datesLine("", "1859")).toBe("Died 1859");
    expect(datesLine("", "")).toBe("");
  });
});
