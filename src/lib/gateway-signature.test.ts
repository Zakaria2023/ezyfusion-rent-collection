import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  computeSignature,
  parseCallbackBody,
  parsePaidAt,
  parseSenAmount,
  signatureSource,
  verifySignature,
} from "./gateway-signature";

const KEY = "test_x_signature_key";
const VECTOR_SOURCE =
  "idbill_8f3a2c|paidtrue|paid_amount210050|paid_at2026-04-01 00:30:12 +0800|transaction_idTX-000123|transaction_statuscompleted";
const VECTOR_SIGNATURE =
  "06994fab2d674e7829144eaa2204631716d3c099b503d38945e92b6296531641";

const exampleFields = (): Record<string, string> => ({
  id: "bill_8f3a2c",
  paid: "true",
  paid_amount: "210050",
  paid_at: "2026-04-01 00:30:12 +0800",
  transaction_id: "TX-000123",
  transaction_status: "completed",
});

// Mirrors the brief's gateway-sim.mjs exactly.
const simulatorBody = (fields: Record<string, string>, key: string): string => {
  const source = Object.keys(fields)
    .sort()
    .map((k) => `${k}${fields[k]}`)
    .join("|");
  const signed = {
    ...fields,
    x_signature: createHmac("sha256", key).update(source).digest("hex"),
  };
  return new URLSearchParams(signed).toString();
};

const parseOrThrow = (raw: string): Record<string, string> => {
  const parsed = parseCallbackBody(raw);
  if (!parsed.ok) {
    throw new Error("expected body to parse");
  }
  return parsed.fields;
};

describe("signature (brief test vector)", () => {
  it("builds the documented source string", () => {
    expect(signatureSource(exampleFields())).toBe(VECTOR_SOURCE);
  });

  it("computes the documented signature", () => {
    expect(computeSignature(exampleFields(), KEY)).toBe(VECTOR_SIGNATURE);
  });

  it("ignores x_signature when building the source", () => {
    const fields = { ...exampleFields(), x_signature: VECTOR_SIGNATURE };
    expect(signatureSource(fields)).toBe(VECTOR_SOURCE);
    expect(verifySignature(fields, KEY)).toBe(true);
  });
});

describe("verifySignature on a simulator-encoded body", () => {
  it("accepts the body the simulator sends ('+' and spaces encoded)", () => {
    const raw = simulatorBody(exampleFields(), KEY);
    expect(raw).toContain("paid_at=2026-04-01+00%3A30%3A12+%2B0800");
    const fields = parseOrThrow(raw);
    expect(fields.paid_at).toBe("2026-04-01 00:30:12 +0800");
    expect(fields.x_signature).toBe(VECTOR_SIGNATURE);
    expect(verifySignature(fields, KEY)).toBe(true);
  });

  it("rejects a tampered amount", () => {
    const fields = parseOrThrow(simulatorBody(exampleFields(), KEY));
    expect(verifySignature({ ...fields, paid_amount: "1" }, KEY)).toBe(false);
  });

  it("rejects the wrong key", () => {
    const fields = parseOrThrow(simulatorBody(exampleFields(), KEY));
    expect(verifySignature(fields, "another_key")).toBe(false);
  });

  it("includes unknown extra fields in the signature", () => {
    const withExtra = { ...exampleFields(), channel: "fpx" };
    const fields = parseOrThrow(simulatorBody(withExtra, KEY));
    expect(verifySignature(fields, KEY)).toBe(true);
    // Signed without the extra field, then the field is injected: must fail.
    const injected = {
      ...parseOrThrow(simulatorBody(exampleFields(), KEY)),
      channel: "fpx",
    };
    expect(verifySignature(injected, KEY)).toBe(false);
  });

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["short", VECTOR_SIGNATURE.slice(0, 63)],
    ["too long", `${VECTOR_SIGNATURE}0`],
    ["uppercase", VECTOR_SIGNATURE.toUpperCase()],
    ["non-hex garbage", "Z".repeat(64)],
  ])("rejects a %s signature", (_label, signature) => {
    const fields: Record<string, string> = exampleFields();
    if (signature !== undefined) {
      fields.x_signature = signature;
    }
    expect(verifySignature(fields, KEY)).toBe(false);
  });

  it("throws on an empty key instead of accepting", () => {
    const fields = { ...exampleFields(), x_signature: VECTOR_SIGNATURE };
    expect(() => verifySignature(fields, "")).toThrow();
  });
});

describe("parseCallbackBody", () => {
  it("rejects a duplicated key", () => {
    expect(parseCallbackBody("id=a&paid=true&id=b").ok).toBe(false);
  });

  it("keeps __proto__ as plain data", () => {
    const fields = parseOrThrow("__proto__=x&id=a");
    expect(Object.keys(fields).sort()).toEqual(["__proto__", "id"]);
    expect(fields.id).toBe("a");
  });
});

describe("parsePaidAt", () => {
  it("applies the +0800 offset", () => {
    expect(parsePaidAt("2026-04-01 00:30:12 +0800")?.toISOString()).toBe(
      "2026-03-31T16:30:12.000Z",
    );
  });

  it("applies negative and zero offsets", () => {
    expect(parsePaidAt("2026-04-01 00:30:12 -0130")?.toISOString()).toBe(
      "2026-04-01T02:00:12.000Z",
    );
    expect(parsePaidAt("2026-04-01 00:30:12 +0000")?.toISOString()).toBe(
      "2026-04-01T00:30:12.000Z",
    );
  });

  it("accepts Feb 29 in a leap year", () => {
    expect(parsePaidAt("2028-02-29 12:00:00 +0800")?.toISOString()).toBe(
      "2028-02-29T04:00:00.000Z",
    );
  });

  it.each([
    "2026-02-29 00:00:00 +0800",
    "2026-04-31 00:00:00 +0800",
    "2026-13-01 00:00:00 +0800",
    "2026-00-10 00:00:00 +0800",
    "2026-04-00 00:00:00 +0800",
    "2026-04-01 24:00:00 +0800",
    "2026-04-01 00:60:00 +0800",
    "2026-04-01 00:00:60 +0800",
    "2026-04-01 00:00:00 +0860",
    "2026-04-01 00:00:00 +1500",
    "2026-04-01 00:00:00",
    "2026-04-01T00:00:00+08:00",
    "2026-04-01 00:00:00 +08:00",
    " 2026-04-01 00:00:00 +0800",
    "",
  ])("returns null for %j", (value) => {
    expect(parsePaidAt(value)).toBeNull();
  });
});

describe("parseSenAmount", () => {
  it("parses digit strings", () => {
    expect(parseSenAmount("210050")).toBe(210050);
    expect(parseSenAmount("0")).toBe(0);
  });

  it.each(["", "-1", "1.5", "1e5", " 1", "abc", "9007199254740993"])(
    "returns null for %j",
    (value) => {
      expect(parseSenAmount(value)).toBeNull();
    },
  );
});
