import { LoadingTable } from "@/components/layout/loading-table";
import { Skeleton } from "@/components/ui/skeleton";

const LeasesLoading = () => (
  <div className="flex flex-col gap-6">
    <div className="flex flex-col gap-2">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-4 w-64" />
    </div>
    <Skeleton className="h-8 w-full max-w-md" />
    <LoadingTable rows={8} columns={6} />
  </div>
);

export default LeasesLoading;
