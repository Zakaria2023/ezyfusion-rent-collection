"use client";

import { Info, Loader2 } from "lucide-react";
import { Controller } from "react-hook-form";
import { SLIP_ACCEPT } from "@/app/(staff)/leases/[leaseId]/validation";
import { Button } from "@/components/ui/button";
import { DateTimePicker } from "@/components/ui/date-time-picker";
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
    control,
    errors,
    method,
    setMethod,
    onSlipChange,
    fileInputKey,
    onSubmit,
    isPending,
  } = useRecordPaymentForm({ leaseId, defaultReceivedAt });

  return (
    <form className="flex flex-col gap-5" onSubmit={onSubmit} noValidate>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1">
        <div className="flex flex-col gap-2">
          <Label htmlFor="payment-amount">Amount (RM)</Label>
          <div className="relative">
            <span
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground"
              aria-hidden
            >
              RM
            </span>
            <Input
              id="payment-amount"
              inputMode="decimal"
              autoComplete="off"
              placeholder="1,500.00"
              className="pl-10 tabular-nums"
              aria-invalid={errors.amount ? true : undefined}
              {...register("amount")}
            />
          </div>
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
          <Controller
            control={control}
            name="receivedAt"
            render={({ field }) => (
              <DateTimePicker
                id="payment-received-at"
                value={field.value}
                onChange={field.onChange}
                invalid={Boolean(errors.receivedAt)}
              />
            )}
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
              className="h-auto py-1.5 file:mr-3 file:rounded-md file:bg-secondary file:px-2 file:text-secondary-foreground"
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
      <div className="flex flex-col gap-3 border-t pt-5">
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="mt-px size-3.5 shrink-0" aria-hidden />
          {isManager
            ? "Your payments are approved and allocated immediately."
            : "Your payments wait for a manager's approval before they count."}
        </p>
        <Button
          type="submit"
          size="lg"
          disabled={isPending}
          className="w-full shadow-lg shadow-primary/25"
        >
          {isPending ? (
            <>
              <Loader2 className="animate-spin" data-icon="inline-start" />
              Recording…
            </>
          ) : (
            "Record payment"
          )}
        </Button>
      </div>
    </form>
  );
};
