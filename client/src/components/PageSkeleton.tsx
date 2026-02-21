import { Skeleton } from "@/components/ui/skeleton";

interface PageSkeletonProps {
  variant: "dashboard" | "list" | "detail";
  "data-testid"?: string;
}

export function PageSkeleton({ variant, ...props }: PageSkeletonProps) {
  const testId = props["data-testid"] || `skeleton-${variant}`;

  if (variant === "dashboard") {
    return (
      <div className="p-4 lg:p-6 space-y-4 max-w-5xl mx-auto fade-in" data-testid={testId}>
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-48 rounded-lg" />
          <Skeleton className="h-5 w-24 rounded-full" />
        </div>
        <Skeleton className="h-20 rounded-xl shimmer" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" style={{ animationDelay: `${i * 100}ms` }} />
          ))}
        </div>
        <Skeleton className="h-[300px] rounded-xl" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      </div>
    );
  }

  if (variant === "list") {
    return (
      <div className="space-y-2 fade-in" data-testid={testId}>
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" style={{ animationDelay: `${i * 50}ms` }} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4 fade-in" data-testid={testId}>
      <div className="space-y-2">
        <Skeleton className="h-8 w-64 rounded-lg" />
        <Skeleton className="h-4 w-96 rounded-md" />
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
    </div>
  );
}
