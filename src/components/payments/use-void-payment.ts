"use client";

import { voidPaymentAction } from "@/app/(staff)/leases/[leaseId]/actions";
import { useReasonDecision } from "./use-reason-decision";

export const useVoidPayment = (paymentId: string) =>
  useReasonDecision({
    run: (input) => voidPaymentAction(paymentId, input),
    successMessage: "Payment voided. Its allocations were removed.",
    errorPrefix: "Could not void",
  });
