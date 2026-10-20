import { createHmac, timingSafeEqual } from "node:crypto";

// Pure helpers for the payment gateway callback (docs/TASK.md section 5).
// No I/O, no env access: the route handler passes the key in.

type CallbackFields = Record<string, string>;

type ParseResult = { ok: true; fields: CallbackFields } | { ok: false };

const SIGNATURE_FIELD = "x_signature";
const SIGNATURE_PATTERN = /^[0-9a-f]{64}$/;
const PAID_AT_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2}) ([+-])(\d{2})(\d{2})$/;
const SEN_PATTERN = /^\d+$/;

// application/x-www-form-urlencoded → flat record. A key sent twice is
// rejected: we could not say which value was signed. Unknown keys are kept,
// because they are part of the signature source.
export const parseCallbackBody = (raw: string): ParseResult => {
  const entries = new Map<string, string>();
  for (const [key, value] of new URLSearchParams(raw)) {
    if (entries.has(key)) {
      return { ok: false };
    }
    entries.set(key, value);
  }
  // fromEntries defines own properties, so a "__proto__" key stays plain data.
  return { ok: true, fields: Object.fromEntries(entries) };
};

// Ascending by UTF-16 code unit (same order as Array.prototype.sort's default),
// deliberately not localeCompare, whose order depends on the ICU locale.
const byCharCode = (a: string, b: string): number => {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
};

export const signatureSource = (fields: CallbackFields): string =>
  Object.keys(fields)
    .filter((key) => key !== SIGNATURE_FIELD)
    .sort(byCharCode)
    .map((key) => `${key}${fields[key] ?? ""}`)
    .join("|");

export const computeSignature = (fields: CallbackFields, key: string): string =>
  createHmac("sha256", key).update(signatureSource(fields)).digest("hex");

export const verifySignature = (
  fields: CallbackFields,
  key: string,
): boolean => {
  if (key.length === 0) {
    // An empty HMAC key is a misconfiguration; never let it accept anything.
    throw new Error("Gateway signature key is not configured");
  }
  const received = fields[SIGNATURE_FIELD];
  if (received === undefined || !SIGNATURE_PATTERN.test(received)) {
    return false;
  }
  const expected = Buffer.from(computeSignature(fields, key), "hex");
  const actual = Buffer.from(received, "hex");
  // Both are exactly 32 bytes here, so timingSafeEqual cannot throw.
  return timingSafeEqual(expected, actual);
};

const daysInMonth = (year: number, month: number): number =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

// 'YYYY-MM-DD HH:mm:ss ±HHMM' → instant. Uses only Date.UTC, so the result
// does not depend on the machine's timezone.
export const parsePaidAt = (s: string): Date | null => {
  const match = PAID_AT_PATTERN.exec(s);
  if (!match) {
    return null;
  }
  const [y, mo, d, h, mi, sec, oh, om] = [1, 2, 3, 4, 5, 6, 8, 9].map((group) =>
    Number(match[group]),
  );
  if (
    y === undefined ||
    mo === undefined ||
    d === undefined ||
    h === undefined ||
    mi === undefined ||
    sec === undefined ||
    oh === undefined ||
    om === undefined
  ) {
    return null;
  }
  if (
    y < 1000 ||
    mo < 1 ||
    mo > 12 ||
    d < 1 ||
    d > daysInMonth(y, mo) ||
    h > 23 ||
    mi > 59 ||
    sec > 59 ||
    oh > 14 ||
    om > 59
  ) {
    return null;
  }
  const offsetMinutes = (match[7] === "-" ? -1 : 1) * (oh * 60 + om);
  const utcMs = Date.UTC(y, mo - 1, d, h, mi, sec) - offsetMinutes * 60_000;
  return new Date(utcMs);
};

// Integer sen as sent by the gateway: digits only, within the safe range.
export const parseSenAmount = (s: string): number | null => {
  if (!SEN_PATTERN.test(s)) {
    return null;
  }
  const value = Number(s);
  return Number.isSafeInteger(value) ? value : null;
};
