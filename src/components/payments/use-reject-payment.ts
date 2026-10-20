"use client";

import { rejectPaymentAction } from "@/app/(staff)/leases/[leaseId]/actions";
import { useReasonDecision } from "./use-reason-decision";

export const useRejectPayment = (paymentId: string) =>
  useReasonDecision({
    run: (input) => rejectPaymentAction(paymentId, input),
    successMessage: "Payment rejected.",
    errorPrefix: "Could not reject",
  });
