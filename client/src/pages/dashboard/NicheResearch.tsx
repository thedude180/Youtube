import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import {
  Search, RefreshCw, ExternalLink, Flame, Clock, Eye,
  Lightbulb, Target, TrendingUp, Zap, BarChart3,
} from "lucide-react";

interface VideoSample {
  id: number;
  videoId: string;
  title: string;
  channelName: string | null;
  viewCount: number | null;
  durationSec: number | null;
  isShort: boolean | null;
  url: string;
  uploadDate: string | null;
  createdAt: string | null;
}

interface NicheInsight {
  id: number;
  insightType: string;
  title: string;
  body: string;
  priority: string | null;
  sampleCount: number | null;
  createdAt: string | null;
}

interface NicheData {
  samples: VideoSample[];
  insights: NicheInsight[];
  sampleCount: number;
  lastSampleAt: string | null;
  isRunning: boolean;
}

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function fmtDur(sec: number | null | undefined): string {
  if (sec == null) return "—";
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s > 0 ? `${m}m${s}s` : `${m}m`;
}

const INSIGHT_TYPE_META: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  title_pattern:    { label: "Title Pattern",   icon: BarChart3,  color: "text-violet-400"  },
  duration_insight: { label: "Duration",        icon: Clock,      color: "text-blue-400"    },
  content_strategy: { label: "Strategy",        icon: Target,     color: "text-emerald-400" },
  opportunity:      { label: "Opportunity",     icon: Zap,        color: "text-amber-400"   },
};

function PriorityDot({ priority }: { priority: string | null }) {
  const cls = priority === "high"
    ? "bg-red-400"
    : priority === "medium"
    ? "bg-amber-400"
    : "bg-emerald-400";
  return <span className={`h-1.5 w-1.5 rounded-full shrink-0 mt-1.5 ${cls}`} />;
}

export default function NicheResearch() {
  const { toast } = useToast();

  const { data, isLoading } = useQuery<NicheData>({
    queryKey: ["/api/niche-research/data"],
    refetchInterval: 60_000,
  });

  const runMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/niche-research/run", {}),
    onSuccess: () => {
      toast({ title: "Niche scan triggered", description: "Results will appear in 3-5 minutes." });
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ["/api/niche-research/data"] }), 5_000);
    },
  });

  const hasData = (data?.samples?.length ?? 0) > 0 || (data?.insights?.length ?? 0) > 0;

  const titlePatterns = data?.insights?.filter(i => i.insightType === "title_pattern") ?? [];
  const durationInsights = data?.insights?.filter(i => i.insightType === "duration_insight") ?? [];
  const opportunities = data?.insights?.filter(i => i.insightType === "opportunity") ?? [];
  const strategies = data?.insights?.filter(i => i.insightType === "content_strategy") ?? [];
  const topSamples = data?.samples?.slice(0, 8) ?? [];

  return (
    <Card data-testid="card-niche-research">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Search className="h-4 w-4 text-violet-400" />
          BF6 Niche Research
        </CardTitle>
        <div className="flex items-center gap-2">
          {data?.lastSampleAt && (
            <span className="text-[10px] text-muted-foreground hidden sm:block" data-testid="text-last-scanned">
              {formatDistanceToNow(new Date(data.lastSampleAt), { addSuffix: true })}
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => runMutation.mutate()}
            disabled={runMutation.isPending || data?.isRunning}
            data-testid="button-run-niche-scan"
            title="Run new scan"
          >
            <RefreshCw className={`h-4 w-4 ${(runMutation.isPending || data?.isRunning) ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {isLoading && (
          <div className="space-y-2" data-testid="skeleton-niche-research">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-20 w-full rounded-md" />
          </div>
        )}

        {!isLoading && !hasData && (
          <div className="flex flex-col items-center justify-center py-8 text-center space-y-3" data-testid="empty-niche-research">
            <Search className="h-9 w-9 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">No niche data yet. Run a scan to see what's working in BF6.</p>
            <Button onClick={() => runMutation.mutate()} disabled={runMutation.isPending} data-testid="button-start-first-scan">
              <Search className="h-4 w-4 mr-2" />
              Scan Now
            </Button>
          </div>
        )}

        {!isLoading && hasData && (
          <>
            {/* Summary strip */}
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground" data-testid="section-niche-summary">
              <span className="flex items-center gap-1">
                <Eye className="h-3 w-3" />
                {data!.sampleCount} videos sampled
              </span>
              <span className="flex items-center gap-1">
                <Lightbulb className="h-3 w-3" />
                {data!.insights.length} insights
              </span>
              {data?.isRunning && (
                <Badge variant="secondary" className="text-[10px] py-0 px-1.5 text-amber-600 bg-amber-100 dark:bg-amber-900/30" data-testid="badge-scan-running">
                  Scanning…
                </Badge>
              )}
            </div>

            {/* Opportunities — show first, highest value */}
            {opportunities.length > 0 && (
              <div data-testid="section-opportunities">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Zap className="h-3 w-3 text-amber-400" />
                  Top Opportunities
                </p>
                <ul className="space-y-1.5">
                  {opportunities.map((ins, i) => (
                    <li key={ins.id} className="flex items-start gap-2 text-sm" data-testid={`text-opportunity-${i}`}>
                      <PriorityDot priority={ins.priority} />
                      {ins.title}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Title patterns */}
            {titlePatterns.length > 0 && (
              <div data-testid="section-title-patterns">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                  <TrendingUp className="h-3 w-3 text-violet-400" />
                  Title Patterns
                </p>
                <ul className="space-y-2">
                  {titlePatterns.map((ins, i) => (
                    <li key={ins.id} className="rounded-md border border-border/30 px-3 py-2" data-testid={`card-title-pattern-${i}`}>
                      <p className="text-sm font-medium" data-testid={`text-pattern-title-${i}`}>{ins.title}</p>
                      {ins.body && (
                        <p className="text-xs text-muted-foreground mt-0.5" data-testid={`text-pattern-body-${i}`}>{ins.body}</p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Duration insights */}
            {durationInsights.length > 0 && (
              <div data-testid="section-duration-insights">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Clock className="h-3 w-3 text-blue-400" />
                  Duration Sweet Spots
                </p>
                <ul className="space-y-2">
                  {durationInsights.map((ins, i) => (
                    <li key={ins.id} className="rounded-md border border-border/30 px-3 py-2" data-testid={`card-duration-${i}`}>
                      <p className="text-sm font-medium" data-testid={`text-duration-title-${i}`}>{ins.title}</p>
                      {ins.body && (
                        <p className="text-xs text-muted-foreground mt-0.5" data-testid={`text-duration-body-${i}`}>{ins.body}</p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Content strategies */}
            {strategies.length > 0 && (
              <div data-testid="section-strategies">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Target className="h-3 w-3 text-emerald-400" />
                  Content Strategies
                </p>
                <ul className="space-y-1.5">
                  {strategies.map((ins, i) => (
                    <li key={ins.id} className="flex items-start gap-2 text-sm" data-testid={`text-strategy-${i}`}>
                      <PriorityDot priority={ins.priority} />
                      <span>
                        <span className="font-medium">{ins.title}</span>
                        {ins.body && (
                          <span className="text-muted-foreground"> — {ins.body}</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Top performing videos in niche */}
            {topSamples.length > 0 && (
              <div data-testid="section-top-niche-videos">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Flame className="h-3 w-3 text-red-400" />
                  Top Performing Similar Videos
                </p>
                <ul className="space-y-1.5">
                  {topSamples.map((v, i) => (
                    <li key={v.id} className="flex items-start gap-2 text-[12px]" data-testid={`row-niche-video-${v.videoId}`}>
                      <span className="text-muted-foreground/50 w-4 shrink-0 text-right font-mono mt-0.5">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <a
                          href={v.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-foreground/90 hover:text-foreground line-clamp-1 flex items-center gap-1"
                          data-testid={`link-niche-video-${v.videoId}`}
                        >
                          <span className="truncate">{v.title}</span>
                          <ExternalLink className="h-2.5 w-2.5 shrink-0 text-muted-foreground/50" />
                        </a>
                        <div className="flex items-center gap-2 text-muted-foreground mt-0.5">
                          <span className="flex items-center gap-0.5" data-testid={`text-views-${v.videoId}`}>
                            <Eye className="h-2.5 w-2.5" />
                            {fmt(v.viewCount)}
                          </span>
                          <span className="flex items-center gap-0.5" data-testid={`text-dur-${v.videoId}`}>
                            <Clock className="h-2.5 w-2.5" />
                            {fmtDur(v.durationSec)}
                          </span>
                          {v.isShort && (
                            <Badge variant="secondary" className="text-[9px] py-0 px-1 h-3.5 text-red-600 bg-red-100 dark:bg-red-900/30" data-testid={`badge-short-${v.videoId}`}>
                              Short
                            </Badge>
                          )}
                          {v.channelName && (
                            <span className="truncate text-muted-foreground/60 text-[10px]" data-testid={`text-channel-${v.videoId}`}>
                              {v.channelName}
                            </span>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
