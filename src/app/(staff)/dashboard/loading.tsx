import { Skeleton } from "@/components/ui/skeleton";

const DashboardLoading = () => (
  <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading">
    <div className="flex items-center gap-4">
      <Skeleton className="size-10 rounded-xl" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
    </div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 3 }, (_, card) => (
        <div
          key={card}
          className="flex flex-col gap-4 rounded-2xl border bg-card p-5"
        >
          <div className="flex justify-between">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="size-10 rounded-xl" />
          </div>
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-3 w-56 max-w-full" />
        </div>
      ))}
    </div>
    <div className="flex flex-col gap-6 rounded-2xl border bg-card p-5">
      <div className="flex items-center gap-3">
        <Skeleton className="size-8 rounded-lg" />
        <Skeleton className="h-5 w-40" />
      </div>
      <div className="flex h-56 items-end gap-6 px-4">
        {[40, 65, 30, 80, 55, 70].map((height) => (
          <Skeleton
            key={height}
            className="flex-1 rounded-b-none"
            style={{ height: `${height}%` }}
          />
        ))}
      </div>
    </div>
  </div>
);

export default DashboardLoading;
