import { LoadingTable } from "@/components/layout/loading-table";
import { Skeleton } from "@/components/ui/skeleton";

const LeasesLoading = () => (
  <div className="flex flex-col gap-6">
    <div className="flex items-center gap-4">
      <Skeleton className="size-10 rounded-xl" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-64 max-w-full" />
      </div>
    </div>
    <div className="flex items-center justify-between gap-3 rounded-2xl border bg-card p-3">
      <Skeleton className="h-9 w-full max-w-md" />
      <Skeleton className="hidden h-4 w-20 sm:block" />
    </div>
    <LoadingTable rows={8} columns={6} />
  </div>
);

export default LeasesLoading;
