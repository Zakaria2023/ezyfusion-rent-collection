"use client";

import { AlertTriangle, FileText, Home, Mail, UserRound } from "lucide-react";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { SectionCard } from "@/components/layout/section-card";
import { Button } from "@/components/ui/button";
import { formatCalendarDate } from "@/lib/dates";
import { LeaseCard } from "./lease-card";
import { PhoneForm } from "./phone-form";
import { PortalSkeleton } from "./portal-skeleton";
import { usePortalData } from "./use-portal-data";

export const TenantPortal = () => {
  const { state, refresh } = usePortalData();

  if (state.kind === "loading") {
    return <PortalSkeleton />;
  }
  if (state.kind === "error") {
    return (
      <EmptyState
        icon={AlertTriangle}
        tone="rose"
        title="Could not load your lease"
        description={state.message}
        action={
          <Button variant="outline" onClick={refresh}>
            Try again
          </Button>
        }
      />
    );
  }
  if (!state.data) {
    return (
      <EmptyState
        icon={FileText}
        title="No tenant profile"
        description="Your login is not linked to a tenant record. Contact your property manager."
      />
    );
  }

  const { tenant, leases, today } = state.data;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={Home}
        title={`Hello, ${tenant.fullName}`}
        description={`Today is ${formatCalendarDate(today)} in Malaysia. All dates and times are Malaysia time (UTC+8).`}
      />
      {leases.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No lease yet"
          description="When your property manager sets up your lease, its invoices and payments will appear here."
        />
      ) : (
        leases.map((lease) => (
          <LeaseCard key={lease.id} lease={lease} onChanged={refresh} />
        ))
      )}
      <SectionCard
        icon={UserRound}
        tone="muted"
        title="Contact details"
        description="How your property manager can reach you."
        className="max-w-2xl"
      >
        <div className="flex flex-col gap-5 p-5">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">Email</span>
            <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Mail className="size-4" aria-hidden />
              {tenant.email}
            </span>
          </div>
          <PhoneForm
            tenantId={tenant.id}
            phone={tenant.phone}
            onSaved={refresh}
          />
        </div>
      </SectionCard>
    </div>
  );
};
