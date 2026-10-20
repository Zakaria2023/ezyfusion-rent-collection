"use client";

import { Ban } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { ReasonField } from "./reason-field";
import { useVoidPayment } from "./use-void-payment";

type VoidPaymentDialogProps = { paymentId: string; amountLabel: string };

// The confirmation step the brief asks for: voiding is irreversible, so it
// sits behind an alert dialog that also collects the reason.
export const VoidPaymentDialog = ({
  paymentId,
  amountLabel,
}: VoidPaymentDialogProps) => {
  const { open, onOpenChange, register, errors, onSubmit, isPending } =
    useVoidPayment(paymentId);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogTrigger render={<Button variant="destructive" size="sm" />}>
        <Ban data-icon="inline-start" />
        Void
      </AlertDialogTrigger>
      <AlertDialogContent>
        <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
          <AlertDialogHeader>
            <AlertDialogTitle>Void payment of {amountLabel}?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. The payment&apos;s allocations are removed,
              so the invoices it paid become unpaid again. Other payments are
              not changed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ReasonField
            id={`void-reason-${paymentId}`}
            registration={register("reason")}
            error={errors.reason?.message}
            placeholder="e.g. Cheque bounced"
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <Button type="submit" variant="destructive" disabled={isPending}>
              {isPending ? "Voiding…" : "Void payment"}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
};
