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

/** 'YYYY-MM' -> 'Mar'. Pure string work: same text on server and browser. */
export const shortMonth = (yearMonth: string): string =>
  MONTH_NAMES[Number(yearMonth.slice(5, 7)) - 1] ?? yearMonth;

/** 'YYYY-MM' -> 'Mar 2026'. */
export const formatMonth = (yearMonth: string): string =>
  `${shortMonth(yearMonth)} ${yearMonth.slice(0, 4)}`;
