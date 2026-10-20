"use server";

import { revalidatePath } from "next/cache";
import { malaysiaLocalToInstant } from "@/lib/dates";
import {
  approvePayment,
  recordPaymentWithSlip,
  rejectPayment,
  voidPayment,
  type PaymentStatus,
} from "@/lib/server/services/payments";
import {
  actorOrFail,
  fail,
  failFromError,
  isFailure,
  type ActionResult,
} from "../../action-result";
import {
  amountToSen,
  paymentFormSchema,
  reasonFormSchema,
  type ReasonFormInput,
} from "./validation";

// Server Actions for the lease page. Each one authenticates (actorOrFail) and
// hands the actor to a service, which does the 404/403 checks, the locking
// and the audit log. Nothing here decides who may do what.

type StatusResult = ActionResult<{ status: PaymentStatus }>;

const formString = (formData: FormData, key: string): string => {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
};

const formFile = (formData: FormData, key: string): File | null => {
  const value = formData.get(key);
  return value instanceof File && value.size > 0 ? value : null;
};

// Every lease page and the dashboard (overdue count, collections) may change.
const revalidateAfterPayment = () => {
  revalidatePath("/leases/[leaseId]", "page");
  revalidatePath("/dashboard");
};

/** Cash or bank transfer (with slip). receivedAt arrives as Malaysia wall-clock time. */
export const recordPaymentAction = async (
  leaseId: string,
  formData: FormData,
): Promise<StatusResult> => {
  const actor = await actorOrFail();
  if (isFailure(actor)) {
    return actor;
  }
  const parsed = paymentFormSchema.safeParse({
    amount: formString(formData, "amount"),
    method: formString(formData, "method"),
    receivedAt: formString(formData, "receivedAt"),
    slip: formFile(formData, "slip"),
  });
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid payment.");
  }
  const { amount, method, receivedAt, slip } = parsed.data;
  try {
    const result = await recordPaymentWithSlip(
      actor,
      leaseId,
      {
        amountSen: amountToSen(amount),
        method,
        // Interpreted here, on the server, as UTC+8 — never in the browser's zone.
        receivedAt: malaysiaLocalToInstant(receivedAt),
      },
      method === "bank_transfer" ? slip : null,
    );
    revalidateAfterPayment();
    return { ok: true, status: result.status };
  } catch (error) {
    return failFromError(error);
  }
};

export const approvePaymentAction = async (
  paymentId: string,
): Promise<StatusResult> => {
  const actor = await actorOrFail();
  if (isFailure(actor)) {
    return actor;
  }
  try {
    const result = await approvePayment(actor, paymentId);
    revalidateAfterPayment();
    return { ok: true, status: result.status };
  } catch (error) {
    return failFromError(error);
  }
};

export const rejectPaymentAction = async (
  paymentId: string,
  input: ReasonFormInput,
): Promise<StatusResult> => {
  const actor = await actorOrFail();
  if (isFailure(actor)) {
    return actor;
  }
  const parsed = reasonFormSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid reason.");
  }
  try {
    const result = await rejectPayment(actor, paymentId, parsed.data);
    revalidateAfterPayment();
    return { ok: true, status: result.status };
  } catch (error) {
    return failFromError(error);
  }
};

export const voidPaymentAction = async (
  paymentId: string,
  input: ReasonFormInput,
): Promise<StatusResult> => {
  const actor = await actorOrFail();
  if (isFailure(actor)) {
    return actor;
  }
  const parsed = reasonFormSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid reason.");
  }
  try {
    const result = await voidPayment(actor, paymentId, parsed.data);
    revalidateAfterPayment();
    return { ok: true, status: result.status };
  } catch (error) {
    return failFromError(error);
  }
};
