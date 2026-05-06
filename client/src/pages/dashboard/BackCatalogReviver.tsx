import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Archive,
  RefreshCw,
  TrendingUp,
  Video,
  Zap,
  Clock,
  Play,
  Star,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface BackCatalogStatus {
  totalVideos: number;
  totalVods: number;
  over60Min: number;
  alreadyMined: number;
  notYetMined: number;
  shortsQueuedFromOld: number;
  longFormQueuedFromOld: number;
  metadataUpdatesQueued: number;
  monetizationWarnings: number;
  estimatedBacklogDays: number;
  lastCycleAt: string | null;
  topOpportunities: Array<{
    youtubeVideoId: string;
    title: string;
    totalRevivalScore: number;
    metadataOpportunityScore: number;
    shortsOpportunityScore: number;
    longFormOpportunityScore: number;
    monetizationOpportunityScore: number;
    durationSec: number | null;
    viewCount: number | null;
    isVod: boolean | null;
    isOver60Min: boolean | null;
    minedForShorts: boolean | null;
    minedForLongForm: boolean | null;
  }>;
}

function fmtDuration(sec: number | null | undefined): string {
  if (!sec) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function fmtNum(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function RevivalScoreBar({ score, label }: { score: number; label: string }) {
  const color =
    score >= 70 ? "bg-emerald-400" :
    score >= 40 ? "bg-amber-400" :
    "bg-blue-400";

  return (
    <div className="flex items-center gap-2 text-xs" data-testid={`score-bar-${label}`}>
      <span className="w-12 text-muted-foreground shrink-0">{label}</span>
      <div className="flex-1 bg-muted/30 rounded-full h-1.5 overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${score}%` }} />
      </div>
      <span className="w-6 text-right text-muted-foreground font-mono">{score}</span>
    </div>
  );
}

export default function BackCatalogReviver() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: status, isLoading } = useQuery<BackCatalogStatus>({
    queryKey: ["/api/youtube/back-catalog/status"],
    refetchInterval: 60_000,
  });

  const { data: opportunities, isLoading: opLoading } = useQuery<BackCatalogStatus["topOpportunities"]>({
    queryKey: ["/api/youtube/back-catalog/opportunities"],
    refetchInterval: 120_000,
  });

  const importMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/youtube/back-catalog/import"),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["/api/youtube/back-catalog/status"] });
      qc.invalidateQueries({ queryKey: ["/api/youtube/back-catalog/opportunities"] });
      toast({ title: "Import complete", description: `${data.imported ?? 0} new, ${data.updated ?? 0} updated` });
    },
    onError: () => toast({ title: "Import failed", variant: "destructive" }),
  });

  const cycleMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/youtube/back-catalog/run-cycle"),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["/api/youtube/back-catalog/status"] });
      qc.invalidateQueries({ queryKey: ["/api/youtube/back-catalog/opportunities"] });
      if (data.skippedReason) {
        toast({ title: "Cycle skipped", description: data.skippedReason });
      } else {
        toast({
          title: "Revival cycle complete",
          description: `${data.queueResult?.shortsQueued ?? 0} Shorts, ${data.queueResult?.longFormQueued ?? 0} long-form, ${data.queueResult?.metadataQueued ?? 0} metadata queued`,
        });
      }
    },
    onError: () => toast({ title: "Cycle failed", variant: "destructive" }),
  });

  const queueMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/youtube/back-catalog/queue"),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["/api/youtube/back-catalog/status"] });
      toast({
        title: "Work queued",
        description: `${data.shortsQueued ?? 0} Shorts, ${data.longFormQueued ?? 0} long-form, ${data.metadataQueued ?? 0} metadata`,
      });
    },
    onError: () => toast({ title: "Queue failed", variant: "destructive" }),
  });

  const anyPending = importMut.isPending || cycleMut.isPending || queueMut.isPending;

  const minedPct = status?.totalVideos
    ? Math.round((status.alreadyMined / status.totalVideos) * 100)
    : 0;

  return (
    <div className="rounded-xl border border-border/30 bg-card/20 p-4 space-y-4" data-testid="back-catalog-reviver">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Archive className="h-4 w-4 text-amber-400" />
          <h2 className="text-sm font-semibold text-foreground" data-testid="text-back-catalog-title">
            Back Catalog Revival
          </h2>
          {status?.monetizationWarnings ? (
            <Badge variant="outline" className="text-xs border-amber-500/40 text-amber-400">
              {status.monetizationWarnings} warning{status.monetizationWarnings !== 1 ? "s" : ""}
            </Badge>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs gap-1"
            onClick={() => importMut.mutate()}
            disabled={anyPending}
            data-testid="button-back-catalog-import"
          >
            {importMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Sync Catalog
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs gap-1"
            onClick={() => queueMut.mutate()}
            disabled={anyPending}
            data-testid="button-back-catalog-queue"
          >
            {queueMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
            Queue Work
          </Button>
          <Button
            size="sm"
            className="h-7 px-3 text-xs gap-1 bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30"
            onClick={() => cycleMut.mutate()}
            disabled={anyPending}
            data-testid="button-back-catalog-run-cycle"
          >
            {cycleMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
            Run Cycle
          </Button>
        </div>
      </div>

      {/* Stats grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-lg border border-border/20 bg-muted/10 p-3 space-y-1" data-testid="stat-total-videos">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Video className="h-3 w-3" />
              <span className="text-xs">Catalog Size</span>
            </div>
            <p className="text-lg font-bold text-foreground">{fmtNum(status?.totalVideos)}</p>
            <p className="text-xs text-muted-foreground">{fmtNum(status?.totalVods)} VODs · {fmtNum(status?.over60Min)} over 60 min</p>
          </div>

          <div className="rounded-lg border border-border/20 bg-muted/10 p-3 space-y-1" data-testid="stat-mining-progress">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <TrendingUp className="h-3 w-3" />
              <span className="text-xs">Mining Progress</span>
            </div>
            <p className="text-lg font-bold text-foreground">{minedPct}%</p>
            <Progress value={minedPct} className="h-1" />
            <p className="text-xs text-muted-foreground">{fmtNum(status?.notYetMined)} left to mine</p>
          </div>

          <div className="rounded-lg border border-border/20 bg-muted/10 p-3 space-y-1" data-testid="stat-content-queued">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Zap className="h-3 w-3" />
              <span className="text-xs">Queued from Old</span>
            </div>
            <p className="text-lg font-bold text-foreground">{fmtNum((status?.shortsQueuedFromOld ?? 0) + (status?.longFormQueuedFromOld ?? 0))}</p>
            <p className="text-xs text-muted-foreground">{fmtNum(status?.shortsQueuedFromOld)} Shorts · {fmtNum(status?.longFormQueuedFromOld)} long-form</p>
          </div>

          <div className="rounded-lg border border-border/20 bg-muted/10 p-3 space-y-1" data-testid="stat-backlog-days">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span className="text-xs">Estimated Backlog</span>
            </div>
            <p className="text-lg font-bold text-foreground">
              {status?.estimatedBacklogDays != null ? `${status.estimatedBacklogDays}d` : "—"}
            </p>
            <p className="text-xs text-muted-foreground">{fmtNum(status?.metadataUpdatesQueued)} metadata updates done</p>
          </div>
        </div>
      )}

      {/* Last cycle status */}
      {status?.lastCycleAt && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground" data-testid="text-last-cycle">
          <CheckCircle2 className="h-3 w-3 text-emerald-400" />
          <span>Last cycle: {new Date(status.lastCycleAt).toLocaleString()}</span>
        </div>
      )}

      {/* Top opportunities */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Star className="h-3.5 w-3.5 text-amber-400" />
          <span className="text-xs font-semibold text-foreground">Top Revival Opportunities</span>
        </div>

        {opLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
          </div>
        ) : !opportunities?.length ? (
          <div className="text-xs text-muted-foreground py-4 text-center" data-testid="text-no-opportunities">
            {(status?.totalVideos ?? 0) === 0
              ? "No videos in catalog yet — click Sync Catalog to import your YouTube videos"
              : "All videos scored — run a cycle to queue revival work"
            }
          </div>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {opportunities.slice(0, 10).map((v, i) => (
              <div
                key={v.youtubeVideoId}
                className="rounded-lg border border-border/20 bg-muted/10 p-3"
                data-testid={`card-opportunity-${v.youtubeVideoId}`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <a
                      href={`https://youtube.com/watch?v=${v.youtubeVideoId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium text-foreground hover:text-primary truncate block"
                      data-testid={`link-opportunity-${i}`}
                    >
                      {v.title}
                    </a>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">{fmtDuration(v.durationSec)}</span>
                      {v.isVod && <Badge variant="outline" className="text-xs h-4 px-1 border-blue-500/40 text-blue-400">VOD</Badge>}
                      {v.isOver60Min && <Badge variant="outline" className="text-xs h-4 px-1 border-purple-500/40 text-purple-400">60+ min</Badge>}
                      {!v.minedForShorts && <Badge variant="outline" className="text-xs h-4 px-1 border-amber-500/40 text-amber-400">Shorts ready</Badge>}
                      {!v.minedForLongForm && (v.durationSec ?? 0) >= 480 && <Badge variant="outline" className="text-xs h-4 px-1 border-emerald-500/40 text-emerald-400">LF ready</Badge>}
                      <span className="text-xs text-muted-foreground">{fmtNum(v.viewCount)} views</span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="text-sm font-bold text-amber-400" data-testid={`text-revival-score-${v.youtubeVideoId}`}>
                      {v.totalRevivalScore}
                    </span>
                    <p className="text-xs text-muted-foreground">score</p>
                  </div>
                </div>
                <div className="space-y-1">
                  <RevivalScoreBar score={v.shortsOpportunityScore} label="Shorts" />
                  <RevivalScoreBar score={v.longFormOpportunityScore} label="LF" />
                  <RevivalScoreBar score={v.metadataOpportunityScore} label="Meta" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Monetization warnings */}
      {(status?.monetizationWarnings ?? 0) > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3" data-testid="alert-monetization-warnings">
          <AlertCircle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">
            <span className="text-amber-400 font-medium">{status?.monetizationWarnings} videos</span> may need metadata cleanup before they're ad-friendly candidates.
            Run a cycle to automatically improve them.
          </p>
        </div>
      )}
    </div>
  );
}
