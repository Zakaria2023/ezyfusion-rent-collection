"use client";

import {
  ArrowRight,
  Copy,
  CreditCard,
  Loader2,
  Receipt,
  Terminal,
} from "lucide-react";
import Link from "next/link";
import { IconChip } from "@/components/layout/icon-chip";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatSen } from "@/lib/money";
import { usePayNow } from "./use-pay-now";

type PayNowButtonProps = {
  leaseId: string;
  amountDueNowSen: number;
  onCreated: () => void;
  className?: string;
};

export const PayNowButton = ({
  leaseId,
  amountDueNowSen,
  onCreated,
  className,
}: PayNowButtonProps) => {
  const { payNow, isPending, bill, copyBillId, onOpenChange } = usePayNow(
    leaseId,
    onCreated,
  );

  return (
    <>
      <Button
        onClick={payNow}
        disabled={isPending || amountDueNowSen <= 0}
        className={className}
      >
        {isPending ? (
          <Loader2 className="animate-spin" data-icon="inline-start" />
        ) : (
          <CreditCard data-icon="inline-start" />
        )}
        {isPending ? "Creating bill…" : "Pay now"}
      </Button>
      <Dialog open={bill !== null} onOpenChange={onOpenChange}>
        {bill ? (
          <DialogContent className="gap-5 sm:max-w-lg">
            <DialogHeader className="gap-2">
              <IconChip
                icon={Receipt}
                tone="brand"
                size="md"
                className="mb-1"
              />
              <DialogTitle className="text-lg">
                Gateway bill created
              </DialogTitle>
              <DialogDescription>
                In production you would now be sent to the payment gateway.
                Here, play the gateway with the simulator below.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-1 rounded-xl bg-secondary/60 px-4 py-3 ring-1 ring-primary/10">
              <span className="text-xs text-secondary-foreground/80">
                Amount
              </span>
              <span className="text-2xl font-semibold tracking-tight text-secondary-foreground tabular-nums">
                {formatSen(bill.amountSen)}
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Bill id
              </span>
              <div className="flex items-center gap-2 rounded-lg border bg-muted/50 py-1.5 pr-1.5 pl-3">
                <code className="min-w-0 flex-1 truncate font-mono text-xs">
                  {bill.billId}
                </code>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={copyBillId}
                  aria-label="Copy bill id"
                >
                  <Copy />
                </Button>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Terminal className="size-3.5" aria-hidden />
                With GATEWAY_X_SIGNATURE_KEY set, run:
              </span>
              <pre className="overflow-x-auto rounded-lg bg-slate-950 px-3 py-2.5 font-mono text-xs text-slate-100">
                {`node scripts/gateway-sim.mjs ${bill.billId} ${bill.amountSen}`}
              </pre>
            </div>
            <DialogFooter showCloseButton>
              <Link
                href={`/payments/return?bill_id=${encodeURIComponent(bill.billId)}&paid=true`}
                className={buttonVariants()}
              >
                Go to the return page
                <ArrowRight data-icon="inline-end" />
              </Link>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  );
};
