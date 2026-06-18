import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Brain, Zap, AlertTriangle, BookOpen, ExternalLink } from "lucide-react";
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

function healthDot(lastCycleAt: string | null): {
  dot: string; ping: string; label: string
} {
  if (!lastCycleAt) return { dot: "bg-red-400", ping: "bg-red-400", label: "No cycle yet" };
  const diffH = (Date.now() - new Date(lastCycleAt).getTime()) / 3_600_000;
  if (diffH < 6)  return { dot: "bg-emerald-400", ping: "bg-emerald-400", label: "Active" };
  if (diffH < 24) return { dot: "bg-amber-400",   ping: "bg-amber-400",   label: "Idle" };
  return { dot: "bg-red-400", ping: "bg-red-400", label: "Stale" };
}

function ASIStatusStripInner() {
  const { user } = useAuth();

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
  const topInsightText = data.topInsights?.[0]?.principle ?? data.topInsight ?? null;

  function openDigest() {
    window.dispatchEvent(new CustomEvent("open-intelligence-digest"));
    setTimeout(() => {
      document.querySelector('[data-testid="card-intelligence-digest"]')
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 60);
  }

  return (
    <div
      className="rounded-xl border border-purple-500/20 bg-purple-500/5 overflow-hidden"
      data-testid="asi-status-strip"
    >
      <button
        type="button"
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left focus-visible:outline-none hover:bg-purple-500/5 transition-colors"
        onClick={openDigest}
        data-testid="button-asi-strip-toggle"
        title="Open Intelligence Digest"
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="flex items-center gap-1.5 shrink-0">
            {(() => {
              const hd = healthDot(data.lastCycleAt ?? data.lastOrchestration ?? null);
              return (
                <span className="relative flex h-2.5 w-2.5">
                  <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${hd.ping} opacity-50`} />
                  <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${hd.dot}`} />
                </span>
              );
            })()}
            <span className="text-xs font-semibold text-purple-400">ASI Brain</span>
          </div>

          {topInsightText && (
            <span
              className="text-[10px] text-purple-300/80 bg-purple-500/10 border border-purple-500/20 rounded-full px-2 py-0.5 truncate hidden sm:block max-w-xs"
              data-testid="chip-asi-top-insight"
            >
              💡 {topInsightText.length > 60 ? topInsightText.slice(0, 60) + "…" : topInsightText}
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
          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/40" />
        </div>
      </button>
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
