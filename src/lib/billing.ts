// Pure billing rules (brief section 3). No imports, no I/O, and no use of the
// machine's timezone: calendar dates are handled as (year, month, day)
// integers and serial day numbers, and "today in Malaysia" is derived from
// the instant's epoch milliseconds plus a fixed UTC+8 offset.

const MS_PER_DAY = 86_400_000;
const MALAYSIA_OFFSET_MS = 8 * 60 * 60 * 1000; // Asia/Kuala_Lumpur: UTC+8, no DST
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const RINGGIT_PATTERN =
  /^([0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)(?:\.([0-9]{1,2}))?$/;

export type InvoiceKind = "deposit" | "rent";

export interface ScheduledInvoice {
  kind: InvoiceKind;
  periodIndex: number | null; // 0, 1, 2... for rent; null for the deposit
  periodStart: string | null; // 'YYYY-MM-DD'; null for the deposit
  periodEnd: string | null; // 'YYYY-MM-DD', inclusive; null for the deposit
  dueDate: string; // 'YYYY-MM-DD'
  amountSen: number; // integer
}

export type InvoiceStatus = "paid" | "partially_paid" | "unpaid" | "overdue";

type CalendarDate = { year: number; month: number; day: number };

type LeaseTerms = {
  startDate: string;
  endDate: string;
  monthlyRentSen: number;
  depositSen: number;
};

type InvoiceAmounts = { dueDate: string; amountSen: number; paidSen: number };

const isLeapYear = (year: number): boolean =>
  (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

const daysInMonth = (year: number, month: number): number => {
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
};

const parseCalendarDate = (value: unknown, field: string): CalendarDate => {
  const match = typeof value === "string" ? ISO_DATE_PATTERN.exec(value) : null;
  if (!match) {
    throw new Error(`${field} must be a date written as YYYY-MM-DD`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month)
  ) {
    throw new Error(`${field} is not a real calendar date: ${String(value)}`);
  }
  return { year, month, day };
};

// Serial day number (days since 1970-01-01) of a proleptic Gregorian date.
// Howard Hinnant's days_from_civil: exact integer arithmetic, no Date object.
const toDayNumber = ({ year, month, day }: CalendarDate): number => {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yearOfEra = y - era * 400;
  const dayOfYear =
    Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const dayOfEra =
    yearOfEra * 365 +
    Math.floor(yearOfEra / 4) -
    Math.floor(yearOfEra / 100) +
    dayOfYear;
  return era * 146_097 + dayOfEra - 719_468;
};

// Inverse of toDayNumber (Hinnant's civil_from_days).
const fromDayNumber = (dayNumber: number): CalendarDate => {
  const z = dayNumber + 719_468;
  const era = Math.floor(z / 146_097);
  const dayOfEra = z - era * 146_097;
  const yearOfEra = Math.floor(
    (dayOfEra -
      Math.floor(dayOfEra / 1460) +
      Math.floor(dayOfEra / 36_524) -
      Math.floor(dayOfEra / 146_096)) /
      365,
  );
  const dayOfYear =
    dayOfEra -
    (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const mp = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  const year = yearOfEra + era * 400 + (month <= 2 ? 1 : 0);
  return { year, month, day };
};

const formatCalendarDate = ({ year, month, day }: CalendarDate): string =>
  `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

// Start date plus k calendar months, day clamped to the target month's length.
// Always counted from the start date, so Jan 31 -> Feb 28 -> Mar 31 (not Mar 28).
const addMonthsClamped = (
  start: CalendarDate,
  months: number,
): CalendarDate => {
  const monthIndex = start.month - 1 + months;
  const year = start.year + Math.floor(monthIndex / 12);
  const month = (monthIndex % 12) + 1;
  return { year, month, day: Math.min(start.day, daysInMonth(year, month)) };
};

// monthlyRent * used / full, rounded half up, in exact integer arithmetic:
// floor((2 * rent * used + full) / (2 * full)). BigInt so no float ever appears.
const prorateHalfUp = (
  monthlyRentSen: number,
  daysUsed: number,
  daysInFullPeriod: number,
): number => {
  const numerator =
    2n * BigInt(monthlyRentSen) * BigInt(daysUsed) + BigInt(daysInFullPeriod);
  return Number(numerator / (2n * BigInt(daysInFullPeriod)));
};

const assertSafeInteger = (
  value: unknown,
  field: string,
  minimum: number,
): number => {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum
  ) {
    throw new Error(
      `${field} must be an integer >= ${minimum}, got ${String(value)}`,
    );
  }
  return value;
};

export const isCalendarDate = (value: unknown): value is string => {
  try {
    parseCalendarDate(value, "date");
    return true;
  } catch {
    return false;
  }
};

// The calendar date in Malaysia (UTC+8, no DST) at a given instant, 'YYYY-MM-DD'.
export const malaysiaDateOf = (now: Date): string => {
  const time = now instanceof Date ? now.getTime() : Number.NaN;
  if (!Number.isFinite(time)) {
    throw new Error("now must be a valid Date");
  }
  return formatCalendarDate(
    fromDayNumber(Math.floor((time + MALAYSIA_OFFSET_MS) / MS_PER_DAY)),
  );
};

export const generateSchedule = (lease: LeaseTerms): ScheduledInvoice[] => {
  const start = parseCalendarDate(lease.startDate, "startDate");
  const end = parseCalendarDate(lease.endDate, "endDate");
  const monthlyRentSen = assertSafeInteger(
    lease.monthlyRentSen,
    "monthlyRentSen",
    1,
  );
  const depositSen = assertSafeInteger(lease.depositSen, "depositSen", 0);
  const startDay = toDayNumber(start);
  const endDay = toDayNumber(end);
  if (endDay < startDay) {
    throw new Error("endDate must not be before startDate");
  }

  const schedule: ScheduledInvoice[] = [];
  if (depositSen > 0) {
    schedule.push({
      kind: "deposit",
      periodIndex: null,
      periodStart: null,
      periodEnd: null,
      dueDate: lease.startDate,
      amountSen: depositSen,
    });
  }

  for (let k = 0; ; k++) {
    const anchor = addMonthsClamped(start, k);
    const anchorDay = toDayNumber(anchor);
    if (anchorDay > endDay) {
      break;
    }
    const nextAnchorDay = toDayNumber(addMonthsClamped(start, k + 1));
    const fullEndDay = nextAnchorDay - 1;
    const periodEndDay = Math.min(fullEndDay, endDay);
    const amountSen =
      periodEndDay < fullEndDay
        ? prorateHalfUp(
            monthlyRentSen,
            periodEndDay - anchorDay + 1,
            nextAnchorDay - anchorDay,
          )
        : monthlyRentSen;
    const periodStart = formatCalendarDate(anchor);
    schedule.push({
      kind: "rent",
      periodIndex: k,
      periodStart,
      periodEnd: formatCalendarDate(fromDayNumber(periodEndDay)),
      dueDate: periodStart,
      amountSen,
    });
  }
  return schedule;
};

export const invoiceStatus = (
  invoice: InvoiceAmounts,
  now: Date,
): InvoiceStatus => {
  const due = parseCalendarDate(invoice.dueDate, "dueDate");
  const amountSen = assertSafeInteger(invoice.amountSen, "amountSen", 0);
  const paidSen = assertSafeInteger(invoice.paidSen, "paidSen", 0);
  const today = parseCalendarDate(malaysiaDateOf(now), "today");
  if (paidSen >= amountSen) {
    return "paid";
  }
  if (toDayNumber(today) > toDayNumber(due)) {
    return "overdue";
  }
  if (paidSen > 0) {
    return "partially_paid";
  }
  return "unpaid";
};

export const parseRinggitToSen = (input: string): number => {
  const match =
    typeof input === "string" ? RINGGIT_PATTERN.exec(input.trim()) : null;
  if (!match || match[1] === undefined) {
    throw new Error(`Not a valid ringgit amount: ${JSON.stringify(input)}`);
  }
  // Built from the digit strings, never via parseFloat: "1.15" must be 115, not 114.99...
  const ringgit = BigInt(match[1].replaceAll(",", ""));
  const sen = BigInt((match[2] ?? "").padEnd(2, "0"));
  const total = ringgit * 100n + sen;
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`Amount is too large: ${JSON.stringify(input)}`);
  }
  return Number(total);
};
