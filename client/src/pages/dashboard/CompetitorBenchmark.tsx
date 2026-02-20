import { useState, useEffect } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useDashboardStats } from "@/hooks/use-dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Minus, BarChart3, Sparkles, Target, Zap, RefreshCw } from "lucide-react";

const CACHE_KEY = "competitorBenchmarkAnalysis";
const CACHE_TTL = 3600000;

interface ComparisonMetric {
  metric: string;
  status: "above" | "below" | "on_par";
  detail: string;
}

interface CompetitorAnalysis {
  nicheAverage: {
    subscribers: number;
    videos: number;
    views: number;
  };
  comparison: ComparisonMetric[];
  insights: string[];
  actions: string[];
}

function loadCached(): CompetitorAnalysis | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.ts && Date.now() - parsed.ts < CACHE_TTL) {
      return parsed.data as CompetitorAnalysis;
    }
    sessionStorage.removeItem(CACHE_KEY);
  } catch {}
  return null;
}

function saveCache(data: CompetitorAnalysis) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() }));
  } catch {}
}

function StatusBadgeDisplay({ status }: { status: "above" | "below" | "on_par" }) {
  if (status === "above") {
    return (
      <Badge variant="secondary" className="no-default-hover-elevate no-default-active-elevate text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30" data-testid="badge-above-average">
        <TrendingUp className="h-3 w-3 mr-1" />
        Above Average
      </Badge>
    );
  }
  if (status === "below") {
    return (
      <Badge variant="secondary" className="no-default-hover-elevate no-default-active-elevate text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-900/30" data-testid="badge-below-average">
        <TrendingDown className="h-3 w-3 mr-1" />
        Below Average
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="no-default-hover-elevate no-default-active-elevate text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30" data-testid="badge-on-par">
      <Minus className="h-3 w-3 mr-1" />
      On Par
    </Badge>
  );
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export default function CompetitorBenchmark() {
  const { data: stats } = useDashboardStats();
  const [analysis, setAnalysis] = useState<CompetitorAnalysis | null>(loadCached);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateAnalysis = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest("POST", "/api/ai/competitor-analysis", {});
      const data = await res.json();
      const normalized: CompetitorAnalysis = {
        nicheAverage: data.nicheAverage ?? { subscribers: 0, videos: 0, views: 0 },
        comparison: Array.isArray(data.comparison) ? data.comparison : [],
        insights: Array.isArray(data.insights) ? data.insights : [],
        actions: Array.isArray(data.actions) ? data.actions : [],
      };
      setAnalysis(normalized);
      saveCache(normalized);
    } catch (e: any) {
      setError(e?.message || "Failed to generate analysis. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const yourSubs = Number(stats?.totalSubscribers) || 0;
  const yourVideos = Number(stats?.totalVideos) || 0;
  const yourViews = Number(stats?.totalViews) || 0;

  const defaultComparisons: ComparisonMetric[] = [
    { metric: "Upload Frequency", status: "on_par", detail: "Comparable upload rate" },
    { metric: "Engagement Rate", status: "on_par", detail: "Average engagement" },
    { metric: "Growth Velocity", status: "on_par", detail: "Standard growth" },
    { metric: "Content Quality Score", status: "on_par", detail: "Average quality" },
  ];

  const comparisons = analysis?.comparison?.length
    ? analysis.comparison.slice(0, 4)
    : defaultComparisons;

  if (loading) {
    return (
      <Card data-testid="card-competitor-benchmark-loading">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Competitive Intelligence
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-16 w-full rounded-md" data-testid="skeleton-stats" />
          <Skeleton className="h-16 w-full rounded-md" data-testid="skeleton-niche" />
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-12 rounded-md" data-testid="skeleton-metric-1" />
            <Skeleton className="h-12 rounded-md" data-testid="skeleton-metric-2" />
            <Skeleton className="h-12 rounded-md" data-testid="skeleton-metric-3" />
            <Skeleton className="h-12 rounded-md" data-testid="skeleton-metric-4" />
          </div>
          <Skeleton className="h-24 w-full rounded-md" data-testid="skeleton-insights" />
        </CardContent>
      </Card>
    );
  }

  if (!analysis) {
    return (
      <Card data-testid="card-competitor-benchmark-empty">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Competitive Intelligence
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center space-y-3" data-testid="empty-state-competitor">
            <BarChart3 className="h-10 w-10 text-muted-foreground" data-testid="icon-empty-chart" />
            <p className="text-sm text-muted-foreground" data-testid="text-empty-message">
              Click Generate to see how you compare
            </p>
            {error && (
              <p className="text-sm text-red-500 dark:text-red-400" data-testid="text-error-message">{error}</p>
            )}
            <Button onClick={generateAnalysis} data-testid="button-generate-analysis">
              <Sparkles className="h-4 w-4 mr-2" />
              Generate Analysis
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-competitor-benchmark">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <TrendingUp className="h-4 w-4" />
          Competitive Intelligence
        </CardTitle>
        <Button variant="ghost" size="icon" onClick={generateAnalysis} data-testid="button-refresh-analysis">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <p className="text-sm text-red-500 dark:text-red-400" data-testid="text-error-message">{error}</p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="section-channel-stats">
          <div className="rounded-md border p-3 space-y-1" data-testid="card-your-stats">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Your Channel</p>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm" data-testid="text-your-subs">{formatNumber(yourSubs)} subs</span>
              <span className="text-sm" data-testid="text-your-videos">{formatNumber(yourVideos)} videos</span>
              <span className="text-sm" data-testid="text-your-views">{formatNumber(yourViews)} views</span>
            </div>
          </div>
          <div className="rounded-md border p-3 space-y-1" data-testid="card-niche-average">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Niche Average</p>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm" data-testid="text-niche-subs">{formatNumber(analysis.nicheAverage.subscribers)} subs</span>
              <span className="text-sm" data-testid="text-niche-videos">{formatNumber(analysis.nicheAverage.videos)} videos</span>
              <span className="text-sm" data-testid="text-niche-views">{formatNumber(analysis.nicheAverage.views)} views</span>
            </div>
          </div>
        </div>

        <div data-testid="section-comparisons">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Comparison</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {comparisons.map((c, i) => (
              <div key={i} className="flex items-center justify-between gap-2 rounded-md border p-3" data-testid={`card-comparison-${i}`}>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate" data-testid={`text-metric-name-${i}`}>{c.metric}</p>
                  <p className="text-xs text-muted-foreground truncate" data-testid={`text-metric-detail-${i}`}>{c.detail}</p>
                </div>
                <StatusBadgeDisplay status={c.status} />
              </div>
            ))}
          </div>
        </div>

        {analysis.insights.length > 0 && (
          <div data-testid="section-insights">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
              <Target className="h-3 w-3" />
              Key Insights
            </p>
            <ul className="space-y-1.5">
              {analysis.insights.map((insight, i) => (
                <li key={i} className="text-sm text-muted-foreground flex items-start gap-2" data-testid={`text-insight-${i}`}>
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-muted-foreground/50 shrink-0" />
                  {insight}
                </li>
              ))}
            </ul>
          </div>
        )}

        {analysis.actions.length > 0 && (
          <div data-testid="section-actions">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
              <Zap className="h-3 w-3" />
              Recommended Actions
            </p>
            <ul className="space-y-1.5">
              {analysis.actions.map((action, i) => (
                <li key={i} className="text-sm flex items-start gap-2" data-testid={`text-action-${i}`}>
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary/50 shrink-0" />
                  {action}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
