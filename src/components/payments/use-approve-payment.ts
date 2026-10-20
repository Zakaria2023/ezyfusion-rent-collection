"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { approvePaymentAction } from "@/app/(staff)/leases/[leaseId]/actions";

// Approve a pending payment. The Server Action re-checks the remaining
// balance under a lock; a 422 there arrives here as a toast and the payment
// stays pending.
export const useApprovePayment = (paymentId: string) => {
  const [isPending, startTransition] = useTransition();

  const approve = () =>
    startTransition(async () => {
      const result = await approvePaymentAction(paymentId);
      if (!result.ok) {
        toast.error(`Could not approve: ${result.error}`);
        return;
      }
      toast.success("Payment approved and allocated to invoices.");
    });

  return { approve, isPending };
};
