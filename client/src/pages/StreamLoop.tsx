import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Radio, Scan, Monitor, Scissors, Film, Wand2, Share2, BarChart3,
  Brain, Play, Square, CheckCircle2, Clock, AlertTriangle, Loader2,
  Zap, ArrowRight, Sparkles, Activity, RefreshCw
} from "lucide-react";

const PHASE_ICONS: Record<string, any> = {
  "pre-stream-check": Radio,
  "stream-detection": Scan,
  "live-monitoring": Monitor,
  "clip-extraction": Scissors,
  "highlight-compilation": Film,
  "vod-optimization": Wand2,
  "multi-platform-distribution": Share2,
  "performance-verification": BarChart3,
  "learning-adaptation": Brain,
};

const PHASE_LABELS: Record<string, string> = {
  "pre-stream-check": "Pre-Stream Check",
  "stream-detection": "Stream Detection",
  "live-monitoring": "Live Monitoring",
  "clip-extraction": "Clip Extraction",
  "highlight-compilation": "Highlight Compilation",
  "vod-optimization": "VOD Optimization",
  "multi-platform-distribution": "Multi-Platform Distribution",
  "performance-verification": "Performance Verification",
  "learning-adaptation": "Learning & Adaptation",
};

const PHASE_DESCRIPTIONS: Record<string, string> = {
  "pre-stream-check": "Verify platform connections, stream keys, and readiness",
  "stream-detection": "Scan for active or recently ended live streams",
  "live-monitoring": "Monitor stream health, chat activity, and viewer trends",
  "clip-extraction": "AI identifies and extracts the best moments for clips",
  "highlight-compilation": "Compile top clips into highlight reels",
  "vod-optimization": "AI optimizes titles, descriptions, tags, and thumbnails",
  "multi-platform-distribution": "Distribute content across all connected platforms",
  "performance-verification": "Verify published content is live and tracking metrics",
  "learning-adaptation": "Analyze results and adapt strategies for next cycle",
};

function PhaseTimeline({ phases, currentPhase }: { phases: any[]; currentPhase: string | null }) {
  return (
    <div className="space-y-1" data-testid="stream-phase-timeline">
      {phases.map((phase: any, idx: number) => {
        const Icon = PHASE_ICONS[phase.name] || Zap;
        const isActive = phase.name === currentPhase && phase.status === "running";
        const isCompleted = phase.status === "completed";
        const isFailed = phase.status === "failed";

        return (
          <div
            key={phase.name}
            className={`flex items-center gap-3 p-2.5 rounded-lg transition-all ${
              isActive ? "bg-primary/10 border border-primary/30 shadow-sm" :
              isCompleted ? "bg-emerald-500/5 border border-emerald-500/10" :
              isFailed ? "bg-red-500/5 border border-red-500/10" :
              "bg-muted/30 border border-transparent"
            }`}
            data-testid={`stream-phase-${phase.name}`}
          >
            <div className={`flex items-center justify-center w-8 h-8 rounded-full shrink-0 ${
              isActive ? "bg-primary/20 text-primary" :
              isCompleted ? "bg-emerald-500/20 text-emerald-400" :
              isFailed ? "bg-red-500/20 text-red-400" :
              "bg-muted/50 text-muted-foreground"
            }`}>
              {isActive ? <Loader2 className="w-4 h-4 animate-spin" /> :
               isCompleted ? <CheckCircle2 className="w-4 h-4" /> :
               isFailed ? <AlertTriangle className="w-4 h-4" /> :
               <Icon className="w-4 h-4" />}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`text-sm font-medium ${isActive ? "text-primary" : isCompleted ? "text-emerald-400" : ""}`}>
                  {PHASE_LABELS[phase.name] || phase.name}
                </span>
                {phase.durationMs != null && (
                  <span className="text-[10px] text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
                    {phase.durationMs < 1000 ? `${phase.durationMs}ms` : `${(phase.durationMs / 1000).toFixed(1)}s`}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground truncate">
                {phase.error || PHASE_DESCRIPTIONS[phase.name] || ""}
              </p>
            </div>

            {isActive && (
              <div className="flex items-center gap-1 shrink-0">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                <span className="text-[10px] text-primary font-medium">Running</span>
              </div>
            )}

            {idx < phases.length - 1 && (
              <ArrowRight className="w-3 h-3 text-muted-foreground/30 shrink-0 hidden sm:block" />
            )}
          </div>
        );
      })}
    </div>
  );
}

function RunHistory({ runs }: { runs: any[] }) {
  if (runs.length === 0) return null;

  return (
    <Card className="glass-card" data-testid="stream-run-history">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Clock className="w-4 h-4 text-muted-foreground" />
          Run History
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {runs.slice(0, 5).map((run: any) => (
          <div key={run.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/20 border border-border/30">
            <div className="flex items-center gap-2">
              <Badge variant={run.status === "completed" ? "default" : run.status === "running" ? "secondary" : "destructive"} className="text-[10px]">
                {run.status}
              </Badge>
              <span className="text-xs text-muted-foreground">
                Run #{run.id}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {run.metrics?.clipsExtracted != null && (
                <span>{run.metrics.clipsExtracted} clips</span>
              )}
              {run.totalDurationMs && (
                <span>{(run.totalDurationMs / 1000).toFixed(1)}s</span>
              )}
              {run.createdAt && (
                <span>{new Date(run.createdAt).toLocaleDateString()}</span>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function MetricCard({ label, value, icon: Icon, color = "text-primary" }: { label: string; value: string | number; icon: any; color?: string }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/20 border border-border/30 hover-lift">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center bg-primary/10 ${color}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <div className="text-lg font-bold">{value}</div>
        <div className="text-[11px] text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

export default function StreamLoop() {
  const { data: status, isLoading } = useQuery<any>({
    queryKey: ["/api/loops/stream/status"],
    refetchInterval: status?.isRunning ? 3000 : 15000,
  });

  const executeMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/loops/stream/execute"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/loops/stream/status"] }),
  });

  const cancelMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/loops/stream/cancel"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/loops/stream/status"] }),
  });

  const currentRun = status?.currentRun;
  const phases = currentRun?.phases || [];
  const metrics = currentRun?.metrics || {};
  const learnings = currentRun?.learnings || {};

  return (
    <div className="p-3 lg:p-4 space-y-4 max-w-6xl mx-auto page-enter" data-testid="page-stream-loop">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Radio className="w-5 h-5 text-primary" />
            <span className="gradient-text-vivid">Streaming Closed-Loop</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            9-phase autonomous pipeline: stream → clips → optimize → distribute → learn
          </p>
        </div>

        <div className="flex items-center gap-2">
          {status?.isRunning ? (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
              data-testid="button-cancel-stream-loop"
            >
              <Square className="w-3.5 h-3.5 mr-1.5" />
              Cancel
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => executeMutation.mutate()}
              disabled={executeMutation.isPending}
              className="glow-sm"
              data-testid="button-execute-stream-loop"
            >
              {executeMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5 mr-1.5" />
              )}
              Execute Loop
            </Button>
          )}
        </div>
      </div>

      {status?.isRunning && (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-primary/5 border border-primary/20">
          <Activity className="w-4 h-4 text-primary animate-pulse" />
          <span className="text-sm font-medium text-primary">
            Loop Active — Phase: {PHASE_LABELS[status.currentPhase] || status.currentPhase}
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Clips Extracted" value={metrics.clipsExtracted || 0} icon={Scissors} color="text-blue-400" />
        <MetricCard label="Shorts Generated" value={metrics.shortsGenerated || 0} icon={Film} color="text-purple-400" />
        <MetricCard label="Platforms Distributed" value={metrics.platformsDistributed || 0} icon={Share2} color="text-emerald-400" />
        <MetricCard label="Total Runs" value={status?.totalRuns || 0} icon={RefreshCw} color="text-amber-400" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card className="glass-card" data-testid="stream-pipeline-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" />
                Pipeline Phases
                {status?.isRunning && (
                  <Badge variant="secondary" className="text-[10px] ml-auto">
                    <Loader2 className="w-3 h-3 animate-spin mr-1" />
                    Processing
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {phases.length > 0 ? (
                <PhaseTimeline phases={phases} currentPhase={status?.currentPhase} />
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Radio className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No active pipeline. Click "Execute Loop" to start.</p>
                  <p className="text-xs mt-1">The loop will autonomously process your stream content through all 9 phases.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="glass-card" data-testid="stream-learnings-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Brain className="w-4 h-4 text-purple-400" />
                AI Learnings
              </CardTitle>
            </CardHeader>
            <CardContent>
              {learnings.improvements?.length > 0 ? (
                <ul className="space-y-1.5">
                  {learnings.improvements.map((imp: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <Sparkles className="w-3 h-3 text-primary mt-0.5 shrink-0" />
                      {imp}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Learnings will appear after the first complete cycle.
                </p>
              )}
            </CardContent>
          </Card>

          {currentRun && (
            <Card className="glass-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Activity className="w-4 h-4 text-emerald-400" />
                  Current Run
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>Status</span>
                  <Badge variant={currentRun.status === "running" ? "secondary" : "default"} className="text-[10px]">
                    {currentRun.status}
                  </Badge>
                </div>
                {currentRun.totalDurationMs && (
                  <div className="flex justify-between">
                    <span>Duration</span>
                    <span>{(currentRun.totalDurationMs / 1000).toFixed(1)}s</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Completed Phases</span>
                  <span>{phases.filter((p: any) => p.status === "completed").length}/{phases.length}</span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <RunHistory runs={status?.recentRuns || []} />
    </div>
  );
}
