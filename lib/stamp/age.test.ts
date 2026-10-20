import { describe, expect, it } from "vitest";
import { ageFromDates, datesLine, extractYear } from "./age";

describe("age at death (interim, whole years)", () => {
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
