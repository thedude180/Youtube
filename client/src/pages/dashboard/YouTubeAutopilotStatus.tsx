import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Video, Zap, Clock, AlertCircle, CheckCircle2, Brain,
  TrendingUp, TrendingDown, Radio, BarChart3, RefreshCw,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type CopilotMode = "off" | "suggest" | "auto-safe" | "manual-approval";

const MODE_LABELS: Record<CopilotMode, string> = {
  "off": "Off",
  "suggest": "Suggest",
  "auto-safe": "Auto-Safe",
  "manual-approval": "Manual Approval",
};

const MODE_COLORS: Record<CopilotMode, string> = {
  "off": "bg-muted-foreground/20 text-muted-foreground",
  "suggest": "bg-blue-500/20 text-blue-400",
  "auto-safe": "bg-emerald-500/20 text-emerald-400",
  "manual-approval": "bg-amber-500/20 text-amber-400",
};

function formatBucketLabel(bucket: string): string {
  if (!bucket || bucket === "unknown") return "—";
  return bucket
    .replace("long_", "")
    .replace("short_", "")
    .replace(/_/g, "–")
    .replace(/(\d+)/g, "$1") + " min";
}

function formatWindowLabel(w: string): string {
  if (!w) return "—";
  const map: Record<string, string> = {
    morning: "Morning (07–09:30)",
    afternoon: "Afternoon (13–16:30)",
    evening: "Evening (20:30–23)",
    late_night: "Late Night",
  };
  return map[w] ?? w;
}

export default function YouTubeAutopilotStatus() {
  const { user } = useAuth();
  const { toast } = useToast();

  const { data, isLoading, refetch } = useQuery<any>({
    queryKey: ["/api/youtube/output-status"],
    refetchInterval: 60_000,
    enabled: !!user,
  });

  const cycleMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/youtube/learning/run-cycle"),
    onSuccess: () => {
      toast({ title: "Learning cycle triggered", description: "Analysing recent upload data…" });
      queryClient.invalidateQueries({ queryKey: ["/api/youtube/output-status"] });
    },
    onError: () => toast({ title: "Failed", description: "Could not trigger learning cycle.", variant: "destructive" }),
  });

  const modeMutation = useMutation({
    mutationFn: (mode: CopilotMode) => apiRequest("POST", "/api/youtube/copilot/mode", { mode }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/youtube/output-status"] });
    },
  });

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border/30 bg-card/20 p-4 space-y-3" data-testid="card-yt-autopilot-loading">
        <Skeleton className="h-5 w-48" />
        <div className="grid grid-cols-2 gap-2">
          <Skeleton className="h-16 rounded-lg" />
          <Skeleton className="h-16 rounded-lg" />
          <Skeleton className="h-16 rounded-lg" />
          <Skeleton className="h-16 rounded-lg" />
        </div>
      </div>
    );
  }

  if (!data) return null;

  const today = data.today ?? {};
  const nextPublish = data.nextPublish ?? {};
  const queue = data.queue ?? {};
  const learning = data.learning ?? {};
  const livestream = data.livestream ?? {};
  const copilot = data.copilot ?? {};
  const currentMode = (copilot.mode ?? "auto-safe") as CopilotMode;

  const nextShortMs = nextPublish.shortAt ? new Date(nextPublish.shortAt).getTime() - Date.now() : null;
  const nextLongMs = nextPublish.longFormAt ? new Date(nextPublish.longFormAt).getTime() - Date.now() : null;

  const shortsAtCap = today.shortsScheduled >= today.shortsMax;
  const lfAtCap = today.longFormScheduled >= today.longFormMax;

  return (
    <div className="rounded-xl border border-border/30 bg-card/20 p-4 space-y-4" data-testid="card-yt-autopilot">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Zap className="h-4 w-4 text-red-400" />
          YouTube Autopilot
        </h2>
        <div className="flex items-center gap-2">
          {livestream.active && (
            <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[10px] animate-pulse" data-testid="badge-live">
              <Radio className="h-2.5 w-2.5 mr-1" /> LIVE
            </Badge>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => refetch()}
            data-testid="button-refresh-autopilot"
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Today's schedule */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-background/40 border border-border/20 p-3" data-testid="card-shorts-today">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Shorts Today</span>
            {shortsAtCap
              ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              : <Clock className="h-3.5 w-3.5 text-muted-foreground/50" />}
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold text-foreground" data-testid="text-shorts-count">{today.shortsScheduled ?? 0}</span>
            <span className="text-xs text-muted-foreground">/ {today.shortsMax}</span>
          </div>
          {nextShortMs !== null && nextShortMs > 0 && !shortsAtCap && (
            <p className="text-[10px] text-muted-foreground mt-1" data-testid="text-next-short">
              Next: {formatDistanceToNow(new Date(nextPublish.shortAt), { addSuffix: true })}
            </p>
          )}
        </div>

        <div className="rounded-lg bg-background/40 border border-border/20 p-3" data-testid="card-longform-today">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Long-Form Today</span>
            {lfAtCap
              ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              : <Video className="h-3.5 w-3.5 text-muted-foreground/50" />}
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold text-foreground" data-testid="text-longform-count">{today.longFormScheduled ?? 0}</span>
            <span className="text-xs text-muted-foreground">/ {today.longFormMax}</span>
          </div>
          {nextLongMs !== null && nextLongMs > 0 && !lfAtCap && (
            <p className="text-[10px] text-muted-foreground mt-1" data-testid="text-next-longform">
              Next: {formatDistanceToNow(new Date(nextPublish.longFormAt), { addSuffix: true })}
            </p>
          )}
        </div>

        <div className="rounded-lg bg-background/40 border border-border/20 p-3" data-testid="card-queue-status">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">Queue</span>
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-bold text-foreground" data-testid="text-queue-backlog">{queue.backlog ?? 0}</span>
            <span className="text-[10px] text-muted-foreground">pending</span>
          </div>
          {(queue.failed ?? 0) > 0 && (
            <p className="text-[10px] text-red-400 mt-1 flex items-center gap-1" data-testid="text-queue-failed">
              <AlertCircle className="h-2.5 w-2.5" />{queue.failed} failed
            </p>
          )}
        </div>

        <div className="rounded-lg bg-background/40 border border-border/20 p-3" data-testid="card-quota-status">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">YouTube Quota</span>
          <Badge
            className={`text-[10px] ${data.quota?.status === "exhausted" ? "bg-red-500/20 text-red-400" : "bg-emerald-500/20 text-emerald-400"}`}
            data-testid="badge-quota"
          >
            {data.quota?.status === "exhausted" ? "Exhausted" : "OK"}
          </Badge>
        </div>
      </div>

      {/* Learning summary */}
      <div className="rounded-lg bg-background/40 border border-border/20 p-3 space-y-2" data-testid="card-learning">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-foreground flex items-center gap-1.5">
            <Brain className="h-3.5 w-3.5 text-violet-400" />
            Learning Brain
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 text-[10px] px-2"
            onClick={() => cycleMutation.mutate()}
            disabled={cycleMutation.isPending}
            data-testid="button-run-learning-cycle"
          >
            {cycleMutation.isPending ? "Running…" : "Run Cycle"}
          </Button>
        </div>

        {learning.summary && (
          <p className="text-[10px] text-muted-foreground leading-relaxed" data-testid="text-learning-summary">
            {learning.summary}
          </p>
        )}

        <div className="grid grid-cols-2 gap-2 pt-1">
          <div>
            <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wide mb-0.5">Best Duration</p>
            <div className="flex items-center gap-1" data-testid="text-best-bucket">
              <TrendingUp className="h-3 w-3 text-emerald-400" />
              <span className="text-[11px] text-emerald-400 font-medium">
                {formatBucketLabel(learning.bestDurationBucket ?? "")}
              </span>
            </div>
          </div>
          <div>
            <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wide mb-0.5">Worst Duration</p>
            <div className="flex items-center gap-1" data-testid="text-worst-bucket">
              <TrendingDown className="h-3 w-3 text-red-400" />
              <span className="text-[11px] text-red-400 font-medium">
                {formatBucketLabel(learning.worstDurationBucket ?? "")}
              </span>
            </div>
          </div>
          {learning.bestPostingWindow && (
            <div className="col-span-2">
              <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wide mb-0.5">Best Window</p>
              <div className="flex items-center gap-1" data-testid="text-best-window">
                <BarChart3 className="h-3 w-3 text-blue-400" />
                <span className="text-[11px] text-blue-400 font-medium">
                  {formatWindowLabel(learning.bestPostingWindow)}
                </span>
              </div>
            </div>
          )}
        </div>

        {learning.topInsight && (
          <p className="text-[10px] text-muted-foreground/70 italic border-l-2 border-violet-400/30 pl-2" data-testid="text-top-insight">
            {learning.topInsight}
          </p>
        )}
      </div>

      {/* Live copilot mode */}
      <div className="rounded-lg bg-background/40 border border-border/20 p-3 space-y-2" data-testid="card-copilot-mode">
        <span className="text-[11px] font-medium text-foreground flex items-center gap-1.5">
          <Radio className="h-3.5 w-3.5 text-red-400" />
          Chat Copilot Mode
        </span>
        <div className="flex flex-wrap gap-1.5">
          {(["off", "suggest", "auto-safe", "manual-approval"] as CopilotMode[]).map(m => (
            <button
              key={m}
              onClick={() => modeMutation.mutate(m)}
              disabled={modeMutation.isPending}
              data-testid={`button-copilot-mode-${m}`}
              className={`text-[10px] px-2 py-0.5 rounded-full border transition-all ${
                currentMode === m
                  ? `${MODE_COLORS[m]} border-current font-medium`
                  : "bg-transparent text-muted-foreground border-border/30 hover:border-border/60"
              }`}
            >
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>
        {livestream.active && (
          <p className="text-[10px] text-muted-foreground" data-testid="text-copilot-stream">
            Active stream: {livestream.title ?? `Stream #${livestream.streamId}`}
          </p>
        )}
      </div>
    </div>
  );
}
