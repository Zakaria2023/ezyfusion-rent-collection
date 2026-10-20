import { LoadingTable } from "@/components/layout/loading-table";
import { Skeleton } from "@/components/ui/skeleton";

export const PortalSkeleton = () => (
  <div className="flex flex-col gap-6" aria-busy="true">
    <div className="flex flex-col gap-2">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-72" />
    </div>
    <Skeleton className="h-24 w-full" />
    <LoadingTable rows={4} columns={5} />
    <LoadingTable rows={2} columns={4} />
  </div>
);
