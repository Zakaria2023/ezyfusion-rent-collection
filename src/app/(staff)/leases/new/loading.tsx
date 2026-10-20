import { Skeleton } from "@/components/ui/skeleton";

const NewLeaseLoading = () => (
  <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading">
    <div className="flex flex-col gap-2">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-4 w-96 max-w-full" />
    </div>
    <div className="grid gap-6 lg:grid-cols-2">
      <Skeleton className="h-96 rounded-xl" />
      <Skeleton className="h-96 rounded-xl" />
    </div>
  </div>
);

export default NewLeaseLoading;
