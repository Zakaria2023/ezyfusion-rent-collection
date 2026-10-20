"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { type ChangeEvent, useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { recordPaymentAction } from "@/app/(staff)/leases/[leaseId]/actions";
import {
  amountToSen,
  paymentFormSchema,
  type PaymentFormInput,
} from "@/app/(staff)/leases/[leaseId]/validation";
import type { ManualPaymentMethod } from "@/lib/enums";
import { formatSen } from "@/lib/money";

type RecordPaymentFormOptions = {
  leaseId: string;
  // 'YYYY-MM-DDTHH:mm' in Malaysia time, computed on the server: the browser's
  // clock or zone never decides the default.
  defaultReceivedAt: string;
};

// Recording a payment: validation (shared zod schema), the slip file, the
// FormData call to the Server Action, toasts and resetting after success.
export const useRecordPaymentForm = ({
  leaseId,
  defaultReceivedAt,
}: RecordPaymentFormOptions) => {
  const [isPending, startTransition] = useTransition();
  // Bumped to remount the (uncontrolled) file input, which clears it.
  const [fileInputKey, setFileInputKey] = useState(0);
  const form = useForm<PaymentFormInput>({
    resolver: zodResolver(paymentFormSchema),
    defaultValues: {
      amount: "",
      method: "cash",
      receivedAt: defaultReceivedAt,
      slip: null,
    },
  });
  const method = useWatch({ control: form.control, name: "method" });

  const setMethod = (value: ManualPaymentMethod | null) => {
    if (value) {
      form.setValue("method", value, { shouldValidate: false });
      form.clearErrors("slip");
    }
  };

  const onSlipChange = (event: ChangeEvent<HTMLInputElement>) =>
    form.setValue("slip", event.target.files?.[0] ?? null, {
      shouldValidate: true,
    });

  const submit = (values: PaymentFormInput) =>
    startTransition(async () => {
      const data = new FormData();
      data.set("amount", values.amount);
      data.set("method", values.method);
      data.set("receivedAt", values.receivedAt);
      if (values.method === "bank_transfer" && values.slip) {
        data.set("slip", values.slip);
      }
      const result = await recordPaymentAction(leaseId, data);
      if (!result.ok) {
        toast.error(`Could not record the payment: ${result.error}`);
        return;
      }
      const amount = formatSen(amountToSen(values.amount));
      toast.success(
        result.status === "approved"
          ? `${amount} recorded and approved.`
          : `${amount} recorded. It waits for a manager's approval.`,
      );
      form.reset({
        amount: "",
        method: values.method,
        receivedAt: values.receivedAt,
        slip: null,
      });
      setFileInputKey((key) => key + 1);
    });

  return {
    register: form.register,
    control: form.control,
    errors: form.formState.errors,
    method,
    setMethod,
    onSlipChange,
    fileInputKey,
    onSubmit: form.handleSubmit(submit),
    isPending,
  };
};
