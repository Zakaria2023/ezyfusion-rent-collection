"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import {
  reasonFormSchema,
  type ReasonFormInput,
} from "@/app/(staff)/leases/[leaseId]/validation";

type DecisionResult = { ok: true } | { ok: false; error: string };

type ReasonDecisionOptions = {
  run: (input: ReasonFormInput) => Promise<DecisionResult>;
  successMessage: string;
  errorPrefix: string;
};

// Shared state for the reject and void dialogs: open/close, the reason field
// (>= 5 characters, re-checked by the service), the call, and the toasts.
export const useReasonDecision = ({
  run,
  successMessage,
  errorPrefix,
}: ReasonDecisionOptions) => {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const form = useForm<ReasonFormInput>({
    resolver: zodResolver(reasonFormSchema),
    defaultValues: { reason: "" },
  });

  const onOpenChange = (next: boolean) => {
    // Keep the dialog up while the request runs, so the result is seen.
    if (isPending) {
      return;
    }
    setOpen(next);
    if (!next) {
      form.reset();
    }
  };

  const submit = (values: ReasonFormInput) =>
    startTransition(async () => {
      const result = await run(values);
      if (!result.ok) {
        toast.error(`${errorPrefix}: ${result.error}`);
        return;
      }
      toast.success(successMessage);
      setOpen(false);
      form.reset();
    });

  return {
    open,
    onOpenChange,
    register: form.register,
    errors: form.formState.errors,
    onSubmit: form.handleSubmit(submit),
    isPending,
  };
};
