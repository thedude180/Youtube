/**
 * ContentPipelinePanel
 *
 * Visualises the full content pipeline at a glance:
 *   Catalog → Vault → Encoding → Shorts Queue → LF Queue → Publishing
 *
 * Zero external API calls — all data comes from the local DB via
 * /api/pipeline/status (pipeline-health-manager.ts).
 * The only live connections in the whole system are the YouTube publisher
 * and the live-chat copilot — everything else is always-on local flow.
 */

import { useQuery } from "@tanstack/react-query";
import {
  Database,
  Download,
  Cpu,
  Film,
  PlayCircle,
  Upload,
  Radio,
  ArrowRight,
  RefreshCw,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Minus,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { queryClient } from "@/lib/queryClient";

// ── Types ────────────────────────────────────────────────────────────────────

type StageHealth = "critical" | "low" | "healthy" | "full";

interface PipelineStage {
  label:  string;
  count:  number;
  detail: string;
  health: StageHealth;
  days?:  number;
}

interface PipelineStatusResult {
  catalog:     PipelineStage & { unprocessed: number };
  vault:       PipelineStage & { queued: number; downloading: number; downloaded: number; indexed: number; failed: number };
  encoding:    PipelineStage & { queued: number; processing: number };
  shortsQueue: PipelineStage & { days: number };
  lfQueue:     PipelineStage & { days: number };
  publishing:  PipelineStage & { scheduledThisWeek: number; recentlyPublished: number };
  isLive:      boolean;
  overall:     StageHealth;
  refreshedAt: string;
}

// ── Health helpers ────────────────────────────────────────────────────────────

function healthColor(h: StageHealth) {
  switch (h) {
    case "full":     return "text-emerald-400";
    case "healthy":  return "text-emerald-400";
    case "low":      return "text-amber-400";
    case "critical": return "text-red-400";
  }
}

function healthBg(h: StageHealth) {
  switch (h) {
    case "full":     return "bg-emerald-500/10 border-emerald-500/20";
    case "healthy":  return "bg-emerald-500/10 border-emerald-500/20";
    case "low":      return "bg-amber-500/10  border-amber-500/20";
    case "critical": return "bg-red-500/10    border-red-500/20";
  }
}

function healthDot(h: StageHealth) {
  switch (h) {
    case "full":
    case "healthy":  return "bg-emerald-400";
    case "low":      return "bg-amber-400";
    case "critical": return "bg-red-400 animate-pulse";
  }
}

function HealthIcon({ health }: { health: StageHealth }) {
  if (health === "critical") return <AlertTriangle className="h-3 w-3 text-red-400" />;
  if (health === "low")      return <Minus className="h-3 w-3 text-amber-400" />;
  return <CheckCircle2 className="h-3 w-3 text-emerald-400" />;
}

function overallLabel(h: StageHealth) {
  switch (h) {
    case "full":     return "Fully Loaded";
    case "healthy":  return "Flowing";
    case "low":      return "Running Low";
    case "critical": return "Action Needed";
  }
}

// ── Stage card ────────────────────────────────────────────────────────────────

interface StageCardProps {
  icon: React.ElementType;
  stage: PipelineStage;
  primary: string;
  sub?: string;
  testId: string;
  isLast?: boolean;
}

function StageCard({ icon: Icon, stage, primary, sub, testId, isLast }: StageCardProps) {
  return (
    <div className="flex items-stretch gap-2">
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border p-3 min-w-[80px] flex-1 transition-all ${healthBg(stage.health)}`}
              data-testid={testId}
            >
              <div className="flex items-center gap-1.5">
                <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${healthDot(stage.health)}`} />
                <Icon className={`h-3.5 w-3.5 ${healthColor(stage.health)}`} />
              </div>
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider leading-none">
                {stage.label}
              </span>
              <span className={`text-sm font-bold tabular-nums leading-none ${healthColor(stage.health)}`}>
                {primary}
              </span>
              {sub && (
                <span className="text-[9px] text-muted-foreground/60 leading-none text-center">
                  {sub}
                </span>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-[200px] text-center text-xs">
            {stage.detail}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {!isLast && (
        <div className="flex items-center self-center shrink-0">
          <ArrowRight className="h-3 w-3 text-muted-foreground/25" />
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ContentPipelinePanel() {
  const {
    data: pipeline,
    isLoading,
    dataUpdatedAt,
    refetch,
    isFetching,
  } = useQuery<PipelineStatusResult>({
    queryKey: ["/api/pipeline/status"],
    refetchInterval: 30_000,
    staleTime: 20_000,
  });

  if (isLoading) {
    return (
      <Card data-testid="card-content-pipeline-loading">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-1.5 w-1.5 rounded-full bg-muted animate-pulse" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Content Pipeline
            </span>
          </div>
          <div className="flex gap-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="flex items-center gap-2 flex-1">
                <div className="h-20 flex-1 rounded-xl bg-muted/30 animate-pulse" />
                {i < 5 && <ArrowRight className="h-3 w-3 text-muted-foreground/20 shrink-0" />}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!pipeline) return null;

  const p = pipeline;
  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";

  return (
    <Card
      className={`transition-all duration-500 ${p.overall === "critical" ? "border-red-500/30" : p.overall === "low" ? "border-amber-500/20" : "border-border/30"}`}
      data-testid="card-content-pipeline"
    >
      <CardContent className="p-4">
        {/* ── Header ── */}
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <div className={`h-1.5 w-1.5 rounded-full ${healthDot(p.overall)}`} />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Content Pipeline
            </span>
            <Badge
              variant="secondary"
              className={`text-[10px] border gap-1 ${
                p.overall === "critical" ? "bg-red-500/10 text-red-400 border-red-500/20" :
                p.overall === "low"      ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                                           "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
              }`}
              data-testid="badge-pipeline-overall"
            >
              <HealthIcon health={p.overall} />
              {overallLabel(p.overall)}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            {p.isLive && (
              <Badge variant="secondary" className="text-[10px] bg-red-500/15 text-red-400 border-red-500/20 gap-1 animate-pulse">
                <Radio className="h-2.5 w-2.5" />
                LIVE
              </Badge>
            )}
            {lastUpdated && (
              <span className="text-[10px] text-muted-foreground/50">{lastUpdated}</span>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => refetch()}
              disabled={isFetching}
              data-testid="button-pipeline-refresh"
            >
              {isFetching
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : <RefreshCw className="h-3 w-3" />}
            </Button>
          </div>
        </div>

        {/* ── Architecture note ── */}
        <p className="text-[10px] text-muted-foreground/50 mb-3 leading-relaxed">
          All stages run locally — no external API calls. Live connection used only for YouTube uploads &amp; live chat.
        </p>

        {/* ── Stage flow ── */}
        <div className="flex items-stretch gap-1.5 overflow-x-auto pb-1">
          <StageCard
            icon={Database}
            stage={p.catalog}
            primary={`${p.catalog.unprocessed}`}
            sub="source vids"
            testId="pipeline-stage-catalog"
          />
          <StageCard
            icon={Download}
            stage={p.vault}
            primary={p.vault.downloading > 0 ? `${p.vault.downloading}↓` : `${p.vault.downloaded}`}
            sub={p.vault.downloading > 0 ? "downloading" : "ready"}
            testId="pipeline-stage-vault"
          />
          <StageCard
            icon={Cpu}
            stage={p.encoding}
            primary={p.encoding.processing > 0 ? `${p.encoding.processing}` : `${p.encoding.queued}`}
            sub={p.encoding.processing > 0 ? "encoding" : "queued"}
            testId="pipeline-stage-encoding"
          />
          <StageCard
            icon={Film}
            stage={p.shortsQueue}
            primary={`${p.shortsQueue.days.toFixed(1)}d`}
            sub="Shorts"
            testId="pipeline-stage-shorts"
          />
          <StageCard
            icon={PlayCircle}
            stage={p.lfQueue}
            primary={`${p.lfQueue.days.toFixed(1)}d`}
            sub="Long-form"
            testId="pipeline-stage-longform"
          />
          <StageCard
            icon={Upload}
            stage={p.publishing}
            primary={`${p.publishing.scheduledThisWeek}`}
            sub="this week"
            testId="pipeline-stage-publishing"
            isLast
          />
        </div>

        {/* ── Live connection indicator ── */}
        <div className="mt-3 pt-3 border-t border-border/20 flex items-center justify-between gap-2">
          <div className="flex items-center gap-4 text-[10px] text-muted-foreground/50">
            <span>
              <span className="text-emerald-400/70 font-semibold">{p.publishing.recentlyPublished}</span> uploaded (7d)
            </span>
            <span>
              <span className="text-blue-400/70 font-semibold">{p.vault.indexed}</span> indexed in vault
            </span>
            <span>
              <span className="text-red-400/70 font-semibold">{p.vault.failed}</span> failed downloads
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px]">
            <Radio className={`h-2.5 w-2.5 ${p.isLive ? "text-red-400 animate-pulse" : "text-muted-foreground/30"}`} />
            <span className={p.isLive ? "text-red-400" : "text-muted-foreground/40"}>
              {p.isLive ? "Live connection active" : "Live connection idle"}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
