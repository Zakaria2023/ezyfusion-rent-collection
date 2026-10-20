"use client";

import { Copy, CreditCard } from "lucide-react";
import Link from "next/link";
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
};

export const PayNowButton = ({
  leaseId,
  amountDueNowSen,
  onCreated,
}: PayNowButtonProps) => {
  const { payNow, isPending, bill, copyBillId, onOpenChange } = usePayNow(
    leaseId,
    onCreated,
  );

  return (
    <>
      <Button onClick={payNow} disabled={isPending || amountDueNowSen <= 0}>
        <CreditCard data-icon="inline-start" />
        {isPending ? "Creating bill…" : "Pay now"}
      </Button>
      <Dialog open={bill !== null} onOpenChange={onOpenChange}>
        {bill ? (
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Gateway bill created</DialogTitle>
              <DialogDescription>
                In production you would now be sent to the payment gateway.
                Here, play the gateway with the simulator below.
              </DialogDescription>
            </DialogHeader>
            <dl className="grid grid-cols-3 gap-2 text-sm">
              <dt className="text-muted-foreground">Amount</dt>
              <dd className="col-span-2 font-medium tabular-nums">
                {formatSen(bill.amountSen)}
              </dd>
              <dt className="text-muted-foreground">Bill id</dt>
              <dd className="col-span-2 flex items-center gap-1">
                <code className="truncate font-mono text-xs">
                  {bill.billId}
                </code>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={copyBillId}
                  aria-label="Copy bill id"
                >
                  <Copy />
                </Button>
              </dd>
            </dl>
            <div className="flex flex-col gap-1">
              <p className="text-muted-foreground">
                With GATEWAY_X_SIGNATURE_KEY set, run:
              </p>
              <pre className="overflow-x-auto rounded-md bg-muted p-2 font-mono text-xs">
                {`node scripts/gateway-sim.mjs ${bill.billId} ${bill.amountSen}`}
              </pre>
            </div>
            <DialogFooter showCloseButton>
              <Link
                href={`/payments/return?bill_id=${encodeURIComponent(bill.billId)}&paid=true`}
                className={buttonVariants()}
              >
                Go to the return page
              </Link>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  );
};
