import { BarChart3 } from "lucide-react";
import { SectionCard } from "@/components/layout/section-card";
import { formatSen } from "@/lib/money";
import { cn } from "@/lib/utils";
import { formatMonth, shortMonth } from "./month-label";

type CollectionsRow = { month: string; collectedSen: number };

type CollectionsBarsProps = { rows: readonly CollectionsRow[] };

type BarsProps = {
  rows: readonly CollectionsRow[];
  max: number;
  currentMonth: string | undefined;
};

// Bar size is presentation only (a percentage), never money arithmetic.
const barPercent = (value: number, max: number) =>
  max === 0 || value === 0 ? 0 : Math.max(2, Math.round((value / max) * 100));

// md+: a column chart with the amount above each bar.
const ColumnBars = ({ rows, max, currentMonth }: BarsProps) => (
  <ol className="hidden items-end md:flex" aria-label="Collections by month">
    {rows.map((row) => {
      const percent = barPercent(row.collectedSen, max);
      const isCurrent = row.month === currentMonth;
      return (
        <li key={row.month} className="flex flex-1 flex-col items-center">
          <span
            className={cn(
              "mb-2 text-xs font-medium tabular-nums",
              percent === 0 ? "text-muted-foreground" : "text-foreground",
            )}
          >
            {formatSen(row.collectedSen)}
          </span>
          <div className="flex h-52 w-full items-end border-b px-3 lg:px-5">
            {percent === 0 ? (
              <div className="h-1 w-full rounded-full bg-muted" />
            ) : (
              <div
                className="w-full rounded-t-lg bg-linear-to-t from-indigo-500 to-violet-500 shadow-md shadow-violet-500/20 transition-all"
                style={{ height: `${percent}%` }}
              />
            )}
          </div>
          <span
            className={cn(
              "mt-2 text-xs",
              isCurrent
                ? "font-semibold text-foreground"
                : "text-muted-foreground",
            )}
          >
            {formatMonth(row.month)}
          </span>
        </li>
      );
    })}
  </ol>
);

// Below md: horizontal bars, so long amounts never collide.
const RowBars = ({ rows, max, currentMonth }: BarsProps) => (
  <ol
    className="flex flex-col gap-4 md:hidden"
    aria-label="Collections by month"
  >
    {rows.map((row) => {
      const percent = barPercent(row.collectedSen, max);
      return (
        <li key={row.month} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between text-sm">
            <span
              className={cn(
                row.month === currentMonth
                  ? "font-semibold"
                  : "text-muted-foreground",
              )}
            >
              {shortMonth(row.month)} {row.month.slice(0, 4)}
            </span>
            <span className="font-medium tabular-nums">
              {formatSen(row.collectedSen)}
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-linear-to-r from-indigo-500 to-violet-500"
              style={{ width: `${percent}%` }}
            />
          </div>
        </li>
      );
    })}
  </ol>
);

export const CollectionsBars = ({ rows }: CollectionsBarsProps) => {
  const max = rows.reduce((m, row) => Math.max(m, row.collectedSen), 0);
  const total = rows.reduce((sum, row) => sum + row.collectedSen, 0);
  const first = rows[0];
  const last = rows[rows.length - 1];

  return (
    <SectionCard
      icon={BarChart3}
      title="Collections"
      description={`Approved payments by month received (Malaysia time)${
        first && last
          ? `, ${formatMonth(first.month)} – ${formatMonth(last.month)}`
          : ""
      }.`}
      action={
        <div className="flex flex-col items-end">
          <span className="text-xs text-muted-foreground">Total</span>
          <span className="text-lg font-semibold tabular-nums">
            {formatSen(total)}
          </span>
        </div>
      }
    >
      <div className="px-5 pt-6 pb-5">
        <ColumnBars rows={rows} max={max} currentMonth={last?.month} />
        <RowBars rows={rows} max={max} currentMonth={last?.month} />
      </div>
    </SectionCard>
  );
};
