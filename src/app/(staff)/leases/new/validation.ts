import { z } from "zod";
import { isCalendarDate, parseRinggitToSen } from "@/lib/billing";

// The new-lease form, shared by the client (zodResolver + live preview) and
// the Server Action. Money stays as typed text until parseRinggitToSen turns
// it into integer sen; dates stay 'YYYY-MM-DD' strings (no Date, no zone).

const parsesAsSen = (value: string): boolean => {
  try {
    parseRinggitToSen(value);
    return true;
  } catch {
    return false;
  }
};

const ringgit = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `Enter the ${label} in ringgit.`)
    .refine(parsesAsSen, {
      message: "Enter an amount like 1,500.50 (digits, optional 2 decimals).",
    });

const calendarDate = (label: string) =>
  z
    .string()
    .min(1, `Choose the ${label}.`)
    .refine(isCalendarDate, { message: `The ${label} is not a valid date.` });

export const leaseFormSchema = z
  .object({
    unitId: z.string().min(1, "Choose a unit."),
    tenantId: z.string().min(1, "Choose a tenant."),
    startDate: calendarDate("start date"),
    endDate: calendarDate("end date"),
    monthlyRent: ringgit("monthly rent").refine(
      (value) => !parsesAsSen(value) || parseRinggitToSen(value) > 0,
      { message: "Monthly rent must be more than RM 0.00." },
    ),
    // Optional: an empty deposit means no deposit invoice.
    deposit: z
      .string()
      .trim()
      .refine((value) => value === "" || parsesAsSen(value), {
        message: "Enter an amount like 3,000.00, or leave it empty.",
      }),
  })
  .refine(
    (value) =>
      !isCalendarDate(value.startDate) ||
      !isCalendarDate(value.endDate) ||
      value.endDate >= value.startDate,
    { path: ["endDate"], message: "The end date cannot be before the start." },
  );

export type LeaseFormInput = z.infer<typeof leaseFormSchema>;

/** Form text -> the createLease body (integer sen). Call on validated input. */
export const toCreateLeaseBody = (values: LeaseFormInput) => ({
  unitId: values.unitId,
  tenantId: values.tenantId,
  startDate: values.startDate,
  endDate: values.endDate,
  monthlyRentSen: parseRinggitToSen(values.monthlyRent),
  depositSen: values.deposit === "" ? 0 : parseRinggitToSen(values.deposit),
});
