import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Scissors, ExternalLink, Loader2, CheckCircle2, XCircle, Clock, Film, Zap } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { safeArray } from "@/lib/safe-data";

interface SmartEditJob {
  id: number;
  status: string;
  content: string;
  createdAt: string;
  publishedAt: string | null;
  errorMessage: string | null;
  metadata: {
    sourceTitle?: string;
    gameName?: string;
    segmentCount?: number;
    reelYoutubeId?: string;
    title?: string;
    totalDurationSec?: number;
  } | null;
}

const STATUS_CONFIG: Record<string, { label: string; icon: typeof Clock; className: string }> = {
  pending: { label: "Queued", icon: Clock, className: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" },
  processing: { label: "Editing…", icon: Loader2, className: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  done: { label: "Ready", icon: CheckCircle2, className: "bg-green-500/10 text-green-400 border-green-500/20" },
  failed: { label: "Failed", icon: XCircle, className: "bg-red-500/10 text-red-400 border-red-500/20" },
};

function SmartEditJobRow({ job }: { job: SmartEditJob }) {
  const cfg = STATUS_CONFIG[job.status] || STATUS_CONFIG.pending;
  const StatusIcon = cfg.icon;
  const isProcessing = job.status === "processing";
  const isDone = job.status === "done";
  const meta = job.metadata || {};
  const title = meta.title || meta.sourceTitle || job.content?.replace("Smart edit highlight reel: ", "") || "Video";
  const reelId = meta.reelYoutubeId;

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-border/40 bg-card/40" data-testid={`smart-edit-job-${job.id}`}>
      <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        <Film className="h-4 w-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate" data-testid={`text-smart-edit-title-${job.id}`}>{title}</p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {meta.gameName && (
            <span className="text-[11px] text-muted-foreground">{meta.gameName}</span>
          )}
          {meta.segmentCount && isDone && (
            <span className="text-[11px] text-muted-foreground">{meta.segmentCount} segments</span>
          )}
          {job.createdAt && (
            <span className="text-[11px] text-muted-foreground">
              {formatDistanceToNow(new Date(job.createdAt), { addSuffix: true })}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {isDone && reelId && (
          <a
            href={`https://www.youtube.com/watch?v=${reelId}`}
            target="_blank"
            rel="noopener noreferrer"
            data-testid={`link-smart-edit-result-${job.id}`}
          >
            <Button variant="outline" size="sm" className="h-7 text-xs">
              <ExternalLink className="h-3 w-3 mr-1" />
              Watch
            </Button>
          </a>
        )}
        <Badge variant="outline" className={`text-[10px] ${cfg.className}`} data-testid={`badge-smart-edit-status-${job.id}`}>
          <StatusIcon className={`h-3 w-3 mr-1 ${isProcessing ? "animate-spin" : ""}`} />
          {cfg.label}
        </Badge>
      </div>
    </div>
  );
}

export default function SmartEditPanel() {
  const { toast } = useToast();

  const { data: jobsRaw, isLoading } = useQuery({
    queryKey: ["/api/content/smart-edit/jobs"],
    refetchInterval: (query) => {
      const jobs = safeArray<SmartEditJob>(query.state.data);
      const hasActive = jobs.some(j => j.status === "pending" || j.status === "processing");
      return hasActive ? 8000 : 30000;
    },
  });

  const jobs = safeArray<SmartEditJob>(jobsRaw);

  const batchMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/content/smart-edit/batch"),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/content/smart-edit/jobs"] });
      const count = data?.queued || 0;
      toast({
        title: count > 0 ? `${count} video${count !== 1 ? "s" : ""} queued for smart editing` : "No new long videos to queue",
        description: count > 0 ? "Your AI editor will process each one automatically." : "All long videos have already been processed.",
      });
    },
    onError: () => {
      toast({ title: "Failed to queue smart edits", variant: "destructive" });
    },
  });

  const activeJobs = jobs.filter(j => j.status === "pending" || j.status === "processing");
  const doneJobs = jobs.filter(j => j.status === "done");
  const failedJobs = jobs.filter(j => j.status === "failed");

  return (
    <Card data-testid="section-smart-edit-panel">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-primary/15 flex items-center justify-center">
              <Scissors className="h-4 w-4 text-primary" />
            </div>
            <CardTitle className="text-sm font-semibold">Smart Edit — AI Highlight Reels</CardTitle>
            {activeJobs.length > 0 && (
              <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-400 border-blue-500/20">
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                {activeJobs.length} active
              </Badge>
            )}
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => batchMutation.mutate()}
            disabled={batchMutation.isPending}
            data-testid="button-smart-edit-batch"
            className="h-8 text-xs"
          >
            {batchMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Zap className="h-3.5 w-3.5 mr-1.5" />
            )}
            Edit All Long Videos
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Automatically pulls any stream or video over 15 minutes, finds the best gaming moments using audio analysis, and uploads a polished highlight reel — no input required.
        </p>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading && (
          <div className="space-y-2">
            {[1, 2].map(i => (
              <div key={i} className="h-14 rounded-xl bg-muted/30 animate-pulse" />
            ))}
          </div>
        )}

        {!isLoading && jobs.length === 0 && (
          <div className="text-center py-6" data-testid="smart-edit-empty-state">
            <Film className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground font-medium">No smart edit jobs yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Click "Edit All Long Videos" to process all streams and videos over 15 minutes into highlight reels, or wait for the system to auto-detect them.
            </p>
          </div>
        )}

        {!isLoading && jobs.length > 0 && (
          <div className="space-y-2">
            {activeJobs.length > 0 && (
              <div className="space-y-2" data-testid="smart-edit-active-jobs">
                {activeJobs.map(job => <SmartEditJobRow key={job.id} job={job} />)}
              </div>
            )}
            {doneJobs.length > 0 && (
              <div className="space-y-2" data-testid="smart-edit-done-jobs">
                {doneJobs.slice(0, 5).map(job => <SmartEditJobRow key={job.id} job={job} />)}
                {doneJobs.length > 5 && (
                  <p className="text-xs text-muted-foreground text-center py-1">
                    +{doneJobs.length - 5} more completed
                  </p>
                )}
              </div>
            )}
            {failedJobs.length > 0 && (
              <div className="space-y-2" data-testid="smart-edit-failed-jobs">
                {failedJobs.slice(0, 3).map(job => <SmartEditJobRow key={job.id} job={job} />)}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
