import { Skeleton } from "@/components/ui/skeleton";

interface PageSkeletonProps {
  variant: "dashboard" | "list" | "detail";
  "data-testid"?: string;
}

export function PageSkeleton({ variant, ...props }: PageSkeletonProps) {
  const testId = props["data-testid"] || `skeleton-${variant}`;

  if (variant === "dashboard") {
    return (
      <div className="p-3 lg:p-4 space-y-3 max-w-5xl mx-auto" data-testid={testId}>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-20 rounded-xl" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  if (variant === "list") {
    return (
      <div className="space-y-2" data-testid={testId}>
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-md" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid={testId}>
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
    </div>
  );
}
