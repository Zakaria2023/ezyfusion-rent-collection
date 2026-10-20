// Malaysia-time helpers for the app. Every function here is independent of the
// machine timezone (server in UTC, viewers anywhere): Malaysia is a fixed
// UTC+8 with no DST, so an instant is shifted by +8 h and read with the UTC
// getters, and wall-clock input is shifted back by -8 h. Output strings are
// assembled by hand (not toLocaleString) so server and browser render the same
// text and React never sees a hydration mismatch.

import { isCalendarDate, malaysiaDateOf } from "./billing";

export const BUSINESS_TIME_ZONE = "Asia/Kuala_Lumpur";
export const MALAYSIA_UTC_OFFSET = "+08:00";

const MALAYSIA_OFFSET_MS = 8 * 60 * 60 * 1000;
const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;
const LOCAL_DATE_TIME_PATTERN =
  /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;
const YEAR_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

type WallClock = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const pad = (value: number, length = 2): string =>
  String(value).padStart(length, "0");

const toInstant = (instant: Date | string): Date => {
  const date = typeof instant === "string" ? new Date(instant) : instant;
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new Error(`Not a valid instant: ${String(instant)}`);
  }
  return date;
};

// Wall-clock fields of an instant as seen in Malaysia.
const malaysiaWallClock = (instant: Date | string): WallClock => {
  const shifted = new Date(toInstant(instant).getTime() + MALAYSIA_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
  };
};

const monthName = (month: number): string => {
  const name = MONTH_NAMES[month - 1];
  if (name === undefined) {
    throw new Error(`Invalid month: ${month}`);
  }
  return name;
};

const parseYearMonth = (value: string): { year: number; month: number } => {
  if (!isYearMonth(value)) {
    throw new Error(`Not a valid YYYY-MM month: ${String(value)}`);
  }
  return { year: Number(value.slice(0, 4)), month: Number(value.slice(5, 7)) };
};

const formatYearMonth = (year: number, month: number): string =>
  `${pad(year, 4)}-${pad(month)}`;

/** Today's calendar date in Malaysia, 'YYYY-MM-DD' (same logic as invoiceStatus). */
export const todayInMalaysia = (now: Date = new Date()): string =>
  malaysiaDateOf(now);

/** The Malaysia calendar month an instant falls in, 'YYYY-MM'. */
export const malaysiaMonthOf = (instant: Date | string): string => {
  const { year, month } = malaysiaWallClock(instant);
  return formatYearMonth(year, month);
};

/** 'YYYY-MM-DDTHH:mm' or 'YYYY-MM-DDTHH:mm:ss' read as Malaysia wall-clock time -> instant. */
export const malaysiaLocalToInstant = (local: string): Date => {
  const match =
    typeof local === "string" ? LOCAL_DATE_TIME_PATTERN.exec(local) : null;
  if (!match || match[1] === undefined || !isCalendarDate(match[1])) {
    throw new Error(`Not a valid Malaysia local date-time: ${String(local)}`);
  }
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  const second = Number(match[4] ?? "0");
  if (hour > 23 || minute > 59 || second > 59) {
    throw new Error(`Not a valid Malaysia local date-time: ${local}`);
  }
  const [year, month, day] = match[1].split("-").map(Number) as [
    number,
    number,
    number,
  ];
  // setUTCFullYear avoids Date.UTC's 0-99 => 1900-1999 year quirk.
  const wallClockAsUtc = new Date(0);
  wallClockAsUtc.setUTCFullYear(year, month - 1, day);
  wallClockAsUtc.setUTCHours(hour, minute, second, 0);
  return new Date(wallClockAsUtc.getTime() - MALAYSIA_OFFSET_MS);
};

/** Instant -> '2026-01-31T10:00:00+08:00' (seconds precision). */
export const toMalaysiaIso = (instant: Date | string): string => {
  const c = malaysiaWallClock(instant);
  return `${pad(c.year, 4)}-${pad(c.month)}-${pad(c.day)}T${pad(c.hour)}:${pad(c.minute)}:${pad(c.second)}${MALAYSIA_UTC_OFFSET}`;
};

/** Instant -> '2026-01-31T10:00', the value format of <input type="datetime-local">. */
export const toMalaysiaInputValue = (instant: Date | string): string =>
  toMalaysiaIso(instant).slice(0, 16);

/** Instant -> '31 Jan 2026, 10:00' in Malaysia time, identical on server and browser. */
export const formatMalaysiaDateTime = (instant: Date | string): string => {
  const c = malaysiaWallClock(instant);
  return `${c.day} ${monthName(c.month)} ${pad(c.year, 4)}, ${pad(c.hour)}:${pad(c.minute)}`;
};

/**
 * Calendar date -> '31 Jan 2026', with no timezone conversion. Accepts the
 * 'YYYY-MM-DD' string, or the Date Prisma returns for a `date` column (UTC
 * midnight, so its UTC fields are the calendar date).
 */
export const formatCalendarDate = (date: string | Date): string => {
  const iso = typeof date === "string" ? date : calendarDateFromDb(date);
  if (!isCalendarDate(iso)) {
    throw new Error(`Not a valid YYYY-MM-DD date: ${String(date)}`);
  }
  return `${Number(iso.slice(8, 10))} ${monthName(Number(iso.slice(5, 7)))} ${iso.slice(0, 4)}`;
};

/** Prisma `date` column value (UTC midnight Date) -> 'YYYY-MM-DD'. */
export const calendarDateFromDb = (date: Date): string => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new Error("Not a valid Date");
  }
  return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
};

/** 'YYYY-MM-DD' -> the UTC-midnight Date Prisma expects for a `date` column. */
export const calendarDateToDb = (date: string): Date => {
  if (!isCalendarDate(date)) {
    throw new Error(`Not a valid YYYY-MM-DD date: ${String(date)}`);
  }
  return new Date(`${date}T00:00:00.000Z`);
};

export const isYearMonth = (value: unknown): value is string =>
  typeof value === "string" && YEAR_MONTH_PATTERN.test(value);

/** Inclusive list of 'YYYY-MM' months from `from` to `to`; throws if from > to. */
export const monthsBetween = (from: string, to: string): string[] => {
  const start = parseYearMonth(from);
  const end = parseYearMonth(to);
  const first = start.year * 12 + start.month - 1;
  const last = end.year * 12 + end.month - 1;
  if (first > last) {
    throw new Error(`Month range is reversed: ${from} > ${to}`);
  }
  const months: string[] = [];
  for (let index = first; index <= last; index++) {
    months.push(formatYearMonth(Math.floor(index / 12), (index % 12) + 1));
  }
  return months;
};

/** [from, to] covering the last n Malaysia calendar months, ending with the current one. */
export const lastNMonths = (now: Date, n: number): [string, string] => {
  if (!Number.isSafeInteger(n) || n < 1) {
    throw new Error(`n must be a positive integer, got ${String(n)}`);
  }
  const { year, month } = parseYearMonth(malaysiaMonthOf(now));
  const fromIndex = year * 12 + month - 1 - (n - 1);
  return [
    formatYearMonth(Math.floor(fromIndex / 12), (fromIndex % 12) + 1),
    formatYearMonth(year, month),
  ];
};

/** Instant at which a Malaysia calendar month starts (00:00 on the 1st, UTC+8). */
export const malaysiaMonthStart = (yearMonth: string): Date => {
  parseYearMonth(yearMonth);
  return malaysiaLocalToInstant(`${yearMonth}-01T00:00`);
};

/**
 * Half-open instant range [start, endExclusive) covering Malaysia months
 * from..to inclusive — the WHERE clause of the collections report.
 */
export const malaysiaMonthRange = (
  from: string,
  to: string,
): { start: Date; endExclusive: Date } => {
  monthsBetween(from, to); // validates both and rejects a reversed range
  const { year, month } = parseYearMonth(to);
  const next =
    month === 12
      ? formatYearMonth(year + 1, 1)
      : formatYearMonth(year, month + 1);
  return {
    start: malaysiaMonthStart(from),
    endExclusive: malaysiaMonthStart(next),
  };
};
