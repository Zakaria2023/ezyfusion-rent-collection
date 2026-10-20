"use client";

import { Loader2, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePhoneForm } from "./use-phone-form";

type PhoneFormProps = {
  tenantId: string;
  phone: string | null;
  onSaved: () => void;
};

export const PhoneForm = ({ tenantId, phone, onSaved }: PhoneFormProps) => {
  const { register, errors, isDirty, onSubmit, isPending } = usePhoneForm(
    tenantId,
    phone,
    onSaved,
  );

  return (
    <form className="flex flex-col gap-2" onSubmit={onSubmit} noValidate>
      <Label htmlFor="phone">Phone number</Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1 sm:max-w-xs">
          <Phone
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            id="phone"
            type="tel"
            autoComplete="tel"
            placeholder="+60 12-345 6789"
            className="h-9 pl-9"
            aria-invalid={errors.phone ? true : undefined}
            aria-describedby="phone-help"
            {...register("phone")}
          />
        </div>
        <Button type="submit" size="lg" disabled={isPending || !isDirty}>
          {isPending ? (
            <>
              <Loader2 className="animate-spin" data-icon="inline-start" />
              Saving…
            </>
          ) : (
            "Save"
          )}
        </Button>
      </div>
      {errors.phone ? (
        <p className="text-sm text-destructive">{errors.phone.message}</p>
      ) : (
        <p id="phone-help" className="text-xs text-muted-foreground">
          Leave blank to remove your phone number.
        </p>
      )}
    </form>
  );
};
