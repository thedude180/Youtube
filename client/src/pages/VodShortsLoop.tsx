import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Search, TrendingDown, Type, FileText, Image, Scissors, Share2,
  BarChart3, Brain, Play, Square, CheckCircle2, AlertTriangle,
  Loader2, Zap, ArrowRight, Sparkles, Activity, Clock, Film,
  RefreshCw, Target, Eye, Power, Settings2, Upload, Repeat,
  CalendarClock, TrendingUp, Video, Clapperboard,
} from "lucide-react";

const PHASE_ICONS: Record<string, any> = {
  "content-scan": Search,
  "decay-detection": TrendingDown,
  "title-optimization": Type,
  "description-seo": FileText,
  "thumbnail-refresh": Image,
  "shorts-extraction": Scissors,
  "cross-platform-distribution": Share2,
  "performance-verification": BarChart3,
  "learning-adaptation": Brain,
};

const PHASE_LABELS: Record<string, string> = {
  "content-scan": "Content Scan",
  "decay-detection": "Decay Detection",
  "title-optimization": "Title Optimization",
  "description-seo": "Description & SEO",
  "thumbnail-refresh": "Thumbnail Refresh",
  "shorts-extraction": "Shorts Extraction",
  "cross-platform-distribution": "Cross-Platform Distribution",
  "performance-verification": "Performance Verification",
  "learning-adaptation": "Learning & Adaptation",
};

const PHASE_DESCRIPTIONS: Record<string, string> = {
  "content-scan": "Scan entire video library for optimization opportunities",
  "decay-detection": "Identify videos losing views, CTR, or search rankings",
  "title-optimization": "AI generates A/B test title variants for underperformers",
  "description-seo": "Optimize descriptions with keywords, timestamps, and CTAs",
  "thumbnail-refresh": "AI designs new thumbnail concepts for low-CTR videos",
  "shorts-extraction": "Extract the most viral moments as YouTube Shorts",
  "cross-platform-distribution": "Distribute Shorts to TikTok, Reels, and X",
  "performance-verification": "Verify optimizations are driving results",
  "learning-adaptation": "Learn winning patterns and adapt future strategies",
};

function PhaseTimeline({ phases, currentPhase }: { phases: any[]; currentPhase: string | null }) {
  return (
    <div className="space-y-1" data-testid="vod-phase-timeline">
      {phases.map((phase: any) => {
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
            data-testid={`vod-phase-${phase.name}`}
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
          </div>
        );
      })}
    </div>
  );
}

function RunHistory({ runs }: { runs: any[] }) {
  if (runs.length === 0) return null;
  return (
    <Card className="glass-card" data-testid="vod-run-history">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Clock className="w-4 h-4 text-muted-foreground" />
          One-Shot Run History
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {runs.slice(0, 5).map((run: any) => (
          <div key={run.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/20 border border-border/30">
            <div className="flex items-center gap-2">
              <Badge variant={run.status === "completed" ? "default" : run.status === "running" ? "secondary" : "destructive"} className="text-[10px]">
                {run.status}
              </Badge>
              <span className="text-xs text-muted-foreground">Run #{run.id}</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {run.videosOptimized != null && <span>{run.videosOptimized} optimized</span>}
              {run.shortsGenerated != null && <span>{run.shortsGenerated} shorts</span>}
              {run.totalDurationMs && <span>{(run.totalDurationMs / 1000).toFixed(1)}s</span>}
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

function formatNextCycle(nextCycleAt: string | null): string {
  if (!nextCycleAt) return "—";
  const diff = new Date(nextCycleAt).getTime() - Date.now();
  if (diff < 0) return "Starting soon";
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function AutopilotDashboard({ autopilot, onEnable, onDisable, onRunNow, isEnabling, isDisabling, isRunningNow }: {
  autopilot: any;
  onEnable: () => void;
  onDisable: () => void;
  onRunNow: () => void;
  isEnabling: boolean;
  isDisabling: boolean;
  isRunningNow: boolean;
}) {
  const isEnabled = autopilot?.enabled;
  const isRunning = autopilot?.currentStatus === "running";
  const hasError = autopilot?.currentStatus === "error";

  return (
    <div className="card-empire rounded-2xl p-5 relative overflow-hidden" data-testid="widget-vod-autopilot">
      <div className="data-grid-bg absolute inset-0 opacity-5 pointer-events-none" />
      <div className="relative">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isEnabled ? "bg-emerald-500/20" : "bg-muted/30"}`}
              style={isEnabled ? { boxShadow: "0 0 20px hsl(142 70% 50% / 0.3)" } : {}}>
              <Repeat className={`w-5 h-5 ${isEnabled ? "text-emerald-400" : "text-muted-foreground"}`} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white" data-testid="autopilot-title">VOD Continuous Autopilot</h2>
              <p className="text-xs text-muted-foreground">Always-on engine — edits and queues content 24/7</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {isEnabled && (
              <span className="text-xs font-mono text-emerald-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                LIVE
              </span>
            )}
            <div className="flex items-center gap-2">
              <Label htmlFor="autopilot-toggle" className="text-xs text-muted-foreground cursor-pointer">
                {isEnabled ? "ON" : "OFF"}
              </Label>
              <Switch
                id="autopilot-toggle"
                checked={isEnabled}
                onCheckedChange={isEnabled ? onDisable : onEnable}
                disabled={isEnabling || isDisabling}
                data-testid="switch-autopilot-toggle"
              />
            </div>
          </div>
        </div>

        {hasError && autopilot?.lastError && (
          <div className="mb-3 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400 font-mono" data-testid="autopilot-error">
            <AlertTriangle className="w-3.5 h-3.5 inline mr-1.5" />
            {autopilot.lastError}
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="p-3 rounded-xl bg-muted/20 border border-border/20 text-center" data-testid="stat-total-cycles">
            <div className="text-xl font-bold font-mono text-primary">{autopilot?.totalCyclesRun ?? 0}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">Cycles Run</div>
          </div>
          <div className="p-3 rounded-xl bg-muted/20 border border-border/20 text-center" data-testid="stat-total-longform">
            <div className="text-xl font-bold font-mono text-blue-400">{autopilot?.totalLongFormUploaded ?? 0}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">Long-Form Queued</div>
          </div>
          <div className="p-3 rounded-xl bg-muted/20 border border-border/20 text-center" data-testid="stat-total-shorts">
            <div className="text-xl font-bold font-mono text-purple-400">{autopilot?.totalShortsUploaded ?? 0}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">Shorts Queued</div>
          </div>
          <div className="p-3 rounded-xl bg-muted/20 border border-border/20 text-center" data-testid="stat-next-cycle">
            <div className="text-xl font-bold font-mono text-amber-400">{isEnabled ? formatNextCycle(autopilot?.nextCycleAt) : "—"}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">Next Cycle</div>
          </div>
        </div>

        {isEnabled && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4 p-3 rounded-xl bg-muted/10 border border-border/20" data-testid="autopilot-settings-display">
            <div className="text-center">
              <div className="text-sm font-bold font-mono text-white">{autopilot?.maxLongFormPerDay ?? 1}/day</div>
              <div className="text-[10px] text-muted-foreground">Long-Form Rate</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-bold font-mono text-white">{autopilot?.maxShortsPerDay ?? 3}/day</div>
              <div className="text-[10px] text-muted-foreground">Shorts Rate</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-bold font-mono text-white">Every {autopilot?.cycleIntervalHours ?? 6}h</div>
              <div className="text-[10px] text-muted-foreground">Cycle Interval</div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 mb-4">
          <div className="p-2.5 rounded-lg bg-muted/20 border border-border/20">
            <div className="text-[10px] text-muted-foreground mb-1">Today — Long-Form</div>
            <div className="flex items-center justify-between">
              <div className="h-1.5 flex-1 bg-muted/30 rounded-full overflow-hidden mr-2">
                <div className="h-full bg-blue-500/70 rounded-full transition-all"
                  style={{ width: `${Math.min(100, ((autopilot?.queuedToday?.longForm ?? 0) / (autopilot?.maxLongFormPerDay ?? 1)) * 100)}%` }} />
              </div>
              <span className="text-xs font-mono text-blue-400" data-testid="stat-today-longform">
                {autopilot?.queuedToday?.longForm ?? 0}/{autopilot?.maxLongFormPerDay ?? 1}
              </span>
            </div>
          </div>
          <div className="p-2.5 rounded-lg bg-muted/20 border border-border/20">
            <div className="text-[10px] text-muted-foreground mb-1">Today — Shorts</div>
            <div className="flex items-center justify-between">
              <div className="h-1.5 flex-1 bg-muted/30 rounded-full overflow-hidden mr-2">
                <div className="h-full bg-purple-500/70 rounded-full transition-all"
                  style={{ width: `${Math.min(100, ((autopilot?.queuedToday?.shorts ?? 0) / (autopilot?.maxShortsPerDay ?? 3)) * 100)}%` }} />
              </div>
              <span className="text-xs font-mono text-purple-400" data-testid="stat-today-shorts">
                {autopilot?.queuedToday?.shorts ?? 0}/{autopilot?.maxShortsPerDay ?? 3}
              </span>
            </div>
          </div>
        </div>

        {isEnabled && (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={onRunNow}
              disabled={isRunning || isRunningNow}
              className="flex-1 text-xs"
              data-testid="button-run-now"
            >
              {isRunning || isRunningNow ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <Zap className="w-3.5 h-3.5 mr-1.5" />
              )}
              {isRunning ? "Running..." : "Run Cycle Now"}
            </Button>
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono ${
              isRunning ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" :
              "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
            }`} data-testid="autopilot-status-badge">
              {isRunning ? (
                <><Loader2 className="w-3 h-3 animate-spin" /> Working</>
              ) : (
                <><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Idle</>
              )}
            </div>
          </div>
        )}

        {!isEnabled && (
          <Button
            onClick={onEnable}
            disabled={isEnabling}
            className="w-full"
            style={{ boxShadow: "0 0 20px hsl(265 80% 60% / 0.3)" }}
            data-testid="button-enable-autopilot"
          >
            {isEnabling ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Power className="w-4 h-4 mr-2" />}
            Enable VOD Autopilot
          </Button>
        )}
      </div>
    </div>
  );
}

function HowItWorks() {
  const steps = [
    { icon: Search, label: "Scan Library", desc: "Finds all videos not yet in the queue", color: "text-blue-400" },
    { icon: Brain, label: "AI Edit", desc: "Optimises title, description, tags, thumbnail concept", color: "text-purple-400" },
    { icon: Scissors, label: "Extract Shorts", desc: "Identifies 3 viral moments per top video", color: "text-pink-400" },
    { icon: CalendarClock, label: "Human-Pace Schedule", desc: "Spreads uploads 2–8 hrs apart, 10am–10pm", color: "text-amber-400" },
    { icon: Upload, label: "Auto-Queue", desc: "Drops into Autopilot queue for publish verification", color: "text-emerald-400" },
    { icon: Repeat, label: "Repeat Every 6h", desc: "Cycle auto-restarts with randomised jitter", color: "text-cyan-400" },
  ];
  return (
    <Card className="glass-card" data-testid="card-how-it-works">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-primary" />
          How the Continuous Engine Works
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {steps.map((step, i) => (
            <div key={i} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-muted/20 border border-border/20" data-testid={`how-step-${i}`}>
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center bg-muted/30 shrink-0 ${step.color}`}>
                <step.icon className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="text-xs font-semibold text-white">{step.label}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">{step.desc}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 p-2.5 rounded-lg bg-primary/5 border border-primary/20 text-xs text-muted-foreground">
          <strong className="text-primary">Completely separate from streaming.</strong> The VOD Autopilot never touches live pipeline data — it only pulls from your existing video library and creates new Shorts independently.
        </div>
      </CardContent>
    </Card>
  );
}

export default function VodShortsLoop() {
  const { data: status, isLoading: statusLoading } = useQuery<any>({
    queryKey: ["/api/loops/vod-shorts/status"],
    refetchInterval: (query) => query.state.data?.isRunning ? 3000 : 15000,
  });

  const { data: autopilot, isLoading: autopilotLoading } = useQuery<any>({
    queryKey: ["/api/vod-autopilot/status"],
    refetchInterval: (query) => {
      const d = query.state.data;
      return d?.enabled && d?.currentStatus === "running" ? 5000 : 15000;
    },
  });

  const executeMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/loops/vod-shorts/execute"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/loops/vod-shorts/status"] }),
  });

  const cancelMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/loops/vod-shorts/cancel"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/loops/vod-shorts/status"] }),
  });

  const enableMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/vod-autopilot/enable", {
      maxLongFormPerDay: 1,
      maxShortsPerDay: 3,
      targetPlatforms: ["youtube"],
      cycleIntervalHours: 6,
      minHoursBetweenUploads: 2,
      maxHoursBetweenUploads: 8,
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/vod-autopilot/status"] }),
  });

  const disableMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/vod-autopilot/disable"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/vod-autopilot/status"] }),
  });

  const runNowMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/vod-autopilot/run-now"),
    onSuccess: () => {
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ["/api/vod-autopilot/status"] }), 1000);
    },
  });

  const currentRun = status?.currentRun;
  const phases = currentRun?.phases || [];
  const metrics = currentRun?.metrics || {};
  const learnings = currentRun?.learnings || {};

  return (
    <div className="p-3 lg:p-4 space-y-4 max-w-6xl mx-auto page-enter" data-testid="page-vod-shorts-loop">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Clapperboard className="w-5 h-5 text-purple-400" />
            <span className="holographic-text">VOD & Shorts Pipeline</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Continuous autopilot + one-shot 9-phase optimizer — always producing content
          </p>
        </div>
      </div>

      {autopilotLoading ? (
        <div className="h-48 rounded-2xl bg-muted/20 border border-border/20 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <AutopilotDashboard
          autopilot={autopilot}
          onEnable={() => enableMutation.mutate()}
          onDisable={() => disableMutation.mutate()}
          onRunNow={() => runNowMutation.mutate()}
          isEnabling={enableMutation.isPending}
          isDisabling={disableMutation.isPending}
          isRunningNow={runNowMutation.isPending}
        />
      )}

      <HowItWorks />

      <div className="border-t border-border/20 pt-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
            <Zap className="w-4 h-4" />
            One-Shot Optimizer (Manual)
          </h2>
          <div className="flex items-center gap-2">
            {status?.isRunning ? (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => cancelMutation.mutate()}
                disabled={cancelMutation.isPending}
                data-testid="button-cancel-vod-loop"
              >
                <Square className="w-3.5 h-3.5 mr-1.5" />
                Cancel
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => executeMutation.mutate()}
                disabled={executeMutation.isPending}
                variant="outline"
                data-testid="button-execute-vod-loop"
              >
                {executeMutation.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5 mr-1.5" />
                )}
                Run One-Shot Loop
              </Button>
            )}
          </div>
        </div>

        {status?.isRunning && (
          <div className="flex items-center gap-2 p-2 rounded-lg bg-purple-500/5 border border-purple-500/20 mb-3">
            <Activity className="w-4 h-4 text-purple-400 animate-pulse" />
            <span className="text-sm font-medium text-purple-400">
              Loop Active — Phase: {PHASE_LABELS[status.currentPhase] || status.currentPhase}
            </span>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
          <MetricCard label="Videos Analyzed" value={currentRun?.videosAnalyzed || 0} icon={Eye} color="text-blue-400" />
          <MetricCard label="Videos Optimized" value={currentRun?.videosOptimized || 0} icon={Target} color="text-emerald-400" />
          <MetricCard label="Shorts Created" value={currentRun?.shortsGenerated || 0} icon={Scissors} color="text-purple-400" />
          <MetricCard label="Distributed" value={metrics.distributionCount || 0} icon={Share2} color="text-amber-400" />
          <MetricCard label="Total Runs" value={status?.totalRuns || 0} icon={RefreshCw} color="text-cyan-400" />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Card className="glass-card" data-testid="vod-pipeline-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Zap className="w-4 h-4 text-purple-400" />
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
                    <Film className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">No active one-shot loop. Use the Continuous Autopilot above for always-on operation.</p>
                    <p className="text-xs mt-1">Or click "Run One-Shot Loop" to manually trigger a single 9-phase cycle.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card className="glass-card" data-testid="vod-learnings-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Brain className="w-4 h-4 text-purple-400" />
                  AI Learnings
                </CardTitle>
              </CardHeader>
              <CardContent>
                {learnings.winningTitlePatterns?.length > 0 || learnings.patterns?.length > 0 ? (
                  <div className="space-y-3">
                    {learnings.winningTitlePatterns?.length > 0 && (
                      <div>
                        <h4 className="text-[11px] font-semibold text-muted-foreground mb-1">Winning Title Patterns</h4>
                        <ul className="space-y-1">
                          {learnings.winningTitlePatterns.map((p: string, i: number) => (
                            <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                              <Sparkles className="w-3 h-3 text-purple-400 mt-0.5 shrink-0" />
                              {p}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {learnings.topKeywords?.length > 0 && (
                      <div>
                        <h4 className="text-[11px] font-semibold text-muted-foreground mb-1">Top Keywords</h4>
                        <div className="flex flex-wrap gap-1">
                          {learnings.topKeywords.map((kw: string, i: number) => (
                            <Badge key={i} variant="outline" className="text-[10px]">{kw}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Learnings will appear after the first complete optimization cycle.
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
                  {metrics.decayDetected != null && (
                    <div className="flex justify-between">
                      <span>Decay Detected</span>
                      <span className="text-amber-400">{metrics.decayDetected} videos</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      <RunHistory runs={status?.recentRuns || []} />
    </div>
  );
}
