import type { UseFormRegisterReturn } from "react-hook-form";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type ReasonFieldProps = {
  id: string;
  registration: UseFormRegisterReturn<"reason">;
  error?: string;
  placeholder: string;
};

export const ReasonField = ({
  id,
  registration,
  error,
  placeholder,
}: ReasonFieldProps) => (
  <div className="flex flex-col gap-2">
    <Label htmlFor={id}>Reason</Label>
    <Textarea
      id={id}
      placeholder={placeholder}
      aria-invalid={error ? true : undefined}
      {...registration}
    />
    {error ? (
      <p className="text-sm text-destructive">{error}</p>
    ) : (
      <p className="text-xs text-muted-foreground">At least 5 characters.</p>
    )}
  </div>
);
