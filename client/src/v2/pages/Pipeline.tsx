import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Scissors, Zap, Clock, CheckCircle2, XCircle, Loader2, Play } from "lucide-react";
import { apiRequest } from "../lib/queryClient";
import { useSSE } from "../hooks/use-sse";
import { useToast } from "@/hooks/use-toast";

const STATUS_CONFIG: Record<string, { label: string; color: string; progress: number }> = {
  queued:      { label: "Queued",       color: "bg-zinc-500",   progress: 5 },
  downloading: { label: "Downloading",  color: "bg-blue-500",   progress: 20 },
  analyzing:   { label: "Analyzing",    color: "bg-purple-500", progress: 45 },
  clipping:    { label: "Clipping",     color: "bg-orange-500", progress: 70 },
  publishing:  { label: "Publishing",   color: "bg-yellow-500", progress: 85 },
  done:        { label: "Done",         color: "bg-green-500",  progress: 100 },
  failed:      { label: "Failed",       color: "bg-red-500",    progress: 0 },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: "bg-zinc-500", progress: 0 };
  return (
    <Badge className={`${cfg.color} text-white border-0 capitalize text-xs`}>
      {cfg.label}
    </Badge>
  );
}

export default function PipelinePage() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: runs = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/pipeline/runs"],
  });

  useSSE({
    "pipeline:started":     () => qc.invalidateQueries({ queryKey: ["/api/pipeline/runs"] }),
    "pipeline:analyzing":   () => qc.invalidateQueries({ queryKey: ["/api/pipeline/runs"] }),
    "pipeline:clips-ready": () => qc.invalidateQueries({ queryKey: ["/api/pipeline/runs"] }),
    "pipeline:done":        (d: any) => {
      qc.invalidateQueries({ queryKey: ["/api/pipeline/runs"] });
      toast({ title: "Pipeline complete!", description: `${d.clipCount} clips ready, ${d.promotionCount} promotions queued.` });
    },
    "pipeline:failed": (d: any) => {
      qc.invalidateQueries({ queryKey: ["/api/pipeline/runs"] });
      toast({ title: "Pipeline failed", description: d.error, variant: "destructive" });
    },
  });

  const activeRuns = runs.filter((r: any) => !["done", "failed"].includes(r.status));
  const completedRuns = runs.filter((r: any) => ["done", "failed"].includes(r.status));

  return (
    <div className="space-y-6" data-testid="page-pipeline">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Content Pipeline</h1>
          <p className="text-sm text-muted-foreground mt-1">
            AI automatically processes streams into Shorts, clips, and cross-platform posts
          </p>
        </div>
        <Badge variant="outline" className="text-xs gap-1 px-3 py-1.5">
          <Zap className="w-3 h-3 text-green-500" />
          Auto-running
        </Badge>
      </div>

      {/* How it works */}
      <Card data-testid="card-pipeline-info">
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center text-sm">
            {[
              { icon: "🔴", step: "1", label: "Stream Detected", desc: "YouTube API polling" },
              { icon: "📥", step: "2", label: "VOD Downloaded", desc: "Auto after stream ends" },
              { icon: "✂️",  step: "3", label: "AI Clips Generated", desc: "Top 5 highlights" },
              { icon: "🚀", step: "4", label: "Published Everywhere", desc: "YouTube + Discord" },
            ].map(({ icon, step, label, desc }) => (
              <div key={step} className="flex flex-col items-center gap-1" data-testid={`pipeline-step-${step}`}>
                <span className="text-2xl">{icon}</span>
                <p className="font-medium text-xs">{label}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Active pipelines */}
      {activeRuns.length > 0 && (
        <div className="space-y-3" data-testid="active-pipelines">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">In Progress</h2>
          {activeRuns.map((run: any) => {
            const cfg = STATUS_CONFIG[run.status] ?? STATUS_CONFIG.queued;
            return (
              <Card key={run.id} data-testid={`pipeline-run-${run.id}`}>
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="font-medium text-sm">{run.streamTitle ?? "Untitled Stream"}</p>
                      <p className="text-xs text-muted-foreground">
                        {run.streamGame ?? "Unknown game"} · Run #{run.id}
                      </p>
                    </div>
                    <StatusBadge status={run.status} />
                  </div>
                  <Progress value={cfg.progress} className="h-1.5" />
                  <p className="text-xs text-muted-foreground mt-2">
                    <Loader2 className="w-3 h-3 animate-spin inline mr-1" />
                    {cfg.label}...
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Completed pipelines */}
      {isLoading ? (
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      ) : completedRuns.length === 0 && activeRuns.length === 0 ? (
        <Card data-testid="card-pipeline-empty">
          <CardContent className="py-12 text-center">
            <Scissors className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-medium">No pipeline runs yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              The pipeline runs automatically when a stream ends.
              <br />
              Connect your YouTube channel in Settings to get started.
            </p>
          </CardContent>
        </Card>
      ) : completedRuns.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Completed</h2>
          {completedRuns.map((run: any) => (
            <Card key={run.id} data-testid={`pipeline-run-${run.id}`}>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      {run.status === "done"
                        ? <CheckCircle2 className="w-4 h-4 text-green-500" />
                        : <XCircle className="w-4 h-4 text-red-500" />
                      }
                      <p className="font-medium text-sm">{run.streamTitle ?? "Untitled Stream"}</p>
                    </div>
                    <p className="text-xs text-muted-foreground ml-6 mt-0.5">
                      {run.clipCount ?? 0} clips · {run.publishedCount ?? 0} promotions
                      · {run.completedAt ? new Date(run.completedAt).toLocaleDateString() : ""}
                    </p>
                    {run.errorMessage && (
                      <p className="text-xs text-red-500 ml-6 mt-1">{run.errorMessage}</p>
                    )}
                  </div>
                  <StatusBadge status={run.status} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
