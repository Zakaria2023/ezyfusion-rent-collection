import { describe, expect, it } from "vitest";

import {
  BUSINESS_TIME_ZONE,
  calendarDateFromDb,
  calendarDateToDb,
  formatCalendarDate,
  formatMalaysiaDateTime,
  isYearMonth,
  lastNMonths,
  malaysiaLocalToInstant,
  malaysiaMonthOf,
  malaysiaMonthRange,
  malaysiaMonthStart,
  monthsBetween,
  toMalaysiaInputValue,
  toMalaysiaIso,
  todayInMalaysia,
} from "./dates";

describe("todayInMalaysia", () => {
  it("rolls over at 16:00 UTC (00:00 MYT), not at UTC midnight", () => {
    expect(todayInMalaysia(new Date("2026-03-01T15:59:59.999Z"))).toBe(
      "2026-03-01",
    );
    expect(todayInMalaysia(new Date("2026-03-01T16:00:00.000Z"))).toBe(
      "2026-03-02",
    );
    // 00:00-08:00 MYT is still the previous day in UTC.
    expect(todayInMalaysia(new Date("2026-12-31T17:30:00Z"))).toBe(
      "2027-01-01",
    );
    expect(todayInMalaysia(new Date("2028-02-28T16:00:00Z"))).toBe(
      "2028-02-29",
    );
  });

  it("throws on an invalid Date", () => {
    expect(() => todayInMalaysia(new Date("garbage"))).toThrow();
  });

  it("agrees with Intl for the business timezone", () => {
    const instant = new Date("2026-06-30T20:15:00Z");
    const viaIntl = new Intl.DateTimeFormat("en-CA", {
      timeZone: BUSINESS_TIME_ZONE,
    }).format(instant);
    expect(todayInMalaysia(instant)).toBe(viaIntl);
  });
});

describe("malaysiaLocalToInstant", () => {
  it("reads wall-clock input as UTC+8", () => {
    expect(malaysiaLocalToInstant("2026-01-31T10:00").toISOString()).toBe(
      "2026-01-31T02:00:00.000Z",
    );
    expect(malaysiaLocalToInstant("2026-03-01T00:30").toISOString()).toBe(
      "2026-02-28T16:30:00.000Z",
    );
    expect(malaysiaLocalToInstant("2026-03-01T00:30:15").toISOString()).toBe(
      "2026-02-28T16:30:15.000Z",
    );
    expect(malaysiaLocalToInstant("2028-02-29T23:59:59").toISOString()).toBe(
      "2028-02-29T15:59:59.000Z",
    );
  });

  it.each([
    "2026-02-30T10:00",
    "2026-01-31T24:00",
    "2026-01-31T10:60",
    "2026-01-31T10:00:60",
    "2026-01-31 10:00",
    "2026-01-31T10:00Z",
    "2026-01-31T10:00+08:00",
    "2026-01-31",
    "2026-1-31T10:00",
    "",
  ])("rejects %j", (input) => {
    expect(() => malaysiaLocalToInstant(input)).toThrow();
  });

  it("round-trips through toMalaysiaInputValue", () => {
    expect(
      toMalaysiaInputValue(malaysiaLocalToInstant("2026-03-01T00:30")),
    ).toBe("2026-03-01T00:30");
  });
});

describe("formatting instants in Malaysia time", () => {
  it("toMalaysiaIso", () => {
    expect(toMalaysiaIso(new Date("2026-01-31T02:00:00Z"))).toBe(
      "2026-01-31T10:00:00+08:00",
    );
    expect(toMalaysiaIso("2026-02-28T16:30:00Z")).toBe(
      "2026-03-01T00:30:00+08:00",
    );
  });

  it("toMalaysiaInputValue", () => {
    expect(toMalaysiaInputValue(new Date("2026-02-28T16:30:00Z"))).toBe(
      "2026-03-01T00:30",
    );
  });

  it("formatMalaysiaDateTime", () => {
    expect(formatMalaysiaDateTime(new Date("2026-01-31T02:00:00Z"))).toBe(
      "31 Jan 2026, 10:00",
    );
    expect(formatMalaysiaDateTime("2026-02-28T16:30:00.000Z")).toBe(
      "1 Mar 2026, 00:30",
    );
    expect(formatMalaysiaDateTime("2026-03-01T00:30:00+08:00")).toBe(
      "1 Mar 2026, 00:30",
    );
  });

  it("throws on invalid instants", () => {
    expect(() => toMalaysiaIso(new Date(Number.NaN))).toThrow();
    expect(() => formatMalaysiaDateTime("yesterday")).toThrow();
  });

  it("malaysiaMonthOf puts 00:30 MYT on Mar 1 in March", () => {
    expect(malaysiaMonthOf(new Date("2026-02-28T16:30:00Z"))).toBe("2026-03");
    expect(malaysiaMonthOf(new Date("2026-02-28T15:59:59Z"))).toBe("2026-02");
  });
});

describe("calendar dates", () => {
  it("formatCalendarDate never shifts the day", () => {
    expect(formatCalendarDate("2026-01-31")).toBe("31 Jan 2026");
    expect(formatCalendarDate("2026-03-01")).toBe("1 Mar 2026");
    expect(formatCalendarDate(new Date("2026-03-01T00:00:00Z"))).toBe(
      "1 Mar 2026",
    );
    expect(() => formatCalendarDate("2026-02-29")).toThrow();
  });

  it("converts to and from Prisma date values", () => {
    expect(calendarDateToDb("2026-03-01").toISOString()).toBe(
      "2026-03-01T00:00:00.000Z",
    );
    expect(calendarDateFromDb(calendarDateToDb("2028-02-29"))).toBe(
      "2028-02-29",
    );
    expect(() => calendarDateToDb("2026-02-30")).toThrow();
  });
});

describe("months", () => {
  it("isYearMonth", () => {
    expect(isYearMonth("2026-01")).toBe(true);
    expect(isYearMonth("2026-12")).toBe(true);
    expect(isYearMonth("2026-13")).toBe(false);
    expect(isYearMonth("2026-00")).toBe(false);
    expect(isYearMonth("2026-1")).toBe(false);
    expect(isYearMonth("2026-01-01")).toBe(false);
    expect(isYearMonth(202601)).toBe(false);
  });

  it("monthsBetween is inclusive and crosses years", () => {
    expect(monthsBetween("2026-01", "2026-03")).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
    ]);
    expect(monthsBetween("2026-11", "2027-02")).toEqual([
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
    ]);
    expect(monthsBetween("2026-05", "2026-05")).toEqual(["2026-05"]);
  });

  it("monthsBetween throws on reversed or invalid input", () => {
    expect(() => monthsBetween("2026-03", "2026-01")).toThrow();
    expect(() => monthsBetween("2026-1", "2026-03")).toThrow();
  });

  it("lastNMonths ends on the current Malaysia month", () => {
    expect(lastNMonths(new Date("2026-02-28T16:30:00Z"), 3)).toEqual([
      "2026-01",
      "2026-03",
    ]);
    expect(lastNMonths(new Date("2026-02-28T15:30:00Z"), 1)).toEqual([
      "2026-02",
      "2026-02",
    ]);
    expect(lastNMonths(new Date("2026-02-15T00:00:00Z"), 12)).toEqual([
      "2025-03",
      "2026-02",
    ]);
    expect(() => lastNMonths(new Date(), 0)).toThrow();
  });

  it("malaysiaMonthStart and malaysiaMonthRange use Malaysia midnight", () => {
    expect(malaysiaMonthStart("2026-03").toISOString()).toBe(
      "2026-02-28T16:00:00.000Z",
    );
    const range = malaysiaMonthRange("2026-01", "2026-12");
    expect(range.start.toISOString()).toBe("2025-12-31T16:00:00.000Z");
    expect(range.endExclusive.toISOString()).toBe("2026-12-31T16:00:00.000Z");
    expect(() => malaysiaMonthRange("2026-03", "2026-01")).toThrow();
  });
});
