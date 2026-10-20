import { CalendarCheck, LayoutDashboard, TrendingUp } from "lucide-react";
import type { Metadata } from "next";
import { CollectionsBars } from "@/components/dashboard/collections-bars";
import { formatMonth } from "@/components/dashboard/month-label";
import { OverdueCard } from "@/components/dashboard/overdue-card";
import { StatCard } from "@/components/dashboard/stat-card";
import { PageHeader } from "@/components/layout/page-header";
import { formatCalendarDate, lastNMonths, todayInMalaysia } from "@/lib/dates";
import { formatSen } from "@/lib/money";
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
  // Display sums over the report rows (integer sen); the last row is the
  // current Malaysia month because the range ends at `to`.
  const thisMonth = collections[collections.length - 1];
  const totalSen = collections.reduce((sum, row) => sum + row.collectedSen, 0);

  return (
    <>
      <PageHeader
        icon={LayoutDashboard}
        title="Dashboard"
        description="Overdue invoices and collections for your organization."
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <OverdueCard
          count={stats.overdueCount}
          today={formatCalendarDate(todayInMalaysia(now))}
        />
        <StatCard
          icon={CalendarCheck}
          tone="emerald"
          label="Collected this month"
          value={formatSen(thisMonth?.collectedSen ?? 0)}
          hint={`Approved payments received in ${formatMonth(to)} (Malaysia time).`}
        />
        <StatCard
          icon={TrendingUp}
          tone="primary"
          label={`Collected, last ${REPORT_MONTHS} months`}
          value={formatSen(totalSen)}
          hint={`${formatMonth(from)} – ${formatMonth(to)}, approved payments only.`}
        />
      </div>
      <CollectionsBars rows={collections} />
    </>
  );
};

export default DashboardPage;
