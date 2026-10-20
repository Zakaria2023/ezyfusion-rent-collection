"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  type PhoneFormInput,
  phoneFormSchema,
  toPhoneColumn,
} from "./phone-schema";

const CHECK_VIOLATION = "23514";

// Updates the tenant's own phone straight through the Data API. The tenant's
// token can UPDATE only tenants.phone (column grant) on their own row (RLS);
// the DB CHECK validates the format. An update that matches no visible row
// returns zero rows rather than an error, so that case is treated as a failure.
export const usePhoneForm = (
  tenantId: string,
  phone: string | null,
  onSaved: () => void,
) => {
  const [isPending, startTransition] = useTransition();
  const form = useForm<PhoneFormInput>({
    resolver: zodResolver(phoneFormSchema),
    values: { phone: phone ?? "" },
  });

  const save = (values: PhoneFormInput) =>
    startTransition(async () => {
      const { data, error } = await createSupabaseBrowserClient()
        .from("tenants")
        .update({ phone: toPhoneColumn(values.phone) })
        .eq("id", tenantId)
        .select("id");
      if (error) {
        toast.error(
          error.code === CHECK_VIOLATION
            ? "That phone number is not in a valid format."
            : `Could not save your phone number: ${error.message}`,
        );
        return;
      }
      if (!data || data.length === 0) {
        toast.error("Could not save your phone number. Reload and try again.");
        return;
      }
      toast.success(
        values.phone === "" ? "Phone number removed." : "Phone number saved.",
      );
      onSaved();
    });

  return {
    register: form.register,
    errors: form.formState.errors,
    isDirty: form.formState.isDirty,
    onSubmit: form.handleSubmit(save),
    isPending,
  };
};
