import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { PIPELINE_STEPS } from "@shared/schema";
import type { ContentPipeline } from "@shared/schema";
import {
  Play,
  Plus,
  Trash2,
  CheckCircle2,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Search,
  FileText,
  Tags,
  Image,
  Scissors,
  Share2,
  CalendarClock,
  Sparkles,
  ArrowRight,
  Pause,
  Radio,
  RotateCcw,
  Globe,
  RefreshCw,
  Library,
  Zap,
} from "lucide-react";

const STEP_ICONS: Record<string, any> = {
  analyze: Search,
  title: Sparkles,
  description: FileText,
  tags: Tags,
  thumbnail: Image,
  clips: Scissors,
  repurpose: Share2,
  schedule: CalendarClock,
};

const STEP_COLORS: Record<string, string> = {
  analyze: "text-blue-500",
  title: "text-yellow-500",
  description: "text-green-500",
  tags: "text-purple-500",
  thumbnail: "text-pink-500",
  clips: "text-orange-500",
  repurpose: "text-cyan-500",
  schedule: "text-emerald-500",
};

function StepIndicator({ step, isCompleted, isCurrent, isProcessing }: {
  step: typeof PIPELINE_STEPS[number];
  isCompleted: boolean;
  isCurrent: boolean;
  isProcessing: boolean;
}) {
  const Icon = STEP_ICONS[step.id] || Search;
  const color = STEP_COLORS[step.id] || "text-muted-foreground";

  return (
    <div className="flex flex-col items-center gap-1 min-w-[4.5rem]" data-testid={`step-${step.id}`}>
      <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all ${
        isCompleted ? "border-green-500 bg-green-500/10" :
        isCurrent && isProcessing ? "border-primary bg-primary/10 animate-pulse" :
        isCurrent ? "border-primary bg-primary/10" :
        "border-muted bg-muted/30"
      }`}>
        {isCompleted ? (
          <CheckCircle2 className="h-5 w-5 text-green-500" />
        ) : isCurrent && isProcessing ? (
          <Loader2 className="h-5 w-5 text-primary animate-spin" />
        ) : (
          <Icon className={`h-5 w-5 ${isCurrent ? "text-primary" : color}`} />
        )}
      </div>
      <span className={`text-[10px] text-center leading-tight font-medium ${
        isCompleted ? "text-green-500" :
        isCurrent ? "text-primary" :
        "text-muted-foreground"
      }`}>
        {step.label}
      </span>
    </div>
  );
}

function PipelineProgress({ pipeline, isProcessing }: { pipeline: ContentPipeline; isProcessing: boolean }) {
  const completedSteps = pipeline.completedSteps || [];
  const currentStep = pipeline.currentStep;

  return (
    <div className="flex items-start gap-1 overflow-x-auto pb-2">
      {PIPELINE_STEPS.map((step, i) => (
        <div key={step.id} className="flex items-center">
          <StepIndicator
            step={step}
            isCompleted={completedSteps.includes(step.id)}
            isCurrent={currentStep === step.id && pipeline.status !== "completed"}
            isProcessing={isProcessing && currentStep === step.id}
          />
          {i < PIPELINE_STEPS.length - 1 && (
            <ArrowRight className={`h-3 w-3 mx-0.5 shrink-0 mt-3 ${
              completedSteps.includes(step.id) ? "text-green-500" : "text-muted-foreground/30"
            }`} />
          )}
        </div>
      ))}
    </div>
  );
}

function StepResultPreview({ step, data }: { step: string; data: any }) {
  if (!data) return null;

  switch (step) {
    case "analyze":
      return (
        <div className="space-y-2">
          {data.summary && <p className="text-sm">{data.summary}</p>}
          {data.keyMoments?.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {data.keyMoments.slice(0, 5).map((m: string, i: number) => (
                <Badge key={i} variant="secondary">{m}</Badge>
              ))}
            </div>
          )}
          {data.engagementPotential && (
            <Badge variant={data.engagementPotential === "high" ? "default" : "secondary"}>
              {data.engagementPotential} potential
            </Badge>
          )}
        </div>
      );
    case "title":
      return (
        <div className="space-y-1">
          {data.titles?.slice(0, 3).map((t: any, i: number) => (
            <div key={i} className="flex items-center gap-2">
              <Badge variant="outline" className="shrink-0">{i + 1}</Badge>
              <span className="text-sm">{t.title || t}</span>
            </div>
          ))}
        </div>
      );
    case "description":
      return (
        <div className="space-y-2">
          <p className="text-sm line-clamp-3 whitespace-pre-wrap">{data.description?.substring(0, 200)}...</p>
          {data.seoScore && (
            <Badge variant={data.seoScore >= 80 ? "default" : "secondary"}>
              SEO: {data.seoScore}/100
            </Badge>
          )}
        </div>
      );
    case "tags":
      return (
        <div className="flex flex-wrap gap-1">
          {data.tags?.slice(0, 8).map((t: string, i: number) => (
            <Badge key={i} variant="secondary">{t}</Badge>
          ))}
          {data.hashtags?.slice(0, 3).map((h: string, i: number) => (
            <Badge key={`h-${i}`} variant="outline">{h}</Badge>
          ))}
        </div>
      );
    case "thumbnail":
      return (
        <div className="space-y-2">
          {data.concepts?.slice(0, 2).map((c: any, i: number) => (
            <div key={i} className="text-sm">
              <span className="font-medium">Concept {i + 1}:</span> {c.visual || c.description}
              {c.textOverlay && <span className="text-muted-foreground"> - "{c.textOverlay}"</span>}
            </div>
          ))}
        </div>
      );
    case "clips":
      return (
        <div className="space-y-1">
          {data.clips?.slice(0, 3).map((c: any, i: number) => (
            <div key={i} className="flex items-center gap-2">
              <Badge variant="outline" className="shrink-0">{c.platform || "TikTok"}</Badge>
              <span className="text-sm truncate">{c.hook || c.description}</span>
            </div>
          ))}
        </div>
      );
    case "repurpose":
      return (
        <div className="space-y-1">
          {data.posts?.slice(0, 3).map((p: any, i: number) => (
            <div key={i} className="flex items-center gap-2">
              <Badge variant="outline" className="shrink-0">{p.platform}</Badge>
              <span className="text-sm truncate">{p.content?.substring(0, 80)}</span>
            </div>
          ))}
        </div>
      );
    case "schedule":
      return (
        <div className="space-y-1">
          {data.schedule?.slice(0, 4).map((s: any, i: number) => (
            <div key={i} className="flex items-center gap-2">
              <Badge variant="outline" className="shrink-0">{s.platform}</Badge>
              <span className="text-sm">{s.dayOfWeek} {s.suggestedTime}</span>
            </div>
          ))}
        </div>
      );
    default:
      return <pre className="text-xs text-muted-foreground overflow-hidden">{JSON.stringify(data, null, 2).substring(0, 200)}</pre>;
  }
}

function PipelineCard({ pipeline, onRun, onDelete, isRunning }: {
  pipeline: ContentPipeline;
  onRun: (id: number) => void;
  onDelete: (id: number) => void;
  isRunning: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const completedCount = (pipeline.completedSteps || []).length;
  const totalSteps = PIPELINE_STEPS.length;
  const progressPct = Math.round((completedCount / totalSteps) * 100);
  const results = (pipeline.stepResults || {}) as Record<string, any>;

  const statusColor = {
    queued: "text-muted-foreground",
    processing: "text-primary",
    completed: "text-green-500",
    error: "text-red-500",
    paused: "text-yellow-500",
  }[pipeline.status] || "text-muted-foreground";

  const statusLabel = {
    queued: "Ready to Process",
    processing: "Processing...",
    completed: "Complete",
    error: "Error",
    paused: "Paused",
  }[pipeline.status] || pipeline.status;

  return (
    <Card data-testid={`card-pipeline-${pipeline.id}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h3 className="font-semibold text-sm truncate" data-testid={`text-pipeline-title-${pipeline.id}`}>
              {pipeline.videoTitle}
            </h3>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {pipeline.mode === "live" ? (
                <Badge variant="destructive" data-testid={`badge-mode-${pipeline.id}`}>
                  <Radio className="h-3 w-3 mr-1 animate-pulse" />
                  LIVE
                </Badge>
              ) : pipeline.mode === "replay" ? (
                <Badge variant="secondary" className="bg-blue-500/15 text-blue-500 border-blue-500/30" data-testid={`badge-mode-${pipeline.id}`}>
                  <RotateCcw className="h-3 w-3 mr-1" />
                  REPLAY
                </Badge>
              ) : pipeline.mode === "refresh" ? (
                <Badge variant="secondary" className="bg-amber-500/15 text-amber-500 border-amber-500/30" data-testid={`badge-mode-${pipeline.id}`}>
                  <RefreshCw className="h-3 w-3 mr-1" />
                  REFRESH
                </Badge>
              ) : (
                <Badge variant="secondary" data-testid={`badge-mode-${pipeline.id}`}>{pipeline.source}</Badge>
              )}
              {pipeline.source === "livestream" && (
                <Badge variant="outline" className="text-[10px]">
                  <Globe className="h-3 w-3 mr-1" />
                  6 Platforms
                </Badge>
              )}
              <span className={`text-xs font-medium ${statusColor}`}>{statusLabel}</span>
              {pipeline.status !== "completed" && pipeline.status !== "error" && (
                <span className="text-xs text-muted-foreground">{completedCount}/{totalSteps} steps</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {pipeline.status !== "completed" && pipeline.status !== "processing" && (
              <Button
                size="sm"
                onClick={() => onRun(pipeline.id)}
                disabled={isRunning}
                data-testid={`button-run-pipeline-${pipeline.id}`}
              >
                {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                <span className="ml-1">{completedCount > 0 ? "Resume" : "Run All"}</span>
              </Button>
            )}
            {pipeline.status === "completed" && (
              <Badge variant="default">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Done
              </Badge>
            )}
            <Button
              size="icon"
              variant="ghost"
              onClick={() => onDelete(pipeline.id)}
              data-testid={`button-delete-pipeline-${pipeline.id}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {pipeline.errorMessage && (
          <div className="flex items-center gap-2 text-sm text-red-500">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{pipeline.errorMessage}</span>
          </div>
        )}

        <div className="w-full bg-muted/50 rounded-full h-1.5">
          <div
            className={`h-1.5 rounded-full transition-all ${
              pipeline.status === "error" ? "bg-red-500" :
              pipeline.status === "completed" ? "bg-green-500" :
              "bg-primary"
            }`}
            style={{ width: `${progressPct}%` }}
          />
        </div>

        <PipelineProgress pipeline={pipeline} isProcessing={isRunning || pipeline.status === "processing"} />

        {completedCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="w-full"
            data-testid={`button-expand-results-${pipeline.id}`}
          >
            {expanded ? <ChevronUp className="h-4 w-4 mr-1" /> : <ChevronDown className="h-4 w-4 mr-1" />}
            {expanded ? "Hide Results" : `View ${completedCount} Results`}
          </Button>
        )}

        {expanded && (
          <div className="space-y-3 pt-2 border-t">
            {PIPELINE_STEPS.filter(s => (pipeline.completedSteps || []).includes(s.id)).map(step => {
              const Icon = STEP_ICONS[step.id] || Search;
              const color = STEP_COLORS[step.id] || "text-muted-foreground";
              return (
                <div key={step.id} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Icon className={`h-4 w-4 ${color}`} />
                    <span className="text-sm font-medium">{step.label}</span>
                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                  </div>
                  <div className="pl-6">
                    <StepResultPreview step={step.id} data={results[step.id]} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BacklogStatusCard({ status, refreshCount, refreshProcessing, refreshCompleted }: {
  status?: BacklogStatus;
  refreshCount: number;
  refreshProcessing: number;
  refreshCompleted: number;
}) {
  const state = status?.state || "idle";
  const totalProcessed = status?.totalProcessed || 0;
  const totalQueued = status?.totalQueued || 0;
  const totalRemaining = status?.totalRemaining || 0;
  const currentVideo = status?.currentVideoTitle;
  const progressPct = totalQueued > 0 ? Math.round((totalProcessed / totalQueued) * 100) : 0;

  const stateConfig: Record<string, { label: string; color: string; bgColor: string; borderColor: string; icon: any }> = {
    running: { label: "Processing", color: "text-green-500", bgColor: "bg-green-500/15", borderColor: "border-green-500/30", icon: Loader2 },
    idle: { label: totalRemaining === 0 ? "Complete" : "Idle", color: totalRemaining === 0 ? "text-green-500" : "text-muted-foreground", bgColor: totalRemaining === 0 ? "bg-green-500/15" : "bg-muted/50", borderColor: totalRemaining === 0 ? "border-green-500/30" : "border-muted", icon: totalRemaining === 0 ? CheckCircle2 : Library },
    paused_for_live: { label: "Paused — LIVE", color: "text-red-500", bgColor: "bg-red-500/15", borderColor: "border-red-500/30", icon: Radio },
    finishing_current: { label: "Finishing current...", color: "text-yellow-500", bgColor: "bg-yellow-500/15", borderColor: "border-yellow-500/30", icon: Zap },
    waiting_for_replay: { label: "Processing replay...", color: "text-blue-500", bgColor: "bg-blue-500/15", borderColor: "border-blue-500/30", icon: RotateCcw },
  };

  const cfg = stateConfig[state] || stateConfig.idle;
  const StateIcon = cfg.icon;

  return (
    <Card data-testid="card-backlog-refresh">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="space-y-1 flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Library className="h-5 w-5 text-amber-500" />
              <h2 className="font-semibold">Backlog Refresh</h2>
              <Badge variant="secondary" className={`${cfg.bgColor} ${cfg.color} ${cfg.borderColor} text-[10px]`}>
                {state === "running" && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                {state !== "running" && <StateIcon className="h-3 w-3 mr-1" />}
                {cfg.label}
              </Badge>
              {totalQueued > 0 && (
                <Badge variant="secondary" className="text-[10px]">
                  {totalProcessed}/{totalQueued} videos
                </Badge>
              )}
            </div>

            {state === "running" && currentVideo && (
              <p className="text-sm text-muted-foreground truncate">
                Now refreshing: <span className="text-foreground font-medium">{currentVideo}</span>
              </p>
            )}

            {state === "paused_for_live" && (
              <p className="text-sm text-muted-foreground">
                Backlog paused while you're live. All resources shifted to LIVE pipeline. Will resume automatically when stream ends.
              </p>
            )}

            {state === "finishing_current" && (
              <p className="text-sm text-muted-foreground">
                Finishing current video, then shifting all resources to your live stream.
              </p>
            )}

            {state === "waiting_for_replay" && (
              <p className="text-sm text-muted-foreground">
                Stream ended — processing REPLAY pipeline. Backlog will resume automatically after replay is done.
              </p>
            )}

            {state === "idle" && totalRemaining === 0 && totalQueued > 0 && (
              <p className="text-sm text-muted-foreground">
                All {totalQueued} videos in your library have been refreshed with updated titles, SEO, thumbnails, and cross-platform posts.
              </p>
            )}

            {state === "idle" && totalRemaining > 0 && (
              <p className="text-sm text-muted-foreground">
                {totalRemaining} videos waiting to be refreshed. Backlog starts automatically on login.
              </p>
            )}

            {state === "idle" && totalQueued === 0 && (
              <p className="text-sm text-muted-foreground">
                No videos in library yet. Backlog refresh will start automatically once you have content.
              </p>
            )}
          </div>
        </div>

        {totalQueued > 0 && (
          <div className="space-y-1">
            <div className="w-full bg-muted/50 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${
                  state === "paused_for_live" ? "bg-red-500" :
                  state === "running" || state === "finishing_current" ? "bg-primary" :
                  totalRemaining === 0 ? "bg-green-500" :
                  "bg-muted-foreground/50"
                }`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>{totalProcessed} refreshed</span>
              <span>{totalRemaining} remaining</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface BacklogStatus {
  state: "idle" | "running" | "paused_for_live" | "finishing_current" | "waiting_for_replay";
  currentVideoTitle: string | null;
  totalQueued: number;
  totalProcessed: number;
  totalRemaining: number;
  currentPipelineId: number | null;
  streamId: number | null;
  startedAt: string | null;
  pausedAt: string | null;
}

export default function PipelineTab() {
  const { toast } = useToast();
  const [newTitle, setNewTitle] = useState("");
  const backlogStatusQuery = useQuery<BacklogStatus>({
    queryKey: ["/api/backlog/status"],
    refetchInterval: 5000,
  });

  const pipelinesQuery = useQuery<ContentPipeline[]>({
    queryKey: ["/api/pipeline"],
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      const hasProcessing = data.some(p => p.status === "processing");
      return hasProcessing ? 3000 : false;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (videoTitle: string) => {
      return apiRequest("POST", "/api/pipeline", { videoTitle, source: "manual" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pipeline"] });
      setNewTitle("");
      toast({ title: "Video added to pipeline" });
    },
  });

  const runMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("POST", `/api/pipeline/${id}/run`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pipeline"] });
      toast({ title: "Pipeline started", description: "AI is processing your video through all 8 steps" });
    },
    onError: (err: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/pipeline"] });
      toast({ title: "Pipeline error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/pipeline/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pipeline"] });
    },
  });

  const pipelines = pipelinesQuery.data || [];
  const refreshCount = pipelines.filter(p => p.mode === "refresh").length;
  const refreshProcessing = pipelines.filter(p => p.mode === "refresh" && p.status === "processing").length;
  const refreshCompleted = pipelines.filter(p => p.mode === "refresh" && p.status === "completed").length;

  const handleCreate = () => {
    if (!newTitle.trim()) return;
    createMutation.mutate(newTitle.trim());
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">Content Pipeline</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Drop a video title and AI processes it through 8 optimization steps automatically — 
            from analysis to scheduling. Each step feeds into the next like an assembly line.
          </p>
          <div className="flex gap-2">
            <Input
              placeholder="Enter video title (e.g. 'Warzone 50 Kill Game')"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              data-testid="input-pipeline-title"
            />
            <Button
              onClick={handleCreate}
              disabled={!newTitle.trim() || createMutation.isPending}
              data-testid="button-add-pipeline"
            >
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              <span className="ml-1 hidden sm:inline">Add</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      <BacklogStatusCard status={backlogStatusQuery.data} refreshCount={refreshCount} refreshProcessing={refreshProcessing} refreshCompleted={refreshCompleted} />

      {pipelinesQuery.isLoading ? (
        <div className="space-y-3">
          {[1, 2].map(i => <Skeleton key={i} className="h-40" />)}
        </div>
      ) : pipelines.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Sparkles className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <h3 className="font-semibold mb-1">No videos in pipeline</h3>
            <p className="text-sm text-muted-foreground">
              Add a video title above to start the AI optimization assembly line
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {pipelines.map(p => (
            <PipelineCard
              key={p.id}
              pipeline={p}
              onRun={(id) => runMutation.mutate(id)}
              onDelete={(id) => deleteMutation.mutate(id)}
              isRunning={p.status === "processing"}
            />
          ))}
        </div>
      )}
    </div>
  );
}
