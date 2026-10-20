import { LoadingTable } from "@/components/layout/loading-table";
import { Skeleton } from "@/components/ui/skeleton";

export const PortalSkeleton = () => (
  <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading">
    <div className="flex items-center gap-4">
      <Skeleton className="size-10 rounded-xl" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
    </div>
    <Skeleton className="h-56 w-full rounded-3xl" />
    <LoadingTable rows={4} columns={5} />
    <div className="grid gap-6 xl:grid-cols-2">
      <LoadingTable rows={2} columns={4} />
      <LoadingTable rows={2} columns={4} />
    </div>
  </div>
);
