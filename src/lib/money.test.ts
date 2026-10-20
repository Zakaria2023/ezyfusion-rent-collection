import { describe, expect, it } from "vitest";

import {
  formatSen,
  parseRinggitToSen,
  senToInputValue,
  toSafeNumber,
} from "./money";

describe("formatSen", () => {
  it.each([
    [0, "RM 0.00"],
    [5, "RM 0.05"],
    [77_419, "RM 774.19"],
    [150_000, "RM 1,500.00"],
    [150_050, "RM 1,500.50"],
    [100_029, "RM 1,000.29"],
    [123_456_789, "RM 1,234,567.89"],
    [-500, "-RM 5.00"],
    [Number.MAX_SAFE_INTEGER, "RM 90,071,992,547,409.91"],
  ])("formats %i as %j", (sen, expected) => {
    expect(formatSen(sen)).toBe(expected);
  });

  it("accepts bigint beyond the safe range", () => {
    expect(formatSen(123_456_789_012_345_678n)).toBe(
      "RM 1,234,567,890,123,456.78",
    );
  });

  it("matches Intl's en-MY MYR output for ordinary amounts", () => {
    const intl = new Intl.NumberFormat("en-MY", {
      style: "currency",
      currency: "MYR",
    });
    expect(formatSen(150_050)).toBe(intl.format(1500.5).replace(/\s/g, " "));
  });

  it("rejects fractional sen", () => {
    expect(() => formatSen(1.5)).toThrow();
    expect(() => formatSen(Number.NaN)).toThrow();
  });
});

describe("senToInputValue", () => {
  it("round-trips with parseRinggitToSen", () => {
    expect(senToInputValue(150_050)).toBe("1500.50");
    expect(parseRinggitToSen(senToInputValue(77_419))).toBe(77_419);
  });
});

describe("toSafeNumber", () => {
  it("converts safe bigints", () => {
    expect(toSafeNumber(150_000n)).toBe(150_000);
    expect(toSafeNumber(BigInt(Number.MAX_SAFE_INTEGER))).toBe(
      Number.MAX_SAFE_INTEGER,
    );
    expect(toSafeNumber(-1n)).toBe(-1);
  });

  it("throws outside the safe range", () => {
    expect(() => toSafeNumber(BigInt(Number.MAX_SAFE_INTEGER) + 1n)).toThrow();
    expect(() => toSafeNumber(BigInt(Number.MIN_SAFE_INTEGER) - 1n)).toThrow();
  });
});
