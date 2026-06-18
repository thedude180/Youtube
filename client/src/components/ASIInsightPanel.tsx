import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Brain, ChevronDown, ChevronUp, Sparkles, TrendingUp, AlertTriangle, Target, Zap } from "lucide-react";

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

const CATEGORY_STYLES: Record<string, { label: string; color: string; icon: typeof Brain }> = {
  strategic_directive: { label: "Strategy",    color: "bg-purple-500/15 text-purple-400 border-purple-500/25", icon: Target },
  content_pattern:    { label: "Content",      color: "bg-blue-500/15 text-blue-400 border-blue-500/25",   icon: Sparkles },
  performance:        { label: "Performance",  color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25", icon: TrendingUp },
  negative_pattern:   { label: "Avoid",        color: "bg-red-500/15 text-red-400 border-red-500/25",      icon: AlertTriangle },
  prediction_calibration: { label: "Prediction", color: "bg-amber-500/15 text-amber-400 border-amber-500/25", icon: Target },
  revenue_feedback:   { label: "Revenue",      color: "bg-yellow-500/15 text-yellow-400 border-yellow-500/25", icon: Zap },
  "stream-learning":  { label: "Stream",       color: "bg-cyan-500/15 text-cyan-400 border-cyan-500/25",   icon: Brain },
  "audience-intelligence": { label: "Audience", color: "bg-pink-500/15 text-pink-400 border-pink-500/25", icon: Brain },
  system_lesson:      { label: "System",       color: "bg-slate-500/15 text-slate-400 border-slate-500/25", icon: Brain },
  "content-grinder":  { label: "Grinder",      color: "bg-orange-500/15 text-orange-400 border-orange-500/25", icon: Sparkles },
  "prompt-evolution": { label: "Prompts",      color: "bg-violet-500/15 text-violet-400 border-violet-500/25", icon: Sparkles },
  self_healing:       { label: "Self-Heal",    color: "bg-teal-500/15 text-teal-400 border-teal-500/25",   icon: Brain },
  general:            { label: "Insight",      color: "bg-muted/40 text-muted-foreground border-border/40", icon: Brain },
};

function getCategoryStyle(cat: string) {
  return CATEGORY_STYLES[cat] ?? CATEGORY_STYLES.general;
}

function ConfidenceDot({ value }: { value: number }) {
  const pct = Math.min(100, Math.max(0, value));
  const color = pct >= 80 ? "bg-emerald-400" : pct >= 55 ? "bg-amber-400" : "bg-red-400";
  return (
    <div className="flex items-center gap-1 shrink-0" title={`Confidence: ${pct}%`}>
      <div className="w-12 h-1 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[9px] text-muted-foreground tabular-nums w-6">{pct}%</span>
    </div>
  );
}

interface Props {
  context: string;
  title?: string;
  defaultExpanded?: boolean;
  maxItems?: number;
  compact?: boolean;
}

export default function ASIInsightPanel({
  context,
  title = "Brain Intelligence",
  defaultExpanded = true,
  maxItems = 4,
  compact = false,
}: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const { data, isLoading } = useQuery<IntelligenceResponse>({
    queryKey: ["/api/asi/intelligence", context],
    queryFn: async () => {
      const res = await fetch(`/api/asi/intelligence?context=${encodeURIComponent(context)}`);
      if (!res.ok) throw new Error("ASI intelligence unavailable");
      return res.json();
    },
    staleTime: 5 * 60_000,
    retry: 1,
  });

  if (isLoading) {
    return (
      <Card className="card-empire border-purple-500/20 bg-purple-500/5" data-testid={`asi-panel-loading-${context}`}>
        <CardHeader className="pb-2">
          <Skeleton className="h-4 w-40" />
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  const items = (data?.intelligence ?? []).slice(0, maxItems);

  return (
    <Card
      className="card-empire border-purple-500/20 bg-purple-500/5"
      data-testid={`asi-panel-${context}`}
    >
      <CardHeader className={compact ? "pb-2 pt-3 px-3" : "pb-2"}>
        <button
          type="button"
          className="w-full flex items-center justify-between gap-2 focus-visible:outline-none"
          onClick={() => setExpanded(v => !v)}
          data-testid={`button-asi-toggle-${context}`}
        >
          <CardTitle className={`${compact ? "text-xs" : "text-sm"} font-semibold flex items-center gap-2`}>
            <Brain className={`${compact ? "h-3 w-3" : "h-4 w-4"} text-purple-400`} />
            {title}
            <span className="text-[9px] text-purple-400/70 font-medium px-1.5 py-0.5 rounded-full border border-purple-500/30 bg-purple-500/10">
              ASI
            </span>
            <Badge variant="outline" className="ml-1 text-[9px] border-purple-500/25 text-purple-400/70">
              {items.length}
            </Badge>
          </CardTitle>
          {expanded
            ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
            : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />}
        </button>
      </CardHeader>

      {expanded && items.length === 0 && (
        <CardContent className={compact ? "px-3 pb-3" : ""}>
          <p className="text-[11px] text-muted-foreground/60 italic text-center py-2" data-testid={`asi-empty-${context}`}>
            Brain learning — check back after first cycle
          </p>
        </CardContent>
      )}

      {expanded && items.length > 0 && (
        <CardContent className={compact ? "px-3 pb-3 space-y-1.5" : "space-y-2"}>
          {items.map((item, i) => {
            const style = getCategoryStyle(item.category);
            const Icon = style.icon;
            return (
              <div
                key={i}
                className="flex items-start gap-2 p-2 rounded-md bg-muted/20 hover:bg-muted/30 transition-colors"
                data-testid={`asi-insight-${context}-${i}`}
              >
                <Icon className="h-3 w-3 shrink-0 mt-0.5 text-purple-400/70" />
                <div className="flex-1 min-w-0 space-y-1">
                  <p className={`${compact ? "text-[11px]" : "text-xs"} text-foreground/85 leading-snug line-clamp-2`}>
                    {item.principle}
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge
                      variant="outline"
                      className={`text-[9px] px-1.5 py-0 ${style.color}`}
                    >
                      {style.label}
                    </Badge>
                    <ConfidenceDot value={item.confidence} />
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      )}
    </Card>
  );
}
