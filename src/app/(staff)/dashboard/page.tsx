import type { Metadata } from "next";
import { CollectionsBars } from "@/components/dashboard/collections-bars";
import { OverdueCard } from "@/components/dashboard/overdue-card";
import { PageHeader } from "@/components/layout/page-header";
import { formatCalendarDate, lastNMonths, todayInMalaysia } from "@/lib/dates";
import { collectionsReport } from "@/lib/server/services/reports";
import { dashboardStats } from "@/lib/server/services/leases";
import { requireMemberPage } from "../require-member";

export const metadata: Metadata = { title: "Dashboard" };

export const dynamic = "force-dynamic";

const REPORT_MONTHS = 6;

const DashboardPage = async () => {
  const actor = await requireMemberPage();
  // One `now` for the whole page so the count, the report range and the
  // "today" label agree, even across Malaysia midnight.
  const now = new Date();
  const [from, to] = lastNMonths(now, REPORT_MONTHS);
  const [stats, collections] = await Promise.all([
    dashboardStats(actor, now),
    collectionsReport(actor, from, to),
  ]);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Overdue invoices and collections for your organization."
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <OverdueCard
          count={stats.overdueCount}
          today={formatCalendarDate(todayInMalaysia(now))}
        />
        <div className="lg:col-span-2">
          <CollectionsBars rows={collections} />
        </div>
      </div>
    </>
  );
};

export default DashboardPage;
