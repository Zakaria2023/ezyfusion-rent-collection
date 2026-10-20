import { z } from "zod";

// Mirrors the CHECK on public.tenants.phone (the real guard: tenants update
// this column directly through the Data API). Blank means "no phone" (null).
export const PHONE_PATTERN = /^\+?[0-9][0-9 -]{6,19}$/;

export const phoneFormSchema = z.object({
  phone: z
    .string()
    .trim()
    .refine(
      (value) => value === "" || PHONE_PATTERN.test(value),
      "Use 7 to 20 digits, spaces or dashes, optionally starting with +.",
    ),
});

export type PhoneFormInput = z.infer<typeof phoneFormSchema>;

/** Form value -> column value: blank clears the phone number. */
export const toPhoneColumn = (phone: string): string | null =>
  phone === "" ? null : phone;
