import { afterAll, describe, expect, it } from "vitest";

import {
  generateSchedule,
  invoiceStatus,
  parseRinggitToSen,
  ScheduledInvoice,
} from "./billing";

type Lease = Parameters<typeof generateSchedule>[0];

const ORIGINAL_TZ = process.env.TZ;

const rent = (schedule: ScheduledInvoice[]) =>
  schedule.filter((invoice) => invoice.kind === "rent");

const rentRows = (lease: Lease) =>
  rent(generateSchedule(lease)).map(
    ({ periodStart, periodEnd, dueDate, amountSen }) => [
      periodStart,
      periodEnd,
      dueDate,
      amountSen,
    ],
  );

const lease = (
  startDate: string,
  endDate: string,
  monthlyRentSen = 100_000,
  depositSen = 0,
): Lease => ({
  startDate,
  endDate,
  monthlyRentSen,
  depositSen,
});

afterAll(() => {
  process.env.TZ = ORIGINAL_TZ;
});

describe("test environment", () => {
  it("runs under the TZ given on the command line", () => {
    const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
    console.info(
      `TZ=${process.env.TZ ?? "(unset)"} resolved=${resolved} offset(1970)=${new Date(0).getTimezoneOffset()}`,
    );
    if (process.env.TZ) {
      expect(resolved).toBe(process.env.TZ);
    }
  });
});

describe("generateSchedule", () => {
  it("reproduces the brief's worked example (Aisyah) exactly", () => {
    expect(
      generateSchedule({
        startDate: "2026-01-31",
        endDate: "2026-07-15",
        monthlyRentSen: 150_000,
        depositSen: 300_000,
      }),
    ).toEqual([
      {
        kind: "deposit",
        periodIndex: null,
        periodStart: null,
        periodEnd: null,
        dueDate: "2026-01-31",
        amountSen: 300_000,
      },
      {
        kind: "rent",
        periodIndex: 0,
        periodStart: "2026-01-31",
        periodEnd: "2026-02-27",
        dueDate: "2026-01-31",
        amountSen: 150_000,
      },
      {
        kind: "rent",
        periodIndex: 1,
        periodStart: "2026-02-28",
        periodEnd: "2026-03-30",
        dueDate: "2026-02-28",
        amountSen: 150_000,
      },
      {
        kind: "rent",
        periodIndex: 2,
        periodStart: "2026-03-31",
        periodEnd: "2026-04-29",
        dueDate: "2026-03-31",
        amountSen: 150_000,
      },
      {
        kind: "rent",
        periodIndex: 3,
        periodStart: "2026-04-30",
        periodEnd: "2026-05-30",
        dueDate: "2026-04-30",
        amountSen: 150_000,
      },
      {
        kind: "rent",
        periodIndex: 4,
        periodStart: "2026-05-31",
        periodEnd: "2026-06-29",
        dueDate: "2026-05-31",
        amountSen: 150_000,
      },
      {
        kind: "rent",
        periodIndex: 5,
        periodStart: "2026-06-30",
        periodEnd: "2026-07-15",
        dueDate: "2026-06-30",
        amountSen: 77_419,
      },
    ]);
  });

  it("Ben's lease: no deposit, last period rounds a .5 up (100029 x 15/30 = 50014.5)", () => {
    const schedule = generateSchedule(
      lease("2026-01-01", "2026-04-15", 100_029),
    );
    expect(schedule.every((invoice) => invoice.kind === "rent")).toBe(true);
    expect(schedule.map((invoice) => invoice.periodIndex)).toEqual([
      0, 1, 2, 3,
    ]);
    expect(rentRows(lease("2026-01-01", "2026-04-15", 100_029))).toEqual([
      ["2026-01-01", "2026-01-31", "2026-01-01", 100_029],
      ["2026-02-01", "2026-02-28", "2026-02-01", 100_029],
      ["2026-03-01", "2026-03-31", "2026-03-01", 100_029],
      ["2026-04-01", "2026-04-15", "2026-04-01", 50_015],
    ]);
  });

  it("Probe's lease (Feb 28 start, ends the day before the 12th anchor) is 12 full periods", () => {
    const schedule = generateSchedule(
      lease("2026-02-28", "2027-02-27", 200_000, 400_000),
    );
    expect(schedule[0]).toMatchObject({
      kind: "deposit",
      dueDate: "2026-02-28",
      amountSen: 400_000,
    });
    const rows = rent(schedule);
    expect(rows).toHaveLength(12);
    expect(rows.every((invoice) => invoice.amountSen === 200_000)).toBe(true);
    expect(rows[1]).toMatchObject({
      periodStart: "2026-03-28",
      periodEnd: "2026-04-27",
    });
    expect(rows[11]).toMatchObject({
      periodIndex: 11,
      periodStart: "2027-01-28",
      periodEnd: "2027-02-27",
    });
  });

  it("Chen's lease (15th to 14th) is 12 full periods", () => {
    const rows = rent(
      generateSchedule(lease("2026-03-15", "2027-03-14", 220_000, 440_000)),
    );
    expect(rows).toHaveLength(12);
    expect(rows.every((invoice) => invoice.amountSen === 220_000)).toBe(true);
    expect(rows[11]).toMatchObject({
      periodStart: "2027-02-15",
      periodEnd: "2027-03-14",
    });
  });

  it("omits the deposit when it is 0", () => {
    expect(
      generateSchedule(lease("2026-01-01", "2026-01-31", 100_000, 0)),
    ).toEqual([
      {
        kind: "rent",
        periodIndex: 0,
        periodStart: "2026-01-01",
        periodEnd: "2026-01-31",
        dueDate: "2026-01-01",
        amountSen: 100_000,
      },
    ]);
  });

  it("counts anchors from the start date, clamped to month end, in a leap year (Jan 31, 2028)", () => {
    expect(
      rentRows(lease("2028-01-31", "2028-05-30")).map((row) => [
        row[0],
        row[1],
      ]),
    ).toEqual([
      ["2028-01-31", "2028-02-28"],
      ["2028-02-29", "2028-03-30"],
      ["2028-03-31", "2028-04-29"],
      ["2028-04-30", "2028-05-30"],
    ]);
  });

  it("a lease starting on Feb 29 anchors on the 29th and clamps to Feb 28 the next year", () => {
    const rows = rentRows(lease("2028-02-29", "2029-02-27"));
    expect(rows).toHaveLength(12);
    expect(rows.map((row) => row[0])).toEqual([
      "2028-02-29",
      "2028-03-29",
      "2028-04-29",
      "2028-05-29",
      "2028-06-29",
      "2028-07-29",
      "2028-08-29",
      "2028-09-29",
      "2028-10-29",
      "2028-11-29",
      "2028-12-29",
      "2029-01-29",
    ]);
    expect(rows[11]).toEqual([
      "2029-01-29",
      "2029-02-27",
      "2029-01-29",
      100_000,
    ]);
    // One more day reaches the clamped anchor 2029-02-28: a 1-day period of a 29-day month (Feb 28 -> Mar 28).
    const longer = rentRows(lease("2028-02-29", "2029-02-28", 290_000));
    expect(longer).toHaveLength(13);
    expect(longer[12]).toEqual([
      "2029-02-28",
      "2029-02-28",
      "2029-02-28",
      10_000,
    ]);
  });

  it("a lease starting on the 30th clamps to Feb 28 and returns to the 30th", () => {
    expect(
      rentRows(lease("2026-01-30", "2026-04-29")).map((row) => [
        row[0],
        row[1],
      ]),
    ).toEqual([
      ["2026-01-30", "2026-02-27"],
      ["2026-02-28", "2026-03-29"],
      ["2026-03-30", "2026-04-29"],
    ]);
  });

  it("a lease starting on the 29th in a non-leap year clamps to Feb 28", () => {
    expect(
      rentRows(lease("2027-01-29", "2027-03-28")).map((row) => [
        row[0],
        row[1],
      ]),
    ).toEqual([
      ["2027-01-29", "2027-02-27"],
      ["2027-02-28", "2027-03-28"],
    ]);
  });

  it("a one-day lease (start == end) costs 1/full of the month", () => {
    // Full period 2026-03-10..2026-04-09 is 31 days.
    expect(rentRows(lease("2026-03-10", "2026-03-10", 310_000))).toEqual([
      ["2026-03-10", "2026-03-10", "2026-03-10", 10_000],
    ]);
    // Feb 2026 period (Feb 10..Mar 9) is 28 days: 100000 / 28 = 3571.43 -> 3571.
    expect(rentRows(lease("2026-02-10", "2026-02-10"))).toEqual([
      ["2026-02-10", "2026-02-10", "2026-02-10", 3_571],
    ]);
  });

  it("an endDate the day before an anchor gives a full last period (no proration)", () => {
    expect(rentRows(lease("2026-01-15", "2026-02-14", 123_457))).toEqual([
      ["2026-01-15", "2026-02-14", "2026-01-15", 123_457],
    ]);
  });

  it("an endDate on an anchor gives a 1-day last period", () => {
    // Period 1 would be 2026-02-15..2026-03-14 (28 days): 100000 / 28 = 3571.43 -> 3571.
    expect(rentRows(lease("2026-01-15", "2026-02-15"))).toEqual([
      ["2026-01-15", "2026-02-14", "2026-01-15", 100_000],
      ["2026-02-15", "2026-02-15", "2026-02-15", 3_571],
    ]);
  });

  it("rounds half up only at exactly .5 (and down below it)", () => {
    // 31-day period (Mar 1..31): 31 x 16/31 = 16 exactly; 1 x 16/31 = 0.516 -> 1; 1 x 15/31 = 0.48 -> 0.
    expect(rentRows(lease("2026-03-01", "2026-03-16", 31))[0]?.[3]).toBe(16);
    expect(rentRows(lease("2026-03-01", "2026-03-16", 1))[0]?.[3]).toBe(1);
    expect(rentRows(lease("2026-03-01", "2026-03-15", 1))[0]?.[3]).toBe(0);
    // 30-day period (Apr): 3 x 15/30 = 1.5 -> 2; 1 x 15/30 = 0.5 -> 1.
    expect(rentRows(lease("2026-04-01", "2026-04-15", 3))[0]?.[3]).toBe(2);
    expect(rentRows(lease("2026-04-01", "2026-04-15", 1))[0]?.[3]).toBe(1);
  });

  it("prorates huge rents exactly (no float precision loss)", () => {
    const max = Number.MAX_SAFE_INTEGER; // 9007199254740991
    // Full period 2026-06-30..2026-07-29 is 30 days; 16 used.
    // 144115188075855856 / 30 = 4803839602528528.53 -> ...529 (a float would be off).
    expect(rentRows(lease("2026-06-30", "2026-07-15", max))).toEqual([
      ["2026-06-30", "2026-07-15", "2026-06-30", 4_803_839_602_528_529],
    ]);
  });

  it("handles a multi-year lease across a leap day", () => {
    const rows = rentRows(lease("2026-01-31", "2029-01-30", 150_000));
    expect(rows).toHaveLength(36);
    expect(rows.every((row) => row[3] === 150_000)).toBe(true);
    const anchors = rows.map((row) => row[0]);
    expect(anchors).toContain("2027-02-28");
    expect(anchors).toContain("2028-02-29");
    expect(anchors).toContain("2028-03-31");
    expect(rows[35]).toEqual([
      "2028-12-31",
      "2029-01-30",
      "2028-12-31",
      150_000,
    ]);
  });

  it("chains periods without gaps or overlaps", () => {
    const rows = rentRows(lease("2025-08-31", "2027-03-03"));
    for (let i = 1; i < rows.length; i++) {
      const previousEnd = new Date(
        `${String(rows[i - 1]?.[1])}T00:00:00Z`,
      ).getTime();
      const start = new Date(`${String(rows[i]?.[0])}T00:00:00Z`).getTime();
      expect(start - previousEnd).toBe(86_400_000);
    }
    expect(rows[rows.length - 1]?.[1]).toBe("2027-03-03");
  });

  it.each([
    ["2026-2-01", "single-digit month"],
    ["2026-02-1", "single-digit day"],
    ["2026-02-30", "Feb 30"],
    ["2025-02-29", "Feb 29 in a non-leap year"],
    ["2100-02-29", "Feb 29 in a century non-leap year"],
    ["2026-13-01", "month 13"],
    ["2026-00-10", "month 0"],
    ["2026-04-31", "Apr 31"],
    ["2026-01-00", "day 0"],
    [" 2026-01-01", "leading space"],
    ["2026-01-01 ", "trailing space"],
    ["2026-01-01T00:00", "time part"],
    ["2026/01/01", "slashes"],
    ["26-01-01", "two-digit year"],
    ["", "empty"],
  ])("rejects startDate %j (%s)", (startDate) => {
    expect(() => generateSchedule(lease(startDate, "2030-01-01"))).toThrow();
  });

  it("rejects an invalid endDate", () => {
    expect(() => generateSchedule(lease("2026-01-01", "2026-02-30"))).toThrow();
  });

  it("accepts Feb 29 in a 400-year leap year", () => {
    expect(
      rent(generateSchedule(lease("2000-02-29", "2000-03-28"))),
    ).toHaveLength(1);
  });

  it("rejects endDate before startDate", () => {
    expect(() => generateSchedule(lease("2026-03-01", "2026-02-28"))).toThrow();
  });

  it.each([
    [0],
    [-1],
    [1.5],
    [Number.NaN],
    [Number.POSITIVE_INFINITY],
    [Number.MAX_SAFE_INTEGER + 1],
    ["100"],
    [null],
  ])("rejects monthlyRentSen %j", (monthlyRentSen) => {
    expect(() =>
      generateSchedule({
        ...lease("2026-01-01", "2026-12-31"),
        monthlyRentSen: monthlyRentSen as number,
      }),
    ).toThrow();
  });

  it.each([
    [-1],
    [0.5],
    [Number.NaN],
    [Number.POSITIVE_INFINITY],
    ["0"],
    [undefined],
  ])("rejects depositSen %j", (depositSen) => {
    expect(() =>
      generateSchedule({
        ...lease("2026-01-01", "2026-12-31"),
        depositSen: depositSen as number,
      }),
    ).toThrow();
  });

  it("gives the same schedule whatever the process timezone is", () => {
    const aisyah = {
      startDate: "2026-01-31",
      endDate: "2026-07-15",
      monthlyRentSen: 150_000,
      depositSen: 300_000,
    };
    process.env.TZ = "UTC";
    const offsetUtc = new Date(0).getTimezoneOffset();
    const inUtc = generateSchedule(aisyah);
    process.env.TZ = "Pacific/Kiritimati"; // UTC+14
    const offsetKiritimati = new Date(0).getTimezoneOffset();
    const inKiritimati = generateSchedule(aisyah);
    process.env.TZ = "America/New_York";
    const inNewYork = generateSchedule(aisyah);
    process.env.TZ = ORIGINAL_TZ;
    expect(offsetKiritimati).not.toBe(offsetUtc); // proves the runtime switch took effect
    expect(inKiritimati).toEqual(inUtc);
    expect(inNewYork).toEqual(inUtc);
  });
});

describe("invoiceStatus", () => {
  const due = "2026-03-01";

  it("is paid when paidSen >= amountSen, even long after the due date", () => {
    expect(
      invoiceStatus(
        { dueDate: due, amountSen: 1000, paidSen: 1000 },
        new Date("2027-01-01T00:00:00Z"),
      ),
    ).toBe("paid");
    expect(
      invoiceStatus(
        { dueDate: due, amountSen: 1000, paidSen: 1500 },
        new Date("2027-01-01T00:00:00Z"),
      ),
    ).toBe("paid");
    expect(
      invoiceStatus(
        { dueDate: due, amountSen: 0, paidSen: 0 },
        new Date("2027-01-01T00:00:00Z"),
      ),
    ).toBe("paid");
  });

  it("is not overdue until 00:00 Malaysia time the day after the due date", () => {
    const unpaid = { dueDate: due, amountSen: 1000, paidSen: 0 };
    expect(invoiceStatus(unpaid, new Date("2026-03-01T15:59:59.999Z"))).toBe(
      "unpaid",
    );
    expect(invoiceStatus(unpaid, new Date("2026-03-01T16:00:00.000Z"))).toBe(
      "overdue",
    );
    expect(invoiceStatus(unpaid, new Date("2026-02-28T16:00:00.000Z"))).toBe(
      "unpaid",
    ); // Mar 1 00:00 MYT
    expect(invoiceStatus(unpaid, new Date("2026-02-28T15:59:59.999Z"))).toBe(
      "unpaid",
    );
  });

  it("overdue beats partially_paid; partially_paid before the deadline", () => {
    const partial = { dueDate: due, amountSen: 1000, paidSen: 1 };
    expect(invoiceStatus(partial, new Date("2026-03-01T15:59:59.999Z"))).toBe(
      "partially_paid",
    );
    expect(invoiceStatus(partial, new Date("2026-03-01T16:00:00.000Z"))).toBe(
      "overdue",
    );
    expect(
      invoiceStatus(
        { dueDate: due, amountSen: 1000, paidSen: 999 },
        new Date("2026-03-05T00:00:00Z"),
      ),
    ).toBe("overdue");
  });

  it("uses the Malaysia date across a year boundary", () => {
    const invoice = { dueDate: "2026-12-31", amountSen: 1000, paidSen: 0 };
    expect(invoiceStatus(invoice, new Date("2026-12-31T15:59:59.999Z"))).toBe(
      "unpaid",
    );
    expect(invoiceStatus(invoice, new Date("2026-12-31T16:00:00.000Z"))).toBe(
      "overdue",
    );
  });

  it("throws on an invalid Date or due date", () => {
    expect(() =>
      invoiceStatus(
        { dueDate: due, amountSen: 1000, paidSen: 0 },
        new Date("nope"),
      ),
    ).toThrow();
    expect(() =>
      invoiceStatus(
        { dueDate: "2026-02-30", amountSen: 1000, paidSen: 0 },
        new Date(),
      ),
    ).toThrow();
  });
});

describe("parseRinggitToSen", () => {
  it.each([
    ["1,500.50", 150_050],
    ["1.15", 115],
    ["7", 700],
    ["1.5", 150],
    ["0.05", 5],
    ["0", 0],
    ["0.10", 10],
    ["1,000", 100_000],
    ["1,234,567.89", 123_456_789],
    ["1500.50", 150_050],
    ["  1,500.50  ", 150_050],
    ["\t42\n", 4_200],
    ["007", 700],
    ["1000000", 100_000_000],
    ["90071992547409.91", Number.MAX_SAFE_INTEGER],
  ])("parses %j as %i sen", (input, expected) => {
    expect(parseRinggitToSen(input)).toBe(expected);
  });

  it.each([
    "",
    "  ",
    "-5",
    "+5",
    "1.234",
    "1e3",
    "RM 10",
    "1,23",
    "1,5000",
    ",500",
    "1,",
    "1.",
    ".5",
    "1 000",
    "1,000.",
    "1.5.0",
    "1,000,00",
    "１２",
    "Infinity",
    "NaN",
    "0x10",
    "90071992547409.92",
    "99999999999999999999",
  ])("rejects %j", (input) => {
    expect(() => parseRinggitToSen(input)).toThrow();
  });

  it("rejects non-string input", () => {
    expect(() => parseRinggitToSen(5 as unknown as string)).toThrow();
  });
});
