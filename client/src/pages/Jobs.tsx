import { useJobs } from "@/hooks/use-jobs";
import { StatusBadge } from "@/components/StatusBadge";
import { format } from "date-fns";
import { Activity } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function Jobs() {
  const { data: jobs, isLoading } = useJobs();

  if (isLoading) {
    return (
      <div className="p-6 lg:p-8 space-y-4 max-w-5xl mx-auto">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-5xl mx-auto">
      <h1 data-testid="text-page-title" className="text-2xl font-display font-bold">Operations</h1>

      <Card>
        {!jobs || jobs.length === 0 ? (
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Activity className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No jobs in history.</p>
          </CardContent>
        ) : (
          <div className="divide-y divide-border/50">
            {jobs.map((job) => (
              <div key={job.id} data-testid={`row-job-${job.id}`} className="p-4 flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span data-testid={`text-job-type-${job.id}`} className="text-sm font-medium capitalize">
                      {job.type.replace(/_/g, " ")}
                    </span>
                    <StatusBadge status={job.status} />
                  </div>
                  {job.errorMessage && (
                    <p className="text-xs text-destructive mt-0.5">{job.errorMessage}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {job.startedAt ? format(new Date(job.startedAt), "MMM d, h:mm a") : ""}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground font-mono shrink-0">
                  {job.completedAt && job.startedAt
                    ? `${((new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime()) / 1000).toFixed(1)}s`
                    : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
