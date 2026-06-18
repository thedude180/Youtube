import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useState } from "react";
import { Brain, ChevronDown, ChevronUp, Zap, AlertTriangle, BookOpen, Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";

interface ASIStatus {
  lastCycleAt: string | null;
  strategicDirective: string | null;
  topInsights: Array<{ principle: string; confidence: number; category: string }>;
  negativePatternCount: number;
  totalKnowledgeItems: number;
  orchestratorRunning: boolean;
  lastOrchestration: string | null;
  topInsight: string | null;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffH = Math.round(diffMs / 3_600_000);
  if (diffH < 1) return "just now";
  if (diffH === 1) return "1h ago";
  if (diffH < 24) return `${diffH}h ago`;
  return `${Math.round(diffH / 24)}d ago`;
}

function ASIStatusStripInner() {
  const { user } = useAuth();
  const [expanded, setExpanded] = useState(false);

  const { data, isLoading } = useQuery<ASIStatus>({
    queryKey: ["/api/asi/status"],
    refetchInterval: 10 * 60_000,
    staleTime: 5 * 60_000,
    enabled: !!user,
  });

  if (isLoading) {
    return (
      <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-3 flex items-center gap-3" data-testid="asi-strip-loading">
        <Brain className="h-4 w-4 text-purple-400 shrink-0 animate-pulse" />
        <Skeleton className="h-3 w-60" />
      </div>
    );
  }

  if (!data) return null;

  const knowledgeItems = data.totalKnowledgeItems ?? 0;
  const negPatterns   = data.negativePatternCount ?? 0;
  const topInsights   = data.topInsights ?? [];

  return (
    <div
      className="rounded-xl border border-purple-500/20 bg-purple-500/5 overflow-hidden"
      data-testid="asi-status-strip"
    >
      <button
        type="button"
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left focus-visible:outline-none hover:bg-purple-500/5 transition-colors"
        onClick={() => setExpanded(v => !v)}
        data-testid="button-asi-strip-toggle"
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-purple-400 opacity-50" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-purple-400" />
            </span>
            <span className="text-xs font-semibold text-purple-400">ASI Brain</span>
          </div>

          {data.strategicDirective && (
            <span className="text-xs text-muted-foreground truncate hidden sm:block" data-testid="text-asi-directive">
              {data.strategicDirective.length > 90
                ? data.strategicDirective.slice(0, 90) + "…"
                : data.strategicDirective}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="outline" className="text-[9px] border-purple-500/25 text-purple-400/80 hidden sm:flex items-center gap-1">
            <BookOpen className="h-2.5 w-2.5" />
            {knowledgeItems} known
          </Badge>
          {negPatterns > 0 && (
            <Badge variant="outline" className="text-[9px] border-red-500/25 text-red-400/80 hidden sm:flex items-center gap-1">
              <AlertTriangle className="h-2.5 w-2.5" />
              {negPatterns} avoid
            </Badge>
          )}
          <span className="text-[10px] text-muted-foreground/50 hidden md:block">
            {timeAgo(data.lastCycleAt ?? data.lastOrchestration)}
          </span>
          {expanded
            ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground/40" />
            : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/40" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-purple-500/15 px-4 py-3 space-y-3" data-testid="asi-strip-expanded">
          {data.strategicDirective && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <Zap className="h-3 w-3 text-purple-400" />
                <span className="text-[11px] font-semibold text-purple-400 uppercase tracking-wide">Strategic Directive</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed" data-testid="text-asi-directive-full">
                {data.strategicDirective}
              </p>
            </div>
          )}

          {topInsights.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Activity className="h-3 w-3 text-purple-400" />
                <span className="text-[11px] font-semibold text-purple-400 uppercase tracking-wide">Top Insights</span>
              </div>
              {topInsights.map((ins, i) => (
                <div key={i} className="flex items-start gap-2 text-xs" data-testid={`asi-top-insight-${i}`}>
                  <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-purple-400/60 mt-1" />
                  <span className="text-muted-foreground leading-snug">{ins.principle}</span>
                  <span className="text-[9px] text-purple-400/60 shrink-0 tabular-nums ml-auto">{ins.confidence}%</span>
                </div>
              ))}
            </div>
          )}

          {data.topInsight && (
            <div className="rounded-md bg-purple-500/10 border border-purple-500/20 p-2.5">
              <p className="text-[11px] text-purple-300/80 leading-relaxed" data-testid="text-asi-top-insight">
                💡 {data.topInsight}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ASIStatusStrip() {
  return (
    <SectionErrorBoundary fallbackTitle="ASI Brain status unavailable">
      <ASIStatusStripInner />
    </SectionErrorBoundary>
  );
}
