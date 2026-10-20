"use client";

import { SLIP_ACCEPT } from "@/app/(staff)/leases/[leaseId]/validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MANUAL_PAYMENT_METHODS, type ManualPaymentMethod } from "@/lib/enums";
import { useRecordPaymentForm } from "./use-record-payment-form";

type RecordPaymentFormProps = {
  leaseId: string;
  defaultReceivedAt: string;
  capLabel: string;
  isManager: boolean;
};

const METHOD_LABELS: Record<ManualPaymentMethod, string> = {
  cash: "Cash",
  bank_transfer: "Bank transfer",
};

export const RecordPaymentForm = ({
  leaseId,
  defaultReceivedAt,
  capLabel,
  isManager,
}: RecordPaymentFormProps) => {
  const {
    register,
    errors,
    method,
    setMethod,
    onSlipChange,
    fileInputKey,
    onSubmit,
    isPending,
  } = useRecordPaymentForm({ leaseId, defaultReceivedAt });

  return (
    <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="payment-amount">Amount (RM)</Label>
          <Input
            id="payment-amount"
            inputMode="decimal"
            autoComplete="off"
            placeholder="1,500.00"
            aria-invalid={errors.amount ? true : undefined}
            {...register("amount")}
          />
          {errors.amount ? (
            <p className="text-sm text-destructive">{errors.amount.message}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Up to {capLabel} (remaining balance minus pending payments).
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="payment-method">Method</Label>
          <Select
            value={method}
            onValueChange={setMethod}
            items={METHOD_LABELS}
          >
            <SelectTrigger id="payment-method" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MANUAL_PAYMENT_METHODS.map((value) => (
                <SelectItem key={value} value={value}>
                  {METHOD_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.method ? (
            <p className="text-sm text-destructive">{errors.method.message}</p>
          ) : null}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="payment-received-at">
            Received at — Malaysia time (UTC+8)
          </Label>
          <Input
            id="payment-received-at"
            type="datetime-local"
            aria-invalid={errors.receivedAt ? true : undefined}
            {...register("receivedAt")}
          />
          {errors.receivedAt ? (
            <p className="text-sm text-destructive">
              {errors.receivedAt.message}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Read as Malaysia time whatever your device&apos;s timezone.
            </p>
          )}
        </div>
        {method === "bank_transfer" ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="payment-slip">Transfer slip</Label>
            <Input
              key={fileInputKey}
              id="payment-slip"
              type="file"
              accept={SLIP_ACCEPT}
              aria-invalid={errors.slip ? true : undefined}
              onChange={onSlipChange}
            />
            {errors.slip ? (
              <p className="text-sm text-destructive">{errors.slip.message}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                JPEG, PNG or PDF, 5 MB at most.
              </p>
            )}
          </div>
        ) : null}
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          {isManager
            ? "Your payments are approved and allocated immediately."
            : "Your payments wait for a manager's approval before they count."}
        </p>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Recording…" : "Record payment"}
        </Button>
      </div>
    </form>
  );
};
