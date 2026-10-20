import { LoadingTable } from "@/components/layout/loading-table";
import { Skeleton } from "@/components/ui/skeleton";

const LeaseLoading = () => (
  <div className="flex flex-col gap-6">
    <Skeleton className="h-7 w-28" />
    <div className="flex flex-col gap-2">
      <Skeleton className="h-8 w-72" />
      <Skeleton className="h-4 w-96 max-w-full" />
    </div>
    <Skeleton className="h-20 rounded-xl" />
    <LoadingTable rows={6} columns={5} />
    <LoadingTable rows={3} columns={6} />
  </div>
);

export default LeaseLoading;
