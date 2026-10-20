"use client";

import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApprovePayment } from "./use-approve-payment";

type ApprovePaymentButtonProps = { paymentId: string };

export const ApprovePaymentButton = ({
  paymentId,
}: ApprovePaymentButtonProps) => {
  const { approve, isPending } = useApprovePayment(paymentId);

  return (
    <Button size="sm" onClick={approve} disabled={isPending}>
      <Check data-icon="inline-start" />
      {isPending ? "Approving…" : "Approve"}
    </Button>
  );
};
