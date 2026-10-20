"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SchedulePreview } from "./schedule-preview";
import { useLeaseForm } from "./use-lease-form";

type Option = { id: string; label: string };

type LeaseFormProps = { units: readonly Option[]; tenants: readonly Option[] };

type FieldErrorProps = { message?: string };

const FieldError = ({ message }: FieldErrorProps) =>
  message ? <p className="text-sm text-destructive">{message}</p> : null;

const toItems = (options: readonly Option[]) =>
  options.map((option) => ({ value: option.id, label: option.label }));

export const LeaseForm = ({ units, tenants }: LeaseFormProps) => {
  const {
    register,
    errors,
    unitId,
    tenantId,
    setUnitId,
    setTenantId,
    preview,
    onSubmit,
    isPending,
  } = useLeaseForm();

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Lease terms</CardTitle>
          <CardDescription>
            Both dates are inclusive: the end date is the tenant&apos;s last
            day.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
            <div className="flex flex-col gap-2">
              <Label htmlFor="lease-unit">Unit</Label>
              <Select
                value={unitId || null}
                onValueChange={setUnitId}
                items={toItems(units)}
              >
                <SelectTrigger
                  id="lease-unit"
                  className="w-full"
                  aria-invalid={errors.unitId ? true : undefined}
                >
                  <SelectValue placeholder="Choose a unit" />
                </SelectTrigger>
                <SelectContent>
                  {units.map((unit) => (
                    <SelectItem key={unit.id} value={unit.id}>
                      {unit.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError message={errors.unitId?.message} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="lease-tenant">Tenant</Label>
              <Select
                value={tenantId || null}
                onValueChange={setTenantId}
                items={toItems(tenants)}
              >
                <SelectTrigger
                  id="lease-tenant"
                  className="w-full"
                  aria-invalid={errors.tenantId ? true : undefined}
                >
                  <SelectValue placeholder="Choose a tenant" />
                </SelectTrigger>
                <SelectContent>
                  {tenants.map((tenant) => (
                    <SelectItem key={tenant.id} value={tenant.id}>
                      {tenant.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError message={errors.tenantId?.message} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="lease-start">Start date</Label>
                <Input
                  id="lease-start"
                  type="date"
                  aria-invalid={errors.startDate ? true : undefined}
                  {...register("startDate")}
                />
                <FieldError message={errors.startDate?.message} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="lease-end">End date (inclusive)</Label>
                <Input
                  id="lease-end"
                  type="date"
                  aria-invalid={errors.endDate ? true : undefined}
                  {...register("endDate")}
                />
                <FieldError message={errors.endDate?.message} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="lease-rent">Monthly rent (RM)</Label>
                <Input
                  id="lease-rent"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="1,500.00"
                  aria-invalid={errors.monthlyRent ? true : undefined}
                  {...register("monthlyRent")}
                />
                <FieldError message={errors.monthlyRent?.message} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="lease-deposit">Deposit (RM, optional)</Label>
                <Input
                  id="lease-deposit"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="3,000.00"
                  aria-invalid={errors.deposit ? true : undefined}
                  {...register("deposit")}
                />
                <FieldError message={errors.deposit?.message} />
              </div>
            </div>
            <Button type="submit" disabled={isPending} className="self-end">
              {isPending ? "Creating…" : "Create lease"}
            </Button>
          </form>
        </CardContent>
      </Card>
      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Invoices this lease creates</h2>
        <SchedulePreview preview={preview} />
      </div>
    </div>
  );
};
