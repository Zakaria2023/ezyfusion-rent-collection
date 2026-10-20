import { describe, expect, it } from "vitest";
import {
  buildMonthGrid,
  daysInMonth,
  formatYearMonthLabel,
  parseCalendarParts,
  shiftMonth,
  yearMonthOf,
} from "./calendar-grid";

describe("buildMonthGrid", () => {
  it("starts on Monday and always has 42 cells", () => {
    // 1 Oct 2026 is a Thursday: Mon 28 Sep .. Wed 30 Sep lead in.
    const grid = buildMonthGrid({ year: 2026, month: 10 });
    expect(grid).toHaveLength(42);
    expect(grid[0]).toEqual({ date: "2026-09-28", day: 28, inMonth: false });
    expect(grid[3]).toEqual({ date: "2026-10-01", day: 1, inMonth: true });
    expect(grid.filter((cell) => cell.inMonth)).toHaveLength(31);
    expect(grid[41]?.date).toBe("2026-11-08");
  });

  it("has no leading days when the 1st is a Monday", () => {
    const grid = buildMonthGrid({ year: 2026, month: 6 });
    expect(grid[0]).toEqual({ date: "2026-06-01", day: 1, inMonth: true });
  });

  it("handles leap February and the year boundary", () => {
    const leap = buildMonthGrid({ year: 2028, month: 2 });
    expect(leap.filter((cell) => cell.inMonth).at(-1)?.date).toBe("2028-02-29");
    const january = buildMonthGrid({ year: 2027, month: 1 });
    expect(january[0]?.date).toBe("2026-12-28");
  });
});

describe("month helpers", () => {
  it("counts days per month, leap years included", () => {
    expect(daysInMonth({ year: 2026, month: 2 })).toBe(28);
    expect(daysInMonth({ year: 2028, month: 2 })).toBe(29);
    expect(daysInMonth({ year: 2100, month: 2 })).toBe(28);
    expect(daysInMonth({ year: 2026, month: 12 })).toBe(31);
  });

  it("shifts across year boundaries", () => {
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({
      year: 2027,
      month: 1,
    });
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({
      year: 2025,
      month: 12,
    });
    expect(shiftMonth({ year: 2026, month: 3 }, -12)).toEqual({
      year: 2025,
      month: 3,
    });
  });

  it("parses only real calendar dates", () => {
    expect(parseCalendarParts("2026-10-20")).toEqual({
      year: 2026,
      month: 10,
      day: 20,
    });
    expect(parseCalendarParts("2026-02-30")).toBeNull();
    expect(parseCalendarParts("")).toBeNull();
    expect(yearMonthOf("2026-10-20")).toEqual({ year: 2026, month: 10 });
  });

  it("labels a month", () => {
    expect(formatYearMonthLabel({ year: 2026, month: 10 })).toBe(
      "October 2026",
    );
  });
});
