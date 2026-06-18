import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Brain, Zap, Radio, Target, Users, ChevronDown, ChevronUp, CheckCircle2, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface EngineCycle {
  id: number;
  service: string;
  title: string;
  detail: Record<string, unknown> | null;
  occurredAt: string;
  severity: string;
}

interface KBEntry {
  id: number;
  category: string;
  principle: string;
  metadata: Record<string, unknown> | null;
  confidenceScore: number | null;
  createdAt?: string;
  updatedAt?: string;
}

interface AILearningData {
  engineCycles: EngineCycle[];
  validatedStrategies: KBEntry[];
  streamIntelligence: KBEntry[];
  audienceCalibrations: KBEntry[];
  currentDirective: string | null;
  directiveAgeMs: number | null;
}

function confidenceBadge(score: number | null) {
  if (score == null) return null;
  const pct = Math.round(score);
  if (pct >= 70) return <span className="text-emerald-400 font-medium">{pct}%</span>;
  if (pct >= 50) return <span className="text-amber-400 font-medium">{pct}%</span>;
  return <span className="text-muted-foreground">{pct}%</span>;
}

function serviceLabel(service: string): string {
  const map: Record<string, string> = {
    "youtube-ai-orchestrator": "Orchestrator",
    "shorts-publisher":        "Shorts Publisher",
    "long-form-publisher":     "Long-form Publisher",
    "content-grinder":         "Content Grinder",
    "back-catalog-runner":     "Back Catalog",
    "audience-intelligence":   "Audience AI",
    "revenue-optimizer":       "Revenue Optimizer",
    "trend-wave-interceptor":  "Trend Interceptor",
  };
  return map[service] ?? service;
}

function cycleSummary(cycle: EngineCycle): string {
  const d = cycle.detail as any;
  if (!d) return cycle.title.slice(0, 80);
  const parts: string[] = [];
  if (d.succeeded != null) parts.push(`✓ ${d.succeeded}`);
  if (d.failed != null && d.failed > 0) parts.push(`✗ ${d.failed}`);
  if (d.skipped != null && d.skipped > 0) parts.push(`– ${d.skipped} skipped`);
  if (d.keyInsight) parts.push(d.keyInsight);
  return parts.join("  ·  ") || cycle.title.slice(0, 80);
}

export default function AILearningPanel() {
  const [showAllCycles, setShowAllCycles]       = useState(false);
  const [showAllStrategies, setShowAllStrategies] = useState(false);

  const { data, isLoading } = useQuery<AILearningData>({
    queryKey: ["/api/youtube/ai-learning"],
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-2" data-testid="ai-learning-panel-loading">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
        <Skeleton className="h-3 w-3/5" />
      </div>
    );
  }

  if (!data) return null;

  const visibleCycles     = showAllCycles     ? data.engineCycles           : data.engineCycles.slice(0, 5);
  const visibleStrategies = showAllStrategies ? data.validatedStrategies     : data.validatedStrategies.slice(0, 4);

  return (
    <div className="space-y-4" data-testid="ai-learning-panel">

      {/* ── Current Strategic Directive ─────────────────────────────────────── */}
      {data.currentDirective && (
        <div className="rounded-lg bg-violet-500/10 border border-violet-500/20 p-3 space-y-1"
             data-testid="ai-learning-directive">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-violet-400 uppercase tracking-wide">
            <Brain className="h-3.5 w-3.5" />
            Active Strategic Directive
            {data.directiveAgeMs != null && (
              <span className="ml-auto font-normal text-muted-foreground normal-case tracking-normal">
                {formatDistanceToNow(new Date(Date.now() - data.directiveAgeMs), { addSuffix: true })}
              </span>
            )}
          </div>
          <p className="text-[11px] text-violet-200/80 leading-relaxed" data-testid="text-directive-content">
            {data.currentDirective.slice(0, 300)}
          </p>
        </div>
      )}

      {/* ── Engine Cycle Telemetry ───────────────────────────────────────────── */}
      {data.engineCycles.length > 0 && (
        <div className="space-y-1.5" data-testid="ai-learning-engine-cycles">
          <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wide flex items-center gap-1">
            <Zap className="h-3 w-3" /> Engine Activity
          </p>
          <div className="space-y-0.5">
            {visibleCycles.map(c => (
              <div key={c.id}
                   className="flex items-start gap-2 text-[10px]"
                   data-testid={`text-cycle-${c.id}`}>
                <span className="min-w-[110px] text-muted-foreground/70 shrink-0">
                  {serviceLabel(c.service)}
                </span>
                <span className="text-muted-foreground/90 truncate flex-1">
                  {cycleSummary(c)}
                </span>
                <span className="text-muted-foreground/50 shrink-0">
                  {formatDistanceToNow(new Date(c.occurredAt), { addSuffix: true })}
                </span>
              </div>
            ))}
          </div>
          {data.engineCycles.length > 5 && (
            <button
              className="text-[9px] text-muted-foreground/50 hover:text-muted-foreground flex items-center gap-0.5"
              onClick={() => setShowAllCycles(v => !v)}
              data-testid="button-toggle-cycles"
            >
              {showAllCycles ? <><ChevronUp className="h-3 w-3" /> show fewer</> : <><ChevronDown className="h-3 w-3" /> +{data.engineCycles.length - 5} more</>}
            </button>
          )}
        </div>
      )}

      {/* ── Validated Strategies ─────────────────────────────────────────────── */}
      {data.validatedStrategies.length > 0 && (
        <div className="space-y-1.5" data-testid="ai-learning-strategies">
          <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wide flex items-center gap-1">
            <Target className="h-3 w-3" /> Validated Strategies
          </p>
          <div className="space-y-1">
            {visibleStrategies.map(s => (
              <div key={s.id}
                   className="flex items-start gap-2 text-[10px]"
                   data-testid={`text-strategy-${s.id}`}>
                <span className="shrink-0 mt-0.5">
                  <CheckCircle2 className="h-3 w-3 text-emerald-500/70" />
                </span>
                <span className="text-muted-foreground/90 flex-1 leading-relaxed">
                  {s.principle.replace(/^\[DO\]\s*/, "").slice(0, 180)}
                </span>
                {confidenceBadge(s.confidenceScore)}
              </div>
            ))}
          </div>
          {data.validatedStrategies.length > 4 && (
            <button
              className="text-[9px] text-muted-foreground/50 hover:text-muted-foreground flex items-center gap-0.5"
              onClick={() => setShowAllStrategies(v => !v)}
              data-testid="button-toggle-strategies"
            >
              {showAllStrategies ? <><ChevronUp className="h-3 w-3" /> show fewer</> : <><ChevronDown className="h-3 w-3" /> +{data.validatedStrategies.length - 4} more</>}
            </button>
          )}
        </div>
      )}

      {/* ── Stream Intelligence ───────────────────────────────────────────────── */}
      {data.streamIntelligence.length > 0 && (
        <div className="space-y-1.5" data-testid="ai-learning-stream-intel">
          <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wide flex items-center gap-1">
            <Radio className="h-3 w-3" /> Stream Intelligence
          </p>
          <div className="space-y-0.5">
            {data.streamIntelligence.map(s => (
              <div key={s.id}
                   className="flex items-start gap-2 text-[10px]"
                   data-testid={`text-stream-intel-${s.id}`}>
                <span className="text-muted-foreground/90 flex-1 leading-relaxed">
                  {s.principle.slice(0, 200)}
                </span>
                <div className="flex flex-col items-end gap-0.5 shrink-0">
                  {confidenceBadge(s.confidenceScore)}
                  {s.createdAt && (
                    <span className="text-muted-foreground/40 text-[9px]">
                      {formatDistanceToNow(new Date(s.createdAt), { addSuffix: true })}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Audience Calibration Signals ──────────────────────────────────────── */}
      {data.audienceCalibrations.length > 0 && (
        <div className="space-y-1.5" data-testid="ai-learning-calibrations">
          <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wide flex items-center gap-1">
            <Users className="h-3 w-3" /> Audience Calibration
          </p>
          <div className="space-y-0.5">
            {data.audienceCalibrations.map(c => {
              const isPending  = c.confidenceScore != null && c.confidenceScore <= 35;
              const isInsight  = c.category === "audience_insight";
              return (
                <div key={c.id}
                     className="flex items-start gap-2 text-[10px]"
                     data-testid={`text-calibration-${c.id}`}>
                  <span className="shrink-0 mt-0.5">
                    {isPending
                      ? <Clock className="h-3 w-3 text-amber-500/60" />
                      : <CheckCircle2 className="h-3 w-3 text-emerald-500/70" />}
                  </span>
                  <span className="text-muted-foreground/80 flex-1 leading-relaxed">
                    {c.principle.slice(0, 160)}
                  </span>
                  <div className="flex flex-col items-end gap-0.5 shrink-0">
                    {isInsight
                      ? <Badge className="text-[8px] py-0 px-1 h-4 bg-emerald-500/20 text-emerald-400 border-emerald-500/30">insight</Badge>
                      : <Badge className="text-[8px] py-0 px-1 h-4 bg-amber-500/10 text-amber-400/70 border-amber-500/20">pending</Badge>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty state */}
      {data.engineCycles.length === 0 &&
       data.validatedStrategies.length === 0 &&
       data.streamIntelligence.length === 0 && (
        <p className="text-[10px] text-muted-foreground/50 text-center py-3" data-testid="text-ai-learning-empty">
          AI learning activity will appear here after the first automated cycle runs.
        </p>
      )}
    </div>
  );
}
