import { useDashboardStats } from "@/hooks/use-dashboard";
import { useAuth } from "@/hooks/use-auth";
import { MetricCard } from "@/components/MetricCard";
import { StatusBadge } from "@/components/StatusBadge";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Activity,
  AlertTriangle,
  Film,
  ArrowRight,
  Shield,
  Rocket,
  Lightbulb,
  MessageSquare,
  DollarSign,
  Calendar,
  Users,
  Zap,
  Bot,
  MonitorPlay,
  CheckCircle2,
  TrendingUp,
  Play,
  Pause,
  RotateCw,
  Clock,
  Target,
  Loader2,
  CalendarPlus,
  RefreshCw,
} from "lucide-react";
import { useJobs } from "@/hooks/use-jobs";
import { useAuditLogs } from "@/hooks/use-audit-logs";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { useEffect } from "react";

export default function Dashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: stats, isLoading: statsLoading } = useDashboardStats();
  const { data: jobs, isLoading: jobsLoading } = useJobs();
  const { data: auditLogs } = useAuditLogs();
  const { data: agentStatus } = useQuery<any[]>({ queryKey: ['/api/agents/status'] });
  const { data: engineStatus, refetch: refetchEngine } = useQuery<any>({
    queryKey: ['/api/backlog/engine-status'],
    refetchInterval: 5000,
  });
  const { data: videoScores } = useQuery<any[]>({ queryKey: ['/api/backlog/video-scores'] });

  const autoStartMutation = useMutation({
    mutationFn: async (mode: string) => {
      const res = await apiRequest("POST", "/api/backlog/auto-start", { mode });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/backlog/engine-status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/agents/activities'] });
      if (data.alreadyRunning) {
        toast({ title: "Already processing", description: "Your backlog is being optimized right now." });
      } else {
        toast({ title: "Processing started", description: `${data.totalVideos} videos queued for AI optimization.` });
      }
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const pauseMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/backlog/pause", {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/backlog/engine-status'] });
      toast({ title: "Processing paused", description: "Backlog processing has been paused." });
    },
  });

  const resumeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/backlog/resume", {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/backlog/engine-status'] });
      toast({ title: "Processing resumed", description: "Backlog processing has resumed." });
    },
  });

  const autoScheduleMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/backlog/auto-schedule", {});
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/schedule'] });
      toast({ title: "Content scheduled", description: `${data.scheduled} social posts auto-scheduled across platforms.` });
    },
  });

  useEffect(() => {
    if (user && engineStatus?.state === "idle" && engineStatus?.pendingVideos > 0) {
      autoStartMutation.mutate("deep");
    }
  }, [user, engineStatus?.state, engineStatus?.pendingVideos]);

  const activeJobs =
    jobs?.filter((j) => ["processing", "pending"].includes(j.status)).slice(0, 5) || [];
  const recentLogs = auditLogs?.slice(0, 6) || [];
  const activeAgents = agentStatus?.filter((a: any) => a.status === 'active') || [];

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  const userName = user
    ? [user.firstName, user.lastName].filter(Boolean).join(" ") || "Creator"
    : "Creator";

  const isProcessing = engineStatus?.state === "processing";
  const isStreamActive = engineStatus?.state === "stream_active";
  const isPaused = engineStatus?.state === "paused";

  if (statsLoading) return <DashboardSkeleton />;

  return (
    <div className="p-8 space-y-8 max-w-[1600px] mx-auto animate-in fade-in duration-500">
      <div className="flex justify-between items-end gap-4 flex-wrap">
        <div>
          <h1 data-testid="text-page-title" className="text-3xl font-display font-bold text-foreground">
            {greeting()}, {userName}
          </h1>
          <p className="text-muted-foreground mt-2">
            {isProcessing
              ? "Your AI team is optimizing your content library right now."
              : isStreamActive
                ? "Agents are supporting your live stream."
                : isPaused
                  ? "Processing is paused. Resume anytime."
                  : "Your AI team is ready. Here's the overview."}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="px-3 py-1.5">
            <Bot className="w-3.5 h-3.5 mr-1.5" />
            {activeAgents.length}/10 Agents Active
          </Badge>
          {engineStatus && (
            <Badge
              variant={isProcessing ? "default" : isStreamActive ? "destructive" : "secondary"}
              className="px-3 py-1.5"
            >
              {isProcessing && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              {isStreamActive && <MonitorPlay className="w-3.5 h-3.5 mr-1.5" />}
              {isPaused && <Pause className="w-3.5 h-3.5 mr-1.5" />}
              {isProcessing ? "Processing Backlog" : isStreamActive ? "Live Stream Mode" : isPaused ? "Paused" : "Idle"}
            </Badge>
          )}
        </div>
      </div>

      {engineStatus && (engineStatus.totalVideos > 0) && (
        <Card data-testid="card-backlog-progress">
          <CardContent className="p-5">
            <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-500/10">
                  <Target className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm">AI Processing Engine</h3>
                  <p className="text-xs text-muted-foreground">
                    {engineStatus.optimizedVideos} of {engineStatus.totalVideos} videos fully optimized
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {isProcessing && (
                  <>
                    <Badge variant="secondary" className="shrink-0">
                      <Clock className="w-3 h-3 mr-1" />
                      ~{engineStatus.estimatedTimeRemaining} remaining
                    </Badge>
                    <Button
                      data-testid="button-pause-processing"
                      size="sm"
                      variant="outline"
                      onClick={() => pauseMutation.mutate()}
                      disabled={pauseMutation.isPending}
                    >
                      <Pause className="w-3.5 h-3.5 mr-1" />
                      Pause
                    </Button>
                  </>
                )}
                {isPaused && (
                  <Button
                    data-testid="button-resume-processing"
                    size="sm"
                    variant="outline"
                    onClick={() => resumeMutation.mutate()}
                    disabled={resumeMutation.isPending}
                  >
                    <Play className="w-3.5 h-3.5 mr-1" />
                    Resume
                  </Button>
                )}
                {!isProcessing && !isPaused && !isStreamActive && engineStatus.pendingVideos > 0 && (
                  <Button
                    data-testid="button-start-processing"
                    size="sm"
                    onClick={() => autoStartMutation.mutate("deep")}
                    disabled={autoStartMutation.isPending}
                  >
                    {autoStartMutation.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                    ) : (
                      <Play className="w-3.5 h-3.5 mr-1" />
                    )}
                    Start Processing
                  </Button>
                )}
                <Button
                  data-testid="button-auto-schedule"
                  size="sm"
                  variant="outline"
                  onClick={() => autoScheduleMutation.mutate()}
                  disabled={autoScheduleMutation.isPending}
                >
                  {autoScheduleMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                  ) : (
                    <CalendarPlus className="w-3.5 h-3.5 mr-1" />
                  )}
                  Auto-Schedule
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex-1 h-3 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-700 rounded-full"
                    style={{ width: `${Math.round((engineStatus.optimizedVideos / Math.max(engineStatus.totalVideos, 1)) * 100)}%` }}
                  />
                </div>
                <span className="text-sm font-medium min-w-[3rem] text-right">
                  {Math.round((engineStatus.optimizedVideos / Math.max(engineStatus.totalVideos, 1)) * 100)}%
                </span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="flex items-center gap-2 p-2 rounded-lg bg-emerald-500/5">
                  <div className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span className="text-xs text-muted-foreground">Excellent</span>
                  <span className="text-xs font-semibold ml-auto">{engineStatus.scores?.excellent || 0}</span>
                </div>
                <div className="flex items-center gap-2 p-2 rounded-lg bg-blue-500/5">
                  <div className="w-2 h-2 rounded-full bg-blue-400" />
                  <span className="text-xs text-muted-foreground">Good</span>
                  <span className="text-xs font-semibold ml-auto">{engineStatus.scores?.good || 0}</span>
                </div>
                <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-500/5">
                  <div className="w-2 h-2 rounded-full bg-amber-400" />
                  <span className="text-xs text-muted-foreground">Fair</span>
                  <span className="text-xs font-semibold ml-auto">{engineStatus.scores?.fair || 0}</span>
                </div>
                <div className="flex items-center gap-2 p-2 rounded-lg bg-red-500/5">
                  <div className="w-2 h-2 rounded-full bg-red-400" />
                  <span className="text-xs text-muted-foreground">Needs Work</span>
                  <span className="text-xs font-semibold ml-auto">{engineStatus.scores?.poor || 0}</span>
                </div>
              </div>

              {isProcessing && engineStatus.currentChain && (
                <div className="p-3 rounded-lg bg-secondary/50 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Processing Chain</p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {engineStatus.currentChain.steps?.map((step: any, i: number) => (
                      <Badge
                        key={i}
                        variant={step.status === "completed" ? "default" : step.status === "running" ? "secondary" : "outline"}
                      >
                        {step.status === "running" && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                        {step.status === "completed" && <CheckCircle2 className="w-3 h-3 mr-1" />}
                        {step.agentId.replace('_', ' ')}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <MetricCard
          title="Total Videos"
          value={stats?.totalVideos || 0}
          icon={Film}
          description="In your content library"
          data-testid="metric-total-videos"
        />
        <MetricCard
          title="Risk Score"
          value={stats?.riskScore || 0}
          icon={AlertTriangle}
          className={
            stats?.riskScore && stats.riskScore > 50 ? "border-amber-500/50 bg-amber-500/5" : ""
          }
          description={`${
            stats?.riskScore && stats.riskScore <= 25
              ? "Safe"
              : stats?.riskScore && stats.riskScore <= 50
                ? "Moderate"
                : "High"
          } risk level`}
          data-testid="metric-risk-score"
        />
        <MetricCard
          title="Compliance"
          value={`${stats?.complianceScore || 100}%`}
          icon={Shield}
          description="Platform rule adherence"
          data-testid="metric-compliance"
        />
        <MetricCard
          title="Revenue"
          value={`$${(stats?.totalRevenue || 0).toLocaleString('en-US', { minimumFractionDigits: 0 })}`}
          icon={DollarSign}
          description="Total earnings tracked"
          data-testid="metric-revenue"
        />
        <MetricCard
          title="Scheduled"
          value={stats?.scheduledItems || 0}
          icon={Calendar}
          description="Upcoming content"
          data-testid="metric-scheduled"
        />
      </div>

      {agentStatus && agentStatus.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xl font-bold font-display">AI Team Status</h2>
            <Link href="/team" className="text-sm text-primary hover:text-primary/80 flex items-center gap-1 font-medium">
              Manage Team <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {agentStatus.slice(0, 10).map((agent: any) => (
              <Card key={agent.id} data-testid={`card-dashboard-agent-${agent.id}`}>
                <CardContent className="p-3 flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${agent.status === 'active' ? 'bg-green-400' : 'bg-muted-foreground/30'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate">{agent.name}</p>
                    <p className="text-[10px] text-muted-foreground">{agent.todayActions} today</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Link href="/team">
          <Card data-testid="card-quicklink-team" className="hover-elevate cursor-pointer">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10">
                <Bot className="w-5 h-5 text-purple-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">AI Team</p>
                <p className="text-xs text-muted-foreground">10 agents</p>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
        <Link href="/schedule">
          <Card data-testid="card-quicklink-schedule" className="hover-elevate cursor-pointer">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Calendar className="w-5 h-5 text-blue-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">Schedule</p>
                <p className="text-xs text-muted-foreground">Content calendar</p>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
        <Link href="/monetization">
          <Card data-testid="card-quicklink-monetization" className="hover-elevate cursor-pointer">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <DollarSign className="w-5 h-5 text-green-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">Revenue</p>
                <p className="text-xs text-muted-foreground">Monetization</p>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
        <Link href="/stream">
          <Card data-testid="card-quicklink-stream" className="hover-elevate cursor-pointer">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-500/10">
                <MonitorPlay className="w-5 h-5 text-red-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">Stream</p>
                <p className="text-xs text-muted-foreground">Go live</p>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
        <Link href="/advisor">
          <Card data-testid="card-quicklink-advisor" className="hover-elevate cursor-pointer">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <MessageSquare className="w-5 h-5 text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">Advisor</p>
                <p className="text-xs text-muted-foreground">Ask anything</p>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
      </div>

      {videoScores && videoScores.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xl font-bold font-display">Content Optimization Scores</h2>
            <Link href="/backlog" className="text-sm text-primary hover:text-primary/80 flex items-center gap-1 font-medium">
              View All <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <Card>
            <div className="divide-y divide-border/50">
              {videoScores.slice(0, 8).map((video: any) => (
                <div key={video.id} data-testid={`row-score-${video.id}`} className="p-3 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{video.title}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <Badge variant="secondary">{video.platform}</Badge>
                      <Badge variant="secondary">{video.type}</Badge>
                      {video.needsReoptimization && (
                        <Badge variant="destructive">
                          <RefreshCw className="w-3 h-3 mr-1" />
                          Stale
                        </Badge>
                      )}
                      {video.chainCompleted && (
                        <Badge variant="default">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Full Chain
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="w-16 h-2 bg-secondary rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          video.optimizationScore >= 80 ? 'bg-emerald-500' :
                          video.optimizationScore >= 60 ? 'bg-blue-500' :
                          video.optimizationScore >= 30 ? 'bg-amber-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${video.optimizationScore}%` }}
                      />
                    </div>
                    <span className={`text-xs font-bold min-w-[2rem] text-right ${
                      video.optimizationScore >= 80 ? 'text-emerald-400' :
                      video.optimizationScore >= 60 ? 'text-blue-400' :
                      video.optimizationScore >= 30 ? 'text-amber-400' : 'text-red-400'
                    }`}>
                      {video.optimizationScore}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xl font-bold font-display">Active Operations</h2>
            <Link
              href="/jobs"
              className="text-sm text-primary hover:text-primary/80 flex items-center gap-1 font-medium"
            >
              View All <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <Card>
            {jobsLoading ? (
              <CardContent className="p-8 space-y-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </CardContent>
            ) : activeJobs.length === 0 ? (
              <CardContent className="p-12 text-center text-muted-foreground flex flex-col items-center">
                <Activity className="h-12 w-12 opacity-20 mb-4" />
                <p>No active jobs processing.</p>
                <p className="text-sm opacity-60">System is idle and ready.</p>
              </CardContent>
            ) : (
              <div className="divide-y divide-border/50">
                {activeJobs.map((job) => (
                  <div
                    key={job.id}
                    data-testid={`row-job-${job.id}`}
                    className="p-4 flex items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="h-10 w-10 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                        <Activity className="h-5 w-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm capitalize">{job.type.replace(/_/g, " ")}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="h-1.5 w-24 bg-secondary rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary transition-all duration-500"
                              style={{ width: `${job.progress || 0}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground">{job.progress}%</span>
                        </div>
                      </div>
                    </div>
                    <StatusBadge status={job.status} />
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <h2 className="text-xl font-bold font-display">Recent Activity</h2>
          <Card>
            <CardContent className="p-4 space-y-3">
              {recentLogs.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No recent activity</p>
              ) : (
                recentLogs.map((log) => (
                  <div key={log.id} data-testid={`row-audit-${log.id}`} className="flex items-start gap-3">
                    <div
                      className={`h-2 w-2 rounded-full mt-1.5 shrink-0 ${
                        log.riskLevel === "high"
                          ? "bg-red-400"
                          : log.riskLevel === "medium"
                            ? "bg-amber-400"
                            : "bg-green-400"
                      }`}
                    />
                    <div className="min-w-0">
                      <p className="text-sm text-foreground truncate">
                        {log.action
                          .replace(/_/g, " ")
                          .replace(/\b\w/g, (l: string) => l.toUpperCase())}
                      </p>
                      {log.target && (
                        <p className="text-xs text-muted-foreground truncate">{log.target}</p>
                      )}
                      <p className="text-xs text-muted-foreground/60">
                        {log.createdAt ? format(new Date(log.createdAt), "MMM d, h:mm a") : ""}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="p-8 space-y-8">
      <div className="flex justify-between">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-10 w-32" />
      </div>
      <Skeleton className="h-32 w-full rounded-xl" />
      <div className="grid grid-cols-5 gap-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
