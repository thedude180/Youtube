import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Film, Share2, Search, BarChart3, Palette, DollarSign, Scale,
  Users, Briefcase, TrendingUp, Zap, Clock, CheckCircle2, Loader2,
  Play, Pause, Target, RefreshCw, CalendarPlus,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { useEffect, useRef } from "react";

const AGENT_ICONS: Record<string, any> = {
  editor: Film, social_manager: Share2, seo_director: Search,
  analytics_director: BarChart3, brand_strategist: Palette, ad_buyer: DollarSign,
  legal_advisor: Scale, community_manager: Users, business_manager: Briefcase,
  growth_strategist: TrendingUp,
};

const AGENT_COLORS: Record<string, string> = {
  editor: "bg-red-500/10 text-red-400",
  social_manager: "bg-blue-500/10 text-blue-400",
  seo_director: "bg-green-500/10 text-green-400",
  analytics_director: "bg-purple-500/10 text-purple-400",
  brand_strategist: "bg-pink-500/10 text-pink-400",
  ad_buyer: "bg-amber-500/10 text-amber-400",
  legal_advisor: "bg-cyan-500/10 text-cyan-400",
  community_manager: "bg-indigo-500/10 text-indigo-400",
  business_manager: "bg-orange-500/10 text-orange-400",
  growth_strategist: "bg-emerald-500/10 text-emerald-400",
};

export default function AITeam() {
  const { toast } = useToast();
  const prevActivityCount = useRef(0);

  const { data: agents, isLoading } = useQuery<any[]>({
    queryKey: ['/api/agents/status'],
    refetchInterval: 5000,
  });
  const { data: activities } = useQuery<any[]>({
    queryKey: ['/api/agents/activities'],
    refetchInterval: 5000,
  });
  const { data: engineStatus } = useQuery<any>({
    queryKey: ['/api/backlog/engine-status'],
    refetchInterval: 5000,
  });

  useEffect(() => {
    if (activities && activities.length > prevActivityCount.current && prevActivityCount.current > 0) {
      const newest = activities[0];
      if (newest) {
        toast({
          title: `${newest.agentId?.replace('_', ' ')} completed`,
          description: newest.action,
        });
      }
    }
    prevActivityCount.current = activities?.length || 0;
  }, [activities?.length]);

  const triggerMutation = useMutation({
    mutationFn: async (agentId: string) => {
      const res = await apiRequest("POST", `/api/agents/${agentId}/trigger`, {});
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/agents/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/agents/activities'] });
      toast({ title: "Agent task completed", description: data.activity?.action || "Task finished" });
    },
    onError: (err: any) => {
      toast({ title: "Agent error", description: err.message, variant: "destructive" });
    },
  });

  const autoStartMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/backlog/auto-start", { mode: "deep" });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/backlog/engine-status'] });
      toast({ title: "Processing started", description: `${data.totalVideos} videos queued for optimization.` });
    },
  });

  const pauseMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/backlog/pause", {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/backlog/engine-status'] });
      toast({ title: "Processing paused" });
    },
  });

  const resumeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/backlog/resume", {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/backlog/engine-status'] });
      toast({ title: "Processing resumed" });
    },
  });

  const activeCount = agents?.filter((a: any) => a.status === 'active').length || 0;
  const totalActions = agents?.reduce((sum: number, a: any) => sum + (a.totalActions || 0), 0) || 0;
  const todayActions = agents?.reduce((sum: number, a: any) => sum + (a.todayActions || 0), 0) || 0;

  const isProcessing = engineStatus?.state === "processing";
  const isPaused = engineStatus?.state === "paused";
  const isStreamActive = engineStatus?.state === "stream_active";

  if (isLoading) return <TeamSkeleton />;

  return (
    <div className="p-8 space-y-8 max-w-[1600px] mx-auto animate-in fade-in duration-500">
      <div className="flex justify-between items-end gap-4 flex-wrap">
        <div>
          <h1 data-testid="text-page-title" className="text-3xl font-display font-bold">AI Team</h1>
          <p className="text-muted-foreground mt-2">Your 10 autonomous AI agents working 24/7</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Badge variant="outline" className="px-3 py-1.5">
            <Zap className="w-3.5 h-3.5 mr-1.5" />
            {activeCount}/10 Active
          </Badge>
          <Badge variant="outline" className="px-3 py-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
            {todayActions} Actions Today
          </Badge>
        </div>
      </div>

      {engineStatus && (
        <Card data-testid="card-engine-control">
          <CardContent className="p-4 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${isProcessing ? 'bg-purple-500/10' : isStreamActive ? 'bg-red-500/10' : 'bg-secondary'}`}>
                <Target className={`w-5 h-5 ${isProcessing ? 'text-purple-400' : isStreamActive ? 'text-red-400' : 'text-muted-foreground'}`} />
              </div>
              <div>
                <p className="text-sm font-medium">
                  {isProcessing ? "Processing Backlog" : isStreamActive ? "Live Stream Support" : isPaused ? "Processing Paused" : "Engine Idle"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {isProcessing
                    ? `${engineStatus.processedCount} of ${engineStatus.totalVideos} videos processed (${engineStatus.progress}%)`
                    : isStreamActive
                      ? "Agents supporting live stream"
                      : `${engineStatus.pendingVideos} videos need optimization`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isProcessing && (
                <>
                  <Badge variant="secondary">
                    <Clock className="w-3 h-3 mr-1" />
                    ~{engineStatus.estimatedTimeRemaining}
                  </Badge>
                  <Button size="sm" variant="outline" onClick={() => pauseMutation.mutate()} disabled={pauseMutation.isPending}>
                    <Pause className="w-3.5 h-3.5 mr-1" />Pause
                  </Button>
                </>
              )}
              {isPaused && (
                <Button size="sm" variant="outline" onClick={() => resumeMutation.mutate()} disabled={resumeMutation.isPending}>
                  <Play className="w-3.5 h-3.5 mr-1" />Resume
                </Button>
              )}
              {!isProcessing && !isPaused && !isStreamActive && engineStatus.pendingVideos > 0 && (
                <Button size="sm" onClick={() => autoStartMutation.mutate()} disabled={autoStartMutation.isPending}>
                  {autoStartMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Play className="w-3.5 h-3.5 mr-1" />}
                  Start Processing
                </Button>
              )}
            </div>
          </CardContent>
          {isProcessing && (
            <div className="px-4 pb-4">
              <div className="h-2 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-700 rounded-full"
                  style={{ width: `${engineStatus.progress}%` }}
                />
              </div>
            </div>
          )}
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {(agents || []).map((agent: any) => {
          const Icon = AGENT_ICONS[agent.id] || Zap;
          const colorClass = AGENT_COLORS[agent.id] || "bg-primary/10 text-primary";
          const isRunning = triggerMutation.isPending && triggerMutation.variables === agent.id;

          return (
            <Card key={agent.id} data-testid={`card-agent-${agent.id}`}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`p-2.5 rounded-lg shrink-0 ${colorClass}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 data-testid={`text-agent-name-${agent.id}`} className="font-semibold text-sm">{agent.name}</h3>
                      <p className="text-xs text-muted-foreground truncate">{agent.role}</p>
                    </div>
                  </div>
                  <Badge variant={agent.status === 'active' ? 'default' : 'secondary'} className="shrink-0">
                    {agent.status === 'active' ? 'Active' : 'Idle'}
                  </Badge>
                </div>

                <div className="space-y-2 mb-4">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Today</span>
                    <span className="font-medium">{agent.todayActions} actions</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Total</span>
                    <span className="font-medium">{agent.totalActions} actions</span>
                  </div>
                  {agent.lastActivity && (
                    <div className="text-xs text-muted-foreground mt-2 p-2 rounded bg-secondary/50">
                      <div className="flex items-center gap-1 mb-1">
                        <Clock className="w-3 h-3" />
                        <span>
                          {agent.lastActivity.time
                            ? format(new Date(agent.lastActivity.time), "MMM d, h:mm a")
                            : "Recently"}
                        </span>
                      </div>
                      <p className="truncate">{agent.lastActivity.action}</p>
                    </div>
                  )}
                </div>

                <Button
                  data-testid={`button-trigger-${agent.id}`}
                  variant="outline"
                  className="w-full"
                  disabled={isRunning}
                  onClick={() => triggerMutation.mutate(agent.id)}
                >
                  {isRunning ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Working...
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4 mr-2" />
                      Run Task
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xl font-bold font-display">Recent Agent Activity</h2>
          {activities && activities.length > 0 && (
            <Badge variant="outline" className="px-3 py-1.5">
              <RefreshCw className="w-3 h-3 mr-1.5" />
              Auto-refreshing
            </Badge>
          )}
        </div>
        <Card>
          {!activities || activities.length === 0 ? (
            <CardContent className="p-12 text-center text-muted-foreground">
              <Users className="w-12 h-12 mx-auto opacity-20 mb-4" />
              <p>No agent activity yet.</p>
              <p className="text-sm opacity-60">Trigger an agent above or start backlog processing to get started.</p>
            </CardContent>
          ) : (
            <div className="divide-y divide-border/50">
              {activities.slice(0, 30).map((activity: any) => {
                const Icon = AGENT_ICONS[activity.agentId] || Zap;
                const colorClass = AGENT_COLORS[activity.agentId] || "bg-primary/10 text-primary";
                return (
                  <div key={activity.id} data-testid={`row-activity-${activity.id}`} className="p-4 flex items-start gap-4">
                    <div className={`p-2 rounded-lg shrink-0 ${colorClass}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{activity.action}</span>
                        <Badge variant="secondary">{activity.agentId.replace(/_/g, ' ')}</Badge>
                      </div>
                      {activity.target && (
                        <p className="text-xs text-muted-foreground mt-1">{activity.target}</p>
                      )}
                      {activity.details?.description && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{activity.details.description}</p>
                      )}
                      {activity.details?.impact && (
                        <p className="text-xs text-green-400 mt-1">{activity.details.impact}</p>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {activity.createdAt ? format(new Date(activity.createdAt), "h:mm a") : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function TeamSkeleton() {
  return (
    <div className="p-8 space-y-8">
      <Skeleton className="h-10 w-48" />
      <Skeleton className="h-20 w-full rounded-xl" />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-48 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
