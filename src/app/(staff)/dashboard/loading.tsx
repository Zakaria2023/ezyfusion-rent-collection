import { Skeleton } from "@/components/ui/skeleton";

const DashboardLoading = () => (
  <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading">
    <div className="flex flex-col gap-2">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-80" />
    </div>
    <div className="grid gap-6 lg:grid-cols-3">
      <Skeleton className="h-40 rounded-xl" />
      <Skeleton className="h-72 rounded-xl lg:col-span-2" />
    </div>
  </div>
);

export default DashboardLoading;
