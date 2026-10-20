"use client";

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
      <div className="flex gap-2">
        <Input
          id="phone"
          type="tel"
          autoComplete="tel"
          placeholder="+60 12-345 6789"
          className="max-w-xs"
          aria-invalid={errors.phone ? true : undefined}
          aria-describedby="phone-help"
          {...register("phone")}
        />
        <Button type="submit" disabled={isPending || !isDirty}>
          {isPending ? "Saving…" : "Save"}
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
