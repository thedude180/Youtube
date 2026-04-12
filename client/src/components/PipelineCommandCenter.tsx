import { useQuery } from "@tanstack/react-query";
import { useAdaptiveInterval } from "@/hooks/use-smart-polling";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Activity, CheckCircle2, AlertTriangle, Clock, Radio,
  ArrowRight, Loader2, Zap, RotateCcw, Timer,
  Layers, PlayCircle, TrendingUp, Hourglass,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface ActivePipeline {
  id: number;
  sourceTitle: string;
  pipelineType: string;
  status: string;
  currentStep: string;
  currentStepLabel: string;
  currentStepDescription: string;
  currentPhase: { id: string; label: string } | null;
  nextStep: { id: string; label: string } | null;
  completedCount: number;
  totalSteps: number;
  progress: number;
  mode: string;
  errorMessage: string | null;
  startedAt: string | null;
  createdAt: string;
  scheduledStartAt: string | null;
  humanDelayMinutes: number | null;
}

interface CompletedPipeline {
  id: number;
  sourceTitle: string;
  pipelineType: string;
  completedCount: number;
  totalSteps: number;
  completedAt: string | null;
  mode: string;
}

interface ErrorPipeline {
  id: number;
  sourceTitle: string;
  pipelineType: string;
  errorMessage: string | null;
  currentStep: string;
  createdAt: string;
}

interface CommandCenterData {
  active: ActivePipeline[];
  recentCompleted: CompletedPipeline[];
  recentErrors: ErrorPipeline[];
  totals: {
    total: number;
    completed: number;
    processing: number;
    queued: number;
    errored: number;
    liveCount: number;
    vodCount: number;
  };
}

const PHASE_COLORS: Record<string, string> = {
  intake: "bg-blue-500",
  intelligence: "bg-purple-500",
  content_ops: "bg-cyan-500",
  seo_growth: "bg-emerald-500",
  distribution: "bg-amber-500",
  audience: "bg-pink-500",
  community: "bg-orange-500",
  production: "bg-sky-500",
  security: "bg-red-500",
};

const PHASE_TEXT_COLORS: Record<string, string> = {
  intake: "text-blue-400",
  intelligence: "text-purple-400",
  content_ops: "text-cyan-400",
  seo_growth: "text-emerald-400",
  distribution: "text-amber-400",
  audience: "text-pink-400",
  community: "text-orange-400",
  production: "text-sky-400",
  security: "text-red-400",
};

function PipelineTypeBadge({ type, mode }: { type: string; mode: string }) {
  if (type === "live") {
    return (
      <Badge variant="destructive" className="text-xs" data-testid="badge-pipeline-type-live">
        <Radio className="h-3 w-3 mr-1 animate-pulse" />LIVE
      </Badge>
    );
  }
  if (type === "vod" || mode === "vod") {
    return (
      <Badge variant="secondary" className="text-xs bg-blue-500/15 text-blue-500 border-blue-500/30" data-testid="badge-pipeline-type-vod">
        <RotateCcw className="h-3 w-3 mr-1" />VOD
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="text-xs" data-testid="badge-pipeline-type-other">
      <Layers className="h-3 w-3 mr-1" />{type}
    </Badge>
  );
}

function StatusIndicator({ status }: { status: string }) {
  switch (status) {
    case "processing":
      return (
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
          </span>
          <span className="text-xs font-medium text-green-400" data-testid="text-status-processing">Working</span>
        </div>
      );
    case "queued":
      return (
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-2.5 w-2.5">
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
          </span>
          <span className="text-xs font-medium text-amber-400" data-testid="text-status-queued">Queued</span>
        </div>
      );
    case "waiting":
      return (
        <div className="flex items-center gap-1.5">
          <Hourglass className="h-3 w-3 text-sky-400" />
          <span className="text-xs font-medium text-sky-400" data-testid="text-status-waiting">Waiting</span>
        </div>
      );
    default:
      return null;
  }
}

function ActivePipelineCard({ pipeline }: { pipeline: ActivePipeline }) {
  const isProcessing = pipeline.status === "processing";
  const isWaiting = pipeline.status === "waiting";
  const phaseColor = pipeline.currentPhase?.id ? PHASE_COLORS[pipeline.currentPhase.id] : "bg-muted";
  const phaseTextColor = pipeline.currentPhase?.id ? PHASE_TEXT_COLORS[pipeline.currentPhase.id] : "text-muted-foreground";

  return (
    <div
      className={`rounded-md border p-3 space-y-2.5 ${isProcessing ? "border-green-500/30 bg-green-500/5" : isWaiting ? "border-sky-500/20 bg-sky-500/5" : "border-border"}`}
      data-testid={`pipeline-active-${pipeline.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <PipelineTypeBadge type={pipeline.pipelineType} mode={pipeline.mode} />
            <StatusIndicator status={pipeline.status} />
          </div>
          <p className="text-sm font-medium mt-1 truncate" data-testid={`text-pipeline-title-${pipeline.id}`}>
            {pipeline.sourceTitle}
          </p>
        </div>
        <div className="text-right shrink-0">
          <span className="text-lg font-bold tabular-nums" data-testid={`text-pipeline-progress-${pipeline.id}`}>{pipeline.progress}%</span>
          <p className="text-[10px] text-muted-foreground">{pipeline.completedCount}/{pipeline.totalSteps} steps</p>
        </div>
      </div>

      <Progress value={pipeline.progress} className="h-1.5" />

      <div className="space-y-1">
        {isWaiting && pipeline.scheduledStartAt ? (
          <div className="flex items-center gap-1.5 text-xs">
            <Timer className="h-3 w-3 text-sky-400" />
            <span className="text-sky-400 font-medium">
              Starting {formatDistanceToNow(new Date(pipeline.scheduledStartAt), { addSuffix: true })}
            </span>
            {pipeline.humanDelayMinutes && (
              <span className="text-muted-foreground">(realistic {Math.round(pipeline.humanDelayMinutes / 60)}h delay)</span>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-xs">
            {isProcessing ? (
              <Loader2 className="h-3 w-3 animate-spin text-green-400 shrink-0" />
            ) : (
              <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
            )}
            <span className={`font-medium ${isProcessing ? "text-green-400" : "text-foreground"}`} data-testid={`text-current-step-${pipeline.id}`}>
              {pipeline.currentStepLabel}
            </span>
            {pipeline.currentPhase && (
              <Badge variant="outline" className={`text-[10px] py-0 px-1.5 ${phaseTextColor}`}>
                {pipeline.currentPhase.label}
              </Badge>
            )}
          </div>
        )}

        <p className="text-[11px] text-muted-foreground pl-[18px]" data-testid={`text-step-description-${pipeline.id}`}>
          {isWaiting ? "VOD pipeline waiting for human-realistic delay before processing" : pipeline.currentStepDescription}
        </p>

        {pipeline.nextStep && !isWaiting && (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground pl-[18px]">
            <span>Next:</span>
            <span className="font-medium">{pipeline.nextStep.label}</span>
          </div>
        )}
      </div>

      {pipeline.startedAt && (
        <p className="text-[10px] text-muted-foreground">
          Started {formatDistanceToNow(new Date(pipeline.startedAt), { addSuffix: true })}
        </p>
      )}
    </div>
  );
}

export default function PipelineCommandCenter() {
  const pollInterval = useAdaptiveInterval(60_000);
  const { data, isLoading } = useQuery<CommandCenterData>({
    queryKey: ["/api/pipelines/command-center"],
    refetchInterval: pollInterval,
  });

  if (isLoading) {
    return (
      <Card data-testid="pipeline-command-center-loading">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
          <CardTitle className="text-base">Pipeline Command Center</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
          <Skeleton className="h-24" />
        </CardContent>
      </Card>
    );
  }

  const totals = data?.totals || { total: 0, completed: 0, processing: 0, queued: 0, errored: 0, liveCount: 0, vodCount: 0 };
  const active = data?.active || [];
  const recentCompleted = data?.recentCompleted || [];
  const recentErrors = data?.recentErrors || [];
  const isAnythingRunning = active.some(p => p.status === "processing");

  return (
    <Card data-testid="pipeline-command-center">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <div className="flex items-center gap-2">
          <Activity className={`h-4 w-4 ${isAnythingRunning ? "text-green-400 animate-pulse" : "text-muted-foreground"}`} />
          <CardTitle className="text-base" data-testid="text-command-center-title">Pipeline Command Center</CardTitle>
          {isAnythingRunning && (
            <Badge variant="outline" className="text-green-400 border-green-500/30 text-[10px]" data-testid="badge-live-indicator">
              <span className="relative flex h-1.5 w-1.5 mr-1">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500" />
              </span>
              LIVE
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="secondary" className="text-xs" data-testid="badge-total-pipelines">
            {totals.total} total
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div className="rounded-md bg-green-500/10 border border-green-500/20 p-2.5">
            <div className="flex items-center gap-1.5">
              <PlayCircle className="h-3.5 w-3.5 text-green-400" />
              <span className="text-xs text-green-400 font-medium">Running</span>
            </div>
            <p className="text-xl font-bold mt-0.5 tabular-nums" data-testid="text-running-count">{totals.processing}</p>
          </div>
          <div className="rounded-md bg-amber-500/10 border border-amber-500/20 p-2.5">
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-amber-400" />
              <span className="text-xs text-amber-400 font-medium">Queued</span>
            </div>
            <p className="text-xl font-bold mt-0.5 tabular-nums" data-testid="text-queued-count">{totals.queued}</p>
          </div>
          <div className="rounded-md bg-emerald-500/10 border border-emerald-500/20 p-2.5">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-xs text-emerald-400 font-medium">Completed</span>
            </div>
            <p className="text-xl font-bold mt-0.5 tabular-nums" data-testid="text-completed-count">{totals.completed}</p>
          </div>
          <div className="rounded-md bg-red-500/10 border border-red-500/20 p-2.5">
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
              <span className="text-xs text-red-400 font-medium">Errors</span>
            </div>
            <p className="text-xl font-bold mt-0.5 tabular-nums" data-testid="text-error-count">{totals.errored}</p>
          </div>
        </div>

        {active.length > 0 ? (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider" data-testid="text-active-header">
              Active Pipelines ({active.length})
            </h4>
            <div className="space-y-2">
              {active.map((p) => (
                <ActivePipelineCard key={p.id} pipeline={p} />
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-md border border-dashed p-4 text-center" data-testid="empty-active-pipelines">
            <Zap className="h-6 w-6 mx-auto mb-1.5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">All pipelines idle</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Pipelines start automatically when you go live or publish new content
            </p>
          </div>
        )}

        {recentErrors.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-red-400 uppercase tracking-wider" data-testid="text-errors-header">
              Recent Issues
            </h4>
            {recentErrors.map((p) => (
              <div key={p.id} className="flex items-start gap-2 rounded-md bg-red-500/5 border border-red-500/20 p-2" data-testid={`pipeline-error-${p.id}`}>
                <AlertTriangle className="h-3.5 w-3.5 text-red-400 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate">{p.sourceTitle}</p>
                  <p className="text-[11px] text-red-400 truncate" data-testid={`text-error-msg-${p.id}`}>
                    {p.errorMessage || `Failed at step: ${p.currentStep}`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {recentCompleted.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider" data-testid="text-completed-header">
              Recently Finished
            </h4>
            <div className="space-y-1">
              {recentCompleted.map((p) => (
                <div key={p.id} className="flex items-center gap-2 text-xs" data-testid={`pipeline-completed-${p.id}`}>
                  <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
                  <PipelineTypeBadge type={p.pipelineType} mode={p.mode} />
                  <span className="truncate flex-1" data-testid={`text-completed-title-${p.id}`}>{p.sourceTitle}</span>
                  <span className="text-muted-foreground shrink-0">
                    {p.completedCount}/{p.totalSteps} steps
                  </span>
                  {p.completedAt && (
                    <span className="text-muted-foreground shrink-0">
                      {formatDistanceToNow(new Date(p.completedAt), { addSuffix: true })}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {(totals.liveCount > 0 || totals.vodCount > 0) && (
          <div className="flex items-center gap-3 pt-1 border-t text-xs text-muted-foreground" data-testid="pipeline-type-breakdown">
            <TrendingUp className="h-3 w-3" />
            <span>{totals.liveCount} Live pipelines</span>
            <span>{totals.vodCount} VOD pipelines</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
