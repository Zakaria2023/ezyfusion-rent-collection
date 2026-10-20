"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createPayNowBill } from "@/app/(tenant)/portal/actions";

type CreatedBill = { billId: string; amountSen: number };

// Pay now for one lease: creates the gateway bill on the server, then keeps it
// for the dialog. `onCreated` lets the portal re-fetch so the new bill shows.
export const usePayNow = (leaseId: string, onCreated: () => void) => {
  const [isPending, startTransition] = useTransition();
  const [bill, setBill] = useState<CreatedBill | null>(null);

  const payNow = () =>
    startTransition(async () => {
      const result = await createPayNowBill(leaseId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setBill({ billId: result.billId, amountSen: result.amountSen });
      toast.success("Payment started. Complete it at the gateway.");
      onCreated();
    });

  const copyBillId = async () => {
    if (!bill) {
      return;
    }
    try {
      await navigator.clipboard.writeText(bill.billId);
      toast.success("Bill id copied.");
    } catch {
      toast.error("Could not copy. Select the bill id and copy it by hand.");
    }
  };

  const onOpenChange = (open: boolean) => {
    if (!open) {
      setBill(null);
    }
  };

  return { payNow, isPending, bill, copyBillId, onOpenChange };
};
