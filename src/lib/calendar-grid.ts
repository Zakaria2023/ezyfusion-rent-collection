// Pure calendar math for the date pickers. Works only on 'YYYY-MM-DD' strings
// and integer year / month / day (Date.UTC-style getters), so the machine or
// browser timezone can never shift a day. No "today" in here: callers pass it.

import { isCalendarDate } from "./billing";

export type YearMonth = { year: number; month: number }; // month 1-12

export type CalendarDay = {
  date: string; // 'YYYY-MM-DD'
  day: number;
  inMonth: boolean;
};

const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** Monday-first, like Malaysian calendars. */
export const WEEKDAY_LABELS = [
  "Mo",
  "Tu",
  "We",
  "Th",
  "Fr",
  "Sa",
  "Su",
] as const;

const GRID_CELLS = 42; // 6 weeks x 7 days: every month fits, height is stable

const pad = (value: number, length = 2): string =>
  String(value).padStart(length, "0");

// setUTCFullYear avoids Date.UTC's 0-99 => 1900-1999 year quirk.
const utcDate = (year: number, month: number, day: number): Date => {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return date;
};

export const toCalendarDate = (
  year: number,
  month: number,
  day: number,
): string => `${pad(year, 4)}-${pad(month)}-${pad(day)}`;

/** Splits a valid 'YYYY-MM-DD' into integers, or null for anything else. */
export const parseCalendarParts = (
  value: string,
): { year: number; month: number; day: number } | null =>
  isCalendarDate(value)
    ? {
        year: Number(value.slice(0, 4)),
        month: Number(value.slice(5, 7)),
        day: Number(value.slice(8, 10)),
      }
    : null;

/** The month a valid date falls in, or null. */
export const yearMonthOf = (value: string): YearMonth | null => {
  const parts = parseCalendarParts(value);
  return parts ? { year: parts.year, month: parts.month } : null;
};

export const daysInMonth = ({ year, month }: YearMonth): number =>
  utcDate(year, month + 1, 0).getUTCDate();

/** Month arithmetic on a month index, so December + 1 is January next year. */
export const shiftMonth = ({ year, month }: YearMonth, delta: number) => {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
};

/** 'October 2026'. */
export const formatYearMonthLabel = ({ year, month }: YearMonth): string =>
  `${MONTH_LABELS[month - 1] ?? ""} ${pad(year, 4)}`;

/**
 * The 42 cells of a Monday-first month view: the tail of the previous month,
 * the month itself, then the head of the next month.
 */
export const buildMonthGrid = (visible: YearMonth): CalendarDay[] => {
  const first = utcDate(visible.year, visible.month, 1);
  const leading = (first.getUTCDay() + 6) % 7; // Monday = 0
  return Array.from({ length: GRID_CELLS }, (_, cell) => {
    const date = utcDate(visible.year, visible.month, 1 - leading + cell);
    const month = date.getUTCMonth() + 1;
    return {
      date: toCalendarDate(date.getUTCFullYear(), month, date.getUTCDate()),
      day: date.getUTCDate(),
      inMonth: month === visible.month,
    };
  });
};
