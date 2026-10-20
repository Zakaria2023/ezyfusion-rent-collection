import { Building2 } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { LeaseForm } from "@/components/leases/lease-form";
import { requireManager } from "@/lib/server/access";
import { requireMemberPage } from "../../require-member";
import { leaseFormOptions } from "./queries";

export const metadata: Metadata = { title: "New lease" };

export const dynamic = "force-dynamic";

// Managers only. Staff get a 404 page here; createLeaseAction refuses them
// independently (createLease -> 403), so hiding the page is not the guard.
const NewLeasePage = async () => {
  const actor = await requireMemberPage();
  if (actor.role !== "manager") {
    notFound();
  }
  requireManager(actor); // narrows the type; cannot throw after the check above
  const { units, tenants } = await leaseFormOptions(actor);

  return (
    <>
      <PageHeader
        title="New lease"
        description="The invoices are generated from these terms and stored with the lease, all or nothing."
      />
      {units.length === 0 || tenants.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Nothing to lease yet"
          description={
            units.length === 0
              ? "Your organization has no units."
              : "Your organization has no tenants."
          }
        />
      ) : (
        <LeaseForm units={units} tenants={tenants} />
      )}
    </>
  );
};

export default NewLeasePage;
