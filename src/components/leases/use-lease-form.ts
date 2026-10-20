"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { createLeaseAction } from "@/app/(staff)/leases/new/actions";
import {
  leaseFormSchema,
  type LeaseFormInput,
} from "@/app/(staff)/leases/new/validation";
import {
  generateSchedule,
  parseRinggitToSen,
  type ScheduledInvoice,
} from "@/lib/billing";

export type SchedulePreview =
  | { state: "incomplete"; message: string }
  | { state: "invalid"; message: string }
  | { state: "ready"; invoices: ScheduledInvoice[]; totalSen: number };

type PreviewFields = Pick<
  LeaseFormInput,
  "startDate" | "endDate" | "monthlyRent" | "deposit"
>;

// Same ceiling as createLease (100 years of months): the preview refuses
// absurd ranges instead of building a huge schedule on every keystroke.
const MAX_YEARS = 100;

const DEFAULT_VALUES: LeaseFormInput = {
  unitId: "",
  tenantId: "",
  startDate: "",
  endDate: "",
  monthlyRent: "",
  deposit: "",
};

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Invalid lease terms.";

/**
 * The live preview: exactly what the server will store, because it is the
 * same pure generateSchedule. Never throws — bad input becomes a message.
 */
const buildPreview = (fields: PreviewFields): SchedulePreview => {
  if (!fields.startDate || !fields.endDate || !fields.monthlyRent.trim()) {
    return {
      state: "incomplete",
      message: "Enter the dates and the monthly rent to preview the invoices.",
    };
  }
  if (
    Number(fields.endDate.slice(0, 4)) - Number(fields.startDate.slice(0, 4)) >
    MAX_YEARS
  ) {
    return { state: "invalid", message: "A lease cannot exceed 100 years." };
  }
  let monthlyRentSen: number;
  let depositSen: number;
  try {
    monthlyRentSen = parseRinggitToSen(fields.monthlyRent);
  } catch {
    return {
      state: "invalid",
      message: "Monthly rent: enter an amount like 1,500.50.",
    };
  }
  try {
    depositSen =
      fields.deposit.trim() === "" ? 0 : parseRinggitToSen(fields.deposit);
  } catch {
    return {
      state: "invalid",
      message: "Deposit: enter an amount like 3,000.00, or leave it empty.",
    };
  }
  try {
    const invoices = generateSchedule({
      startDate: fields.startDate,
      endDate: fields.endDate,
      monthlyRentSen,
      depositSen,
    });
    const totalSen = invoices.reduce((sum, i) => sum + i.amountSen, 0);
    return { state: "ready", invoices, totalSen };
  } catch (error) {
    return { state: "invalid", message: errorMessage(error) };
  }
};

// New-lease form: field state, the live schedule preview, submit, toasts and
// the redirect to the created lease.
export const useLeaseForm = () => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const form = useForm<LeaseFormInput>({
    resolver: zodResolver(leaseFormSchema),
    defaultValues: DEFAULT_VALUES,
  });
  const [unitId, tenantId, startDate, endDate, monthlyRent, deposit] = useWatch(
    {
      control: form.control,
      name: [
        "unitId",
        "tenantId",
        "startDate",
        "endDate",
        "monthlyRent",
        "deposit",
      ],
    },
  );
  const preview = buildPreview({ startDate, endDate, monthlyRent, deposit });

  const setUnitId = (value: string | null) =>
    form.setValue("unitId", value ?? "", { shouldValidate: true });
  const setTenantId = (value: string | null) =>
    form.setValue("tenantId", value ?? "", { shouldValidate: true });

  const submit = (values: LeaseFormInput) =>
    startTransition(async () => {
      const result = await createLeaseAction(values);
      if (!result.ok) {
        toast.error(`Could not create the lease: ${result.error}`);
        return;
      }
      toast.success("Lease created with its invoices.");
      router.push(`/leases/${result.id}`);
    });

  return {
    register: form.register,
    control: form.control,
    errors: form.formState.errors,
    unitId,
    tenantId,
    setUnitId,
    setTenantId,
    preview,
    onSubmit: form.handleSubmit(submit),
    isPending,
  };
};
