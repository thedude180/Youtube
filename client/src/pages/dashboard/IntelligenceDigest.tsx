import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useState } from "react";
import { Brain, ChevronDown, ChevronUp, TrendingUp, Target, Zap, Lightbulb } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";

interface DigestRecord {
  id: number;
  principle: string;
  evidenceCount: number;
  metadata: {
    generatedAt?: string;
    trendCount?: number;
    gapCount?: number;
    scoredCount?: number;
    insightCount?: number;
    bestDurationBucket?: string;
    bestPostingWindow?: string;
    avgPerformanceScore?: number;
  } | null;
  updatedAt: string;
}

function StatPill({ icon: Icon, value, label, color }: {
  icon: React.ComponentType<{ className?: string }>;
  value: number | string;
  label: string;
  color: string;
}) {
  return (
    <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md bg-background/40 border ${color}`} data-testid={`digest-stat-${label.toLowerCase().replace(/\s/g, "-")}`}>
      <Icon className={`h-3 w-3 ${color.includes("yellow") ? "text-yellow-400" : color.includes("blue") ? "text-blue-400" : color.includes("orange") ? "text-orange-400" : "text-emerald-400"}`} />
      <span className="text-[11px] font-semibold text-foreground">{value}</span>
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </div>
  );
}

function IntelligenceDigestInner() {
  const { user } = useAuth();
  const [expanded, setExpanded] = useState(true);

  const { data: digest, isLoading } = useQuery<DigestRecord | null>({
    queryKey: ["/api/youtube/daily-digest"],
    refetchInterval: 10 * 60_000,
    enabled: !!user,
  });

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border/30 bg-card/20 p-4 space-y-3" data-testid="card-intelligence-digest-loading">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-10 w-full" />
        <div className="flex gap-2">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-6 w-24" />
        </div>
      </div>
    );
  }

  if (!digest) return null;

  const meta = digest.metadata ?? {};
  const generatedAt = meta.generatedAt ? new Date(meta.generatedAt) : null;
  const ageLabel = generatedAt
    ? (() => {
        const diffH = Math.round((Date.now() - generatedAt.getTime()) / 3_600_000);
        if (diffH < 1) return "just now";
        if (diffH === 1) return "1 hour ago";
        if (diffH < 24) return `${diffH}h ago`;
        return `${Math.round(diffH / 24)}d ago`;
      })()
    : null;

  return (
    <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4 space-y-3" data-testid="card-intelligence-digest">
      <button
        type="button"
        className="w-full flex items-center justify-between gap-2 text-left focus-visible:outline-none"
        onClick={() => setExpanded(v => !v)}
        data-testid="button-digest-toggle"
      >
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-purple-400 shrink-0" />
          <span className="text-sm font-semibold text-foreground">Overnight Intelligence</span>
          <span className="text-[10px] text-purple-400/70 font-medium px-1.5 py-0.5 rounded-full border border-purple-500/30 bg-purple-500/10">AI</span>
        </div>
        <div className="flex items-center gap-2">
          {ageLabel && (
            <span className="text-[10px] text-muted-foreground/60 hidden sm:inline">{ageLabel}</span>
          )}
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5 text-muted-foreground/50" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/50" />
          )}
        </div>
      </button>

      {expanded && (
        <>
          <p
            className="text-sm text-muted-foreground leading-relaxed"
            data-testid="text-digest-content"
          >
            {digest.principle}
          </p>

          <div className="flex flex-wrap gap-1.5" data-testid="digest-stats-row">
            {(meta.trendCount ?? 0) > 0 && (
              <StatPill icon={Zap} value={meta.trendCount!} label="trends" color="border-yellow-500/25 bg-yellow-500/5" />
            )}
            {(meta.gapCount ?? 0) > 0 && (
              <StatPill icon={Target} value={meta.gapCount!} label="gaps filled" color="border-blue-500/25 bg-blue-500/5" />
            )}
            {(meta.scoredCount ?? 0) > 0 && (
              <StatPill icon={TrendingUp} value={meta.scoredCount!} label="viral-scored" color="border-orange-500/25 bg-orange-500/5" />
            )}
            {(meta.insightCount ?? 0) > 0 && (
              <StatPill icon={Lightbulb} value={meta.insightCount!} label="insights" color="border-emerald-500/25 bg-emerald-500/5" />
            )}
          </div>

          {(meta.bestDurationBucket || meta.bestPostingWindow) && (
            <div className="flex flex-wrap gap-3 pt-1 border-t border-border/20 text-[10px] text-muted-foreground/60">
              {meta.bestDurationBucket && (
                <span data-testid="text-digest-best-duration">Best duration: <span className="text-foreground/80">{meta.bestDurationBucket}</span></span>
              )}
              {meta.bestPostingWindow && (
                <span data-testid="text-digest-best-window">Best window: <span className="text-foreground/80">{meta.bestPostingWindow}</span></span>
              )}
              {meta.avgPerformanceScore != null && (
                <span data-testid="text-digest-avg-score">Avg score: <span className="text-foreground/80">{meta.avgPerformanceScore}</span></span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function IntelligenceDigest() {
  return (
    <SectionErrorBoundary fallbackTitle="Intelligence digest unavailable">
      <IntelligenceDigestInner />
    </SectionErrorBoundary>
  );
}
