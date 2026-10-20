// Integer money helpers. Amounts are always integer sen (1 RM = 100 sen);
// floats never touch money. Rounding lives in exactly one place:
// prorateHalfUp in billing.ts (the only place a fraction of a sen is created).

export { parseRinggitToSen } from "./billing";

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_SAFE = BigInt(Number.MIN_SAFE_INTEGER);

const toSenBigInt = (sen: number | bigint): bigint => {
  if (typeof sen === "bigint") {
    return sen;
  }
  if (!Number.isSafeInteger(sen)) {
    throw new Error(`Amount in sen must be a safe integer, got ${String(sen)}`);
  }
  return BigInt(sen);
};

/**
 * 150050 -> 'RM 1,500.50', -500 -> '-RM 5.00'. Built from integer division
 * instead of Intl.NumberFormat so the text is byte-identical on every
 * runtime/ICU build (no NBSP surprises, no hydration mismatch).
 */
export const formatSen = (sen: number | bigint): string => {
  const value = toSenBigInt(sen);
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const ringgit = (absolute / 100n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const cents = (absolute % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}RM ${ringgit}.${cents}`;
};

/** 150050 -> '1500.50': a sen amount as the plain text a money input accepts. */
export const senToInputValue = (sen: number | bigint): string =>
  formatSen(sen).replace("RM ", "").replaceAll(",", "");

/** Prisma returns bigint for `bigint` columns; JSON needs a number. Throws instead of losing precision. */
export const toSafeNumber = (value: bigint): number => {
  if (typeof value !== "bigint") {
    throw new Error(`Expected a bigint, got ${typeof value}`);
  }
  if (value > MAX_SAFE || value < MIN_SAFE) {
    throw new Error(
      `Value ${value.toString()} is outside the safe integer range`,
    );
  }
  return Number(value);
};
