import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Brain, ChevronDown, ChevronUp, Zap, Target, MessageSquare, BookOpen } from "lucide-react";

interface IntelligenceItem {
  principle: string;
  confidence: number;
  category: string;
  engines: string[];
  contextRelevance: number;
}

interface IntelligenceResponse {
  context: string;
  intelligence: IntelligenceItem[];
}

function groupBySection(items: IntelligenceItem[]) {
  const titleDirection = items.filter(i =>
    i.category === "strategic_directive" || i.category === "content_pattern"
  ).slice(0, 1);

  const talkingPoints = items.filter(i =>
    i.category === "stream-learning" || i.category === "audience-intelligence"
  ).slice(0, 3);

  const bf6Rationale = items.filter(i =>
    i.category !== "strategic_directive" &&
    i.category !== "content_pattern" &&
    i.category !== "stream-learning" &&
    i.category !== "audience-intelligence"
  ).slice(0, 2);

  const thumbnailConcept = items.find(i =>
    i.category === "content_pattern" && i.contextRelevance > 1
  ) ?? items.find(i => i.category === "content_pattern");

  return { titleDirection, talkingPoints, bf6Rationale, thumbnailConcept };
}

export default function PreStreamBriefCard() {
  const [expanded, setExpanded] = useState(false);

  const { data, isLoading } = useQuery<IntelligenceResponse>({
    queryKey: ["/api/asi/intelligence", "stream"],
    queryFn: async () => {
      const res = await fetch("/api/asi/intelligence?context=stream");
      if (!res.ok) throw new Error("ASI intelligence unavailable");
      return res.json();
    },
    staleTime: 30 * 60_000,
    refetchInterval: 30 * 60_000,
    retry: 1,
  });

  if (isLoading) {
    return (
      <div className="rounded-xl border border-purple-500/15 bg-purple-500/5 p-4" data-testid="prestream-brief-loading">
        <Skeleton className="h-4 w-48 mb-3" />
        <Skeleton className="h-3 w-full mb-1.5" />
        <Skeleton className="h-3 w-3/4" />
      </div>
    );
  }

  const items = data?.intelligence ?? [];
  const isEmpty = items.length === 0;

  const { titleDirection, talkingPoints, bf6Rationale, thumbnailConcept } = groupBySection(items);

  return (
    <div
      className="rounded-xl border border-purple-500/20 bg-purple-500/5 overflow-hidden"
      data-testid="prestream-brief-card"
    >
      <button
        type="button"
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left focus-visible:outline-none hover:bg-purple-500/5 transition-colors"
        onClick={() => setExpanded(v => !v)}
        data-testid="button-prestream-brief-toggle"
      >
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-purple-400 shrink-0" />
          <span className="text-sm font-semibold text-foreground">Pre-Stream Intelligence Brief</span>
          <span className="text-[9px] text-purple-400/70 font-medium px-1.5 py-0.5 rounded-full border border-purple-500/30 bg-purple-500/10">
            ASI · 30min
          </span>
        </div>
        <div className="flex items-center gap-2">
          {!isEmpty && (
            <Badge variant="outline" className="text-[9px] border-purple-500/25 text-purple-400/60">
              {items.length} insights
            </Badge>
          )}
          {expanded
            ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground/40" />
            : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/40" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-purple-500/15 px-4 pb-4 pt-3 space-y-3" data-testid="prestream-brief-expanded">
          {isEmpty ? (
            <p className="text-[11px] text-muted-foreground/60 italic text-center py-2">
              Brain learning — check back after first cycle
            </p>
          ) : (
            <>
              {titleDirection.length > 0 && (
                <div className="space-y-1" data-testid="prestream-title-direction">
                  <div className="flex items-center gap-1.5">
                    <Target className="h-3 w-3 text-purple-400" />
                    <span className="text-[10px] font-semibold text-purple-400 uppercase tracking-wide">Title Direction</span>
                  </div>
                  {titleDirection.map((item, i) => (
                    <p key={i} className="text-xs text-foreground/80 leading-snug line-clamp-2 pl-4">
                      {item.principle}
                    </p>
                  ))}
                </div>
              )}

              {thumbnailConcept && (
                <div className="space-y-1" data-testid="prestream-thumbnail-concept">
                  <div className="flex items-center gap-1.5">
                    <Zap className="h-3 w-3 text-amber-400" />
                    <span className="text-[10px] font-semibold text-amber-400 uppercase tracking-wide">Thumbnail Concept</span>
                  </div>
                  <p className="text-xs text-foreground/80 leading-snug line-clamp-2 pl-4">
                    {thumbnailConcept.principle}
                  </p>
                </div>
              )}

              {talkingPoints.length > 0 && (
                <div className="space-y-1.5" data-testid="prestream-talking-points">
                  <div className="flex items-center gap-1.5">
                    <MessageSquare className="h-3 w-3 text-blue-400" />
                    <span className="text-[10px] font-semibold text-blue-400 uppercase tracking-wide">Talking Points</span>
                  </div>
                  {talkingPoints.map((item, i) => (
                    <div key={i} className="flex items-start gap-2 pl-4">
                      <span className="text-[10px] text-blue-400/60 shrink-0 mt-0.5 font-bold">{i + 1}.</span>
                      <p className="text-xs text-foreground/80 leading-snug line-clamp-2">{item.principle}</p>
                    </div>
                  ))}
                </div>
              )}

              {bf6Rationale.length > 0 && (
                <div className="space-y-1" data-testid="prestream-bf6-rationale">
                  <div className="flex items-center gap-1.5">
                    <BookOpen className="h-3 w-3 text-emerald-400" />
                    <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wide">BF6 Rationale</span>
                  </div>
                  {bf6Rationale.map((item, i) => (
                    <p key={i} className="text-xs text-muted-foreground/70 leading-snug line-clamp-2 pl-4">
                      {item.principle}
                    </p>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
