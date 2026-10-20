"use client";

import { X, XCircle } from "lucide-react";
import { IconChip } from "@/components/layout/icon-chip";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ReasonField } from "./reason-field";
import { useRejectPayment } from "./use-reject-payment";

type RejectPaymentDialogProps = { paymentId: string; amountLabel: string };

export const RejectPaymentDialog = ({
  paymentId,
  amountLabel,
}: RejectPaymentDialogProps) => {
  const { open, onOpenChange, register, errors, onSubmit, isPending } =
    useRejectPayment(paymentId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={<Button variant="outline-destructive" size="sm" />}
      >
        <X data-icon="inline-start" />
        Reject
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
          <DialogHeader>
            <IconChip icon={XCircle} tone="rose" size="md" className="mb-2" />
            <DialogTitle>Reject payment of {amountLabel}?</DialogTitle>
            <DialogDescription>
              The payment stays on record as rejected and is never allocated.
            </DialogDescription>
          </DialogHeader>
          <ReasonField
            id={`reject-reason-${paymentId}`}
            registration={register("reason")}
            error={errors.reason?.message}
            placeholder="e.g. Slip does not match the bank statement"
          />
          <DialogFooter>
            <Button type="submit" variant="destructive" disabled={isPending}>
              {isPending ? "Rejecting…" : "Reject payment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
