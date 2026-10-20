import { z } from "zod";
import { parseRinggitToSen } from "@/lib/billing";
import { malaysiaLocalToInstant } from "@/lib/dates";
import { MANUAL_PAYMENT_METHODS } from "@/lib/enums";

// Shared by the client form (zodResolver) and the Server Action (which
// re-validates: the browser is never trusted). The amount stays a string the
// user typed; it is turned into sen with parseRinggitToSen, the same parser
// the brief tests, so the form accepts exactly what the rules accept.

export const MAX_SLIP_BYTES = 5 * 1024 * 1024;
export const SLIP_ACCEPT = "image/jpeg,image/png,application/pdf";
const SLIP_MIME_TYPES = SLIP_ACCEPT.split(",");

const senOrNull = (value: string): number | null => {
  try {
    return parseRinggitToSen(value);
  } catch {
    return null;
  }
};

const isMalaysiaLocal = (value: string): boolean => {
  try {
    malaysiaLocalToInstant(value);
    return true;
  } catch {
    return false;
  }
};

export const amountField = z
  .string()
  .trim()
  .min(1, "Enter the amount in ringgit.")
  .refine((value) => senOrNull(value) !== null, {
    message: "Enter an amount like 1,500.50 (digits, optional 2 decimals).",
  })
  .refine((value) => (senOrNull(value) ?? 0) > 0, {
    message: "The amount must be more than RM 0.00.",
  });

// <input type="datetime-local"> gives 'YYYY-MM-DDTHH:mm' with no zone; the
// server reads it as Malaysia wall-clock time (malaysiaLocalToInstant).
export const receivedAtField = z
  .string()
  .min(1, "Enter when the money was received.")
  .refine(isMalaysiaLocal, { message: "Enter a valid date and time." });

export const paymentFormSchema = z
  .object({
    amount: amountField,
    method: z.enum(MANUAL_PAYMENT_METHODS, {
      message: "Choose cash or bank transfer.",
    }),
    receivedAt: receivedAtField,
    slip: z.custom<File | null>(
      (value) => value === null || value instanceof File,
      { message: "Choose a file." },
    ),
  })
  .superRefine((value, ctx) => {
    if (value.method !== "bank_transfer") {
      return;
    }
    if (!value.slip) {
      ctx.addIssue({
        code: "custom",
        path: ["slip"],
        message: "A bank transfer needs a slip (JPEG, PNG or PDF).",
      });
      return;
    }
    if (value.slip.size === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["slip"],
        message: "The file is empty.",
      });
    }
    if (value.slip.size > MAX_SLIP_BYTES) {
      ctx.addIssue({
        code: "custom",
        path: ["slip"],
        message: "The slip must be 5 MB or smaller.",
      });
    }
    // A hint only: the server decides the type from the file's bytes.
    if (value.slip.type && !SLIP_MIME_TYPES.includes(value.slip.type)) {
      ctx.addIssue({
        code: "custom",
        path: ["slip"],
        message: "Only JPEG, PNG or PDF files are accepted.",
      });
    }
  });

export const reasonFormSchema = z.object({
  reason: z
    .string()
    .trim()
    // Code points, like the DB's char_length CHECK (zod counts UTF-16 units).
    .refine(
      (reason) => [...reason].length >= 5,
      "Give a reason of at least 5 characters.",
    )
    .refine(
      (reason) => [...reason].length <= 500,
      "Keep the reason under 500 characters.",
    ),
});

export type PaymentFormInput = z.infer<typeof paymentFormSchema>;
export type ReasonFormInput = z.infer<typeof reasonFormSchema>;

/** 'RM' amount text -> sen, for a value that already passed amountField. */
export const amountToSen = (value: string): number =>
  parseRinggitToSen(value.trim());
