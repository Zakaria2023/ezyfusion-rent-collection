"use client";

import { CalendarRange, FileSignature, Loader2 } from "lucide-react";
import { Controller } from "react-hook-form";
import { SectionCard } from "@/components/layout/section-card";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
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
    control,
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
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <SectionCard
        icon={FileSignature}
        title="Lease terms"
        description="Both dates are inclusive: the end date is the tenant's last day."
      >
        <form
          className="flex flex-col gap-5 p-5"
          onSubmit={onSubmit}
          noValidate
        >
          <div className="grid gap-5 sm:grid-cols-2">
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
            <div className="flex flex-col gap-2">
              <Label htmlFor="lease-start">Start date</Label>
              <Controller
                control={control}
                name="startDate"
                render={({ field }) => (
                  <DatePicker
                    id="lease-start"
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="First day"
                    invalid={Boolean(errors.startDate)}
                  />
                )}
              />
              <FieldError message={errors.startDate?.message} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="lease-end">End date (inclusive)</Label>
              <Controller
                control={control}
                name="endDate"
                render={({ field }) => (
                  <DatePicker
                    id="lease-end"
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="Last day"
                    invalid={Boolean(errors.endDate)}
                  />
                )}
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
                className="tabular-nums"
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
                className="tabular-nums"
                aria-invalid={errors.deposit ? true : undefined}
                {...register("deposit")}
              />
              <FieldError message={errors.deposit?.message} />
            </div>
          </div>
          <div className="flex flex-col-reverse gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              The lease and all its invoices are saved together, or not at all.
            </p>
            <Button
              type="submit"
              size="lg"
              disabled={isPending}
              className="shadow-lg shadow-primary/25"
            >
              {isPending ? (
                <>
                  <Loader2 className="animate-spin" data-icon="inline-start" />
                  Creating…
                </>
              ) : (
                "Create lease"
              )}
            </Button>
          </div>
        </form>
      </SectionCard>
      <SectionCard
        icon={CalendarRange}
        tone="teal"
        title="Invoices this lease creates"
        description="A live preview, computed exactly as the server will store it."
        className="lg:sticky lg:top-8"
      >
        <SchedulePreview preview={preview} />
      </SectionCard>
    </div>
  );
};
