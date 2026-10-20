import { Skeleton } from "@/components/ui/skeleton";

type LoadingTableProps = {
  rows?: number;
  columns?: number;
};

export const LoadingTable = ({ rows = 5, columns = 4 }: LoadingTableProps) => (
  <div
    className="flex flex-col gap-3 rounded-lg border p-4"
    aria-busy="true"
    aria-label="Loading"
  >
    <Skeleton className="h-5 w-1/3" />
    {Array.from({ length: rows }, (_, row) => (
      <div key={row} className="flex gap-4">
        {Array.from({ length: columns }, (_, column) => (
          <Skeleton key={column} className="h-4 flex-1" />
        ))}
      </div>
    ))}
  </div>
);
