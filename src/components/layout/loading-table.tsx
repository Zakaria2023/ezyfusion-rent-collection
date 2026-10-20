import { Skeleton } from "@/components/ui/skeleton";

type LoadingTableProps = {
  rows?: number;
  columns?: number;
};

export const LoadingTable = ({ rows = 5, columns = 4 }: LoadingTableProps) => (
  <div
    className="overflow-hidden rounded-2xl border bg-card shadow-sm shadow-primary/5"
    aria-busy="true"
    aria-label="Loading"
  >
    <div className="flex items-center gap-3 border-b px-5 py-4">
      <Skeleton className="size-8 rounded-lg" />
      <Skeleton className="h-5 w-40" />
    </div>
    <div className="flex gap-4 border-b bg-muted/40 px-4 py-3">
      {Array.from({ length: columns }, (_, column) => (
        <Skeleton key={column} className="h-3 flex-1" />
      ))}
    </div>
    {Array.from({ length: rows }, (_, row) => (
      <div key={row} className="flex gap-4 border-b px-4 py-4 last:border-b-0">
        {Array.from({ length: columns }, (_, column) => (
          <Skeleton key={column} className="h-4 flex-1" />
        ))}
      </div>
    ))}
  </div>
);
