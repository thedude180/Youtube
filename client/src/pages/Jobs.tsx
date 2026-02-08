import { useJobs } from "@/hooks/use-jobs";
import { StatusBadge } from "@/components/StatusBadge";
import { format } from "date-fns";
import { Activity, Clock, CheckCircle2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function Jobs() {
  const { data: jobs, isLoading } = useJobs();

  if (isLoading) return <JobsSkeleton />;

  return (
    <div className="p-8 max-w-[1600px] mx-auto animate-in fade-in duration-500">
      <div className="mb-8">
        <h1 data-testid="text-page-title" className="text-3xl font-display font-bold text-foreground">Operations Monitor</h1>
        <p className="text-muted-foreground mt-1">Real-time status of background processing tasks.</p>
      </div>

      <Card className="overflow-hidden">
        <div className="grid grid-cols-12 gap-4 p-4 border-b border-border/50 text-xs font-semibold text-muted-foreground uppercase tracking-wider bg-secondary/30">
          <div className="col-span-1 text-center">ID</div>
          <div className="col-span-4">Job Type</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-3">Started</div>
          <div className="col-span-2 text-right">Duration</div>
        </div>

        <div className="divide-y divide-border/50">
          {jobs?.map((job) => (
            <div
              key={job.id}
              data-testid={`row-job-${job.id}`}
              className="grid grid-cols-12 gap-4 p-4 items-center hover:bg-secondary/30 transition-colors text-sm"
            >
              <div className="col-span-1 text-center font-mono text-muted-foreground">#{job.id}</div>
              <div className="col-span-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-secondary">
                    <Activity className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p data-testid={`text-job-type-${job.id}`} className="font-medium capitalize">
                      {job.type.replace(/_/g, " ")}
                    </p>
                    {job.errorMessage && (
                      <p className="text-xs text-destructive mt-0.5">{job.errorMessage}</p>
                    )}
                  </div>
                </div>
              </div>
              <div className="col-span-2">
                <StatusBadge status={job.status} />
              </div>
              <div className="col-span-3 flex items-center gap-2 text-muted-foreground">
                <Clock className="h-3 w-3" />
                {job.startedAt ? format(new Date(job.startedAt), "MMM d, HH:mm:ss") : "-"}
              </div>
              <div className="col-span-2 text-right font-mono text-muted-foreground">
                {job.completedAt && job.startedAt
                  ? `${((new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime()) / 1000).toFixed(1)}s`
                  : "-"}
              </div>
            </div>
          ))}

          {(!jobs || jobs.length === 0) && (
            <CardContent className="p-12 text-center text-muted-foreground flex flex-col items-center">
              <CheckCircle2 className="h-12 w-12 opacity-20 mb-4" />
              <p>No jobs in history.</p>
            </CardContent>
          )}
        </div>
      </Card>
    </div>
  );
}

function JobsSkeleton() {
  return (
    <div className="p-8 space-y-6">
      <Skeleton className="h-10 w-1/3 mb-8" />
      <Skeleton className="h-[600px] w-full rounded-xl" />
    </div>
  );
}
