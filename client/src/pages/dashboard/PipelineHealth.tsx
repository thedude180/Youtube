import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CheckCircle2, AlertTriangle, XCircle, RefreshCw, ExternalLink,
  Clock, Video, Zap, TrendingUp, Radio,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";

interface TraceDetail {
  title?: string;
  privacyStatus?: string;
  uploadStatus?: string;
  viewCount?: number;
  youtubeUrl?: string;
  queueScheduledAt?: string;
  queuePublishedAt?: string;
  youtubePublishedAt?: string;
  overdueByMin?: number;
  reason?: string;
}

interface TraceItem {
  id: number;
  youtubeVideoId?: string | null;
  contentType?: string | null;
  gameName?: string | null;
  durationMs?: number | null;
  stage?: string;
  status?: string;
  issueType?: string;
  detail?: TraceDetail | null;
  createdAt?: string | null;
}

interface PipelineHealthData {
  successRate: number | null;
  avgLatencyMs: number | null;
  counts: {
    verifiedLive: number;
    verifiedMissing: number;
    stuckScheduled: number;
    failed: number;
  };
  recentVerified: TraceItem[];
  issues: TraceItem[];
  allTraces: TraceItem[];
}

function fmtLatency(ms: number | null | undefined): string {
  if (!ms || ms <= 0) return "—";
  const h = Math.floor(ms / 3600_000);
  const m = Math.floor((ms % 3600_000) / 60_000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function contentTypeLabel(type: string | null | undefined): string {
  if (!type) return "Content";
  if (type.includes("short") || type.includes("Short")) return "Short";
  if (type.includes("long") || type.includes("Long")) return "Long-form";
  if (type.includes("vod")) return "VOD clip";
  return type;
}

function IssueRow({ trace }: { trace: TraceItem }) {
  const icon =
    trace.issueType === "missing" ? (
      <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />
    ) : trace.issueType === "stuck" ? (
      <Clock className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
    ) : (
      <AlertTriangle className="h-3.5 w-3.5 text-orange-400 shrink-0 mt-0.5" />
    );

  const label =
    trace.issueType === "missing"
      ? "Missing on YouTube"
      : trace.issueType === "stuck"
      ? `Stuck ${trace.detail?.overdueByMin ? `(${trace.detail.overdueByMin}m overdue)` : ""}`
      : "Upload failed";

  return (
    <div className="flex items-start gap-2 py-2 border-b border-border/40 last:border-0">
      {icon}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-foreground truncate">
            {contentTypeLabel(trace.contentType)}
            {trace.gameName ? ` · ${trace.gameName}` : ""}
          </span>
          {trace.youtubeVideoId && (
            <a
              href={`https://www.youtube.com/watch?v=${trace.youtubeVideoId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-0.5"
              data-testid={`link-issue-yt-${trace.id}`}
            >
              {trace.youtubeVideoId.slice(0, 8)}…
              <ExternalLink className="h-2.5 w-2.5" />
            </a>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
        {trace.detail?.reason && (
          <p className="text-xs text-muted-foreground/70 mt-0.5 line-clamp-1">
            {trace.detail.reason}
          </p>
        )}
      </div>
      <span className="text-xs text-muted-foreground/60 shrink-0">
        {trace.createdAt ? formatDistanceToNow(new Date(trace.createdAt), { addSuffix: true }) : ""}
      </span>
    </div>
  );
}

function VerifiedRow({ trace }: { trace: TraceItem }) {
  return (
    <div
      className="flex items-start gap-2 py-2 border-b border-border/40 last:border-0"
      data-testid={`row-verified-${trace.id}`}
    >
      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-foreground truncate max-w-[220px]">
            {trace.detail?.title
              ? trace.detail.title.length > 40
                ? trace.detail.title.slice(0, 40) + "…"
                : trace.detail.title
              : contentTypeLabel(trace.contentType)}
          </span>
          {trace.detail?.viewCount != null && trace.detail.viewCount > 0 && (
            <span className="text-xs text-muted-foreground">
              {trace.detail.viewCount.toLocaleString()} views
            </span>
          )}
          {trace.youtubeVideoId && (
            <a
              href={`https://www.youtube.com/watch?v=${trace.youtubeVideoId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-0.5 ml-auto shrink-0"
              data-testid={`link-verified-yt-${trace.id}`}
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-muted-foreground">
            {contentTypeLabel(trace.contentType)}
            {trace.gameName ? ` · ${trace.gameName}` : ""}
          </span>
          {trace.durationMs && trace.durationMs > 0 && (
            <span className="text-xs text-muted-foreground/60">
              pipeline latency {fmtLatency(trace.durationMs)}
            </span>
          )}
        </div>
      </div>
      <span className="text-xs text-muted-foreground/60 shrink-0">
        {trace.createdAt
          ? formatDistanceToNow(new Date(trace.createdAt), { addSuffix: true })
          : ""}
      </span>
    </div>
  );
}

export default function PipelineHealth() {
  const { toast } = useToast();

  const { data, isLoading, dataUpdatedAt } = useQuery<PipelineHealthData>({
    queryKey: ["/api/pipeline/health"],
    refetchInterval: 5 * 60_000,
    staleTime: 4 * 60_000,
  });

  const triggerMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/pipeline/health/trigger"),
    onSuccess: () => {
      toast({ title: "Trace cycle started", description: "Results will appear in ~60 seconds." });
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ["/api/pipeline/health"] }), 65_000);
    },
    onError: () => {
      toast({ title: "Failed to trigger trace", variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (!data) return null;

  const { successRate, avgLatencyMs, counts, recentVerified, issues } = data;

  const overallStatus =
    counts.verifiedMissing > 0 || counts.failed > 0
      ? "error"
      : counts.stuckScheduled > 0
      ? "warning"
      : successRate != null && successRate < 80
      ? "warning"
      : "ok";

  const statusColor =
    overallStatus === "error"
      ? "text-red-400"
      : overallStatus === "warning"
      ? "text-amber-400"
      : "text-emerald-400";

  const statusLabel =
    overallStatus === "error"
      ? "Issues detected"
      : overallStatus === "warning"
      ? "Attention needed"
      : "All systems nominal";

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Radio className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Pipeline Tracer</h3>
          <Badge
            variant="outline"
            className={`text-xs px-1.5 py-0.5 ${statusColor} border-current/30`}
            data-testid="badge-pipeline-status"
          >
            {statusLabel}
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => triggerMutation.mutate()}
          disabled={triggerMutation.isPending}
          data-testid="button-trigger-trace"
        >
          {triggerMutation.isPending ? (
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          <span className="ml-1">Verify now</span>
        </Button>
      </div>

      {/* Metric strip */}
      <div className="grid grid-cols-4 gap-2">
        <div
          className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2"
          data-testid="metric-verified-live"
        >
          <div className="text-xs text-muted-foreground mb-0.5">Live</div>
          <div className="text-xl font-bold text-emerald-400">{counts.verifiedLive}</div>
        </div>
        <div
          className="rounded-lg bg-muted/50 border border-border/50 px-3 py-2"
          data-testid="metric-success-rate"
        >
          <div className="text-xs text-muted-foreground mb-0.5">Success rate</div>
          <div className={`text-xl font-bold ${successRate != null && successRate < 90 ? "text-amber-400" : "text-foreground"}`}>
            {successRate != null ? `${successRate}%` : "—"}
          </div>
        </div>
        <div
          className="rounded-lg bg-muted/50 border border-border/50 px-3 py-2"
          data-testid="metric-avg-latency"
        >
          <div className="text-xs text-muted-foreground mb-0.5">Avg latency</div>
          <div className="text-xl font-bold text-foreground">{fmtLatency(avgLatencyMs)}</div>
        </div>
        <div
          className={`rounded-lg px-3 py-2 ${
            counts.verifiedMissing > 0 || counts.failed > 0
              ? "bg-red-500/10 border border-red-500/20"
              : counts.stuckScheduled > 0
              ? "bg-amber-500/10 border border-amber-500/20"
              : "bg-muted/50 border border-border/50"
          }`}
          data-testid="metric-issues"
        >
          <div className="text-xs text-muted-foreground mb-0.5">Issues</div>
          <div className={`text-xl font-bold ${
            counts.verifiedMissing > 0 || counts.failed > 0
              ? "text-red-400"
              : counts.stuckScheduled > 0
              ? "text-amber-400"
              : "text-foreground"
          }`}>
            {counts.verifiedMissing + counts.failed + counts.stuckScheduled}
          </div>
        </div>
      </div>

      {/* Issues panel (shown only when there are issues) */}
      {issues.length > 0 && (
        <div className="rounded-xl border border-border/60 bg-card">
          <div className="px-4 py-2.5 border-b border-border/60 flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
            <span className="text-xs font-semibold text-foreground">Issues ({issues.length})</span>
          </div>
          <div className="px-4 py-1">
            {issues.slice(0, 8).map(trace => (
              <IssueRow key={trace.id} trace={trace} />
            ))}
          </div>
        </div>
      )}

      {/* Recently verified panel */}
      <div className="rounded-xl border border-border/60 bg-card">
        <div className="px-4 py-2.5 border-b border-border/60 flex items-center gap-2">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
          <span className="text-xs font-semibold text-foreground">
            Recently confirmed live ({recentVerified.length})
          </span>
          {dataUpdatedAt > 0 && (
            <span className="ml-auto text-xs text-muted-foreground/60">
              checked {formatDistanceToNow(dataUpdatedAt, { addSuffix: true })}
            </span>
          )}
        </div>
        <div className="px-4 py-1">
          {recentVerified.length === 0 ? (
            <p className="text-xs text-muted-foreground py-3 text-center">
              No verified videos yet — tracer runs every 30 minutes.
            </p>
          ) : (
            recentVerified.map(trace => <VerifiedRow key={trace.id} trace={trace} />)
          )}
        </div>
      </div>

      {/* Last-run timestamp */}
      {dataUpdatedAt > 0 && (
        <p className="text-xs text-muted-foreground/50 text-right">
          Data refreshed {format(dataUpdatedAt, "HH:mm")} · covers last 72h
        </p>
      )}
    </div>
  );
}
