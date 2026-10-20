import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatSen } from "@/lib/money";

type CollectionsRow = { month: string; collectedSen: number };

type CollectionsBarsProps = { rows: readonly CollectionsRow[] };

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

// 'YYYY-MM' -> 'Mar 2026'. Pure string work: same text on server and browser.
const formatMonth = (yearMonth: string) =>
  `${MONTH_NAMES[Number(yearMonth.slice(5, 7)) - 1] ?? yearMonth} ${yearMonth.slice(0, 4)}`;

// Bar width is presentation only (a percentage), never money arithmetic.
const barPercent = (value: number, max: number) =>
  max === 0 || value === 0 ? 0 : Math.max(1, Math.round((value / max) * 100));

export const CollectionsBars = ({ rows }: CollectionsBarsProps) => {
  const max = rows.reduce((m, row) => Math.max(m, row.collectedSen), 0);
  const total = rows.reduce((sum, row) => sum + row.collectedSen, 0);
  const first = rows[0];
  const last = rows[rows.length - 1];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Collections</CardTitle>
        <CardDescription>
          {`Approved payments by month received (Malaysia time)${
            first && last
              ? `, ${formatMonth(first.month)} – ${formatMonth(last.month)}`
              : ""
          }. Total ${formatSen(total)}.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <li
              key={row.month}
              className="grid grid-cols-4 items-center gap-3 text-sm sm:grid-cols-6"
            >
              <span className="text-muted-foreground">
                {formatMonth(row.month)}
              </span>
              <div className="col-span-2 h-3 overflow-hidden rounded-full bg-muted sm:col-span-4">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${barPercent(row.collectedSen, max)}%` }}
                />
              </div>
              <span className="text-right font-medium tabular-nums">
                {formatSen(row.collectedSen)}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
};
