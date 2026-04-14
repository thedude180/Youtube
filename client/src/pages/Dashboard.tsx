import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { formatDistanceToNow } from "date-fns";
import {
  Users, Video, Eye, DollarSign, TrendingUp, CheckCircle2,
  Clock, AlertCircle, Sparkles, Radio, AlertTriangle, ExternalLink, RefreshCw, Loader2, X,
  Activity,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { FirstLiveMission } from "@/components/FirstLiveMission";
import { AgentUIPayloadCard } from "@/components/AgentUIPayloadCard";
import DailyBriefingSection from "./dashboard/DailyBriefingSection";
import AudienceGrowthSection from "./dashboard/AudienceGrowthSection";


const AGENT_ROSTER = [
  { id: "owner",      name: "Jordan Blake",    role: "CEO / AI Owner",        initials: "JB", color: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
  { id: "admin",      name: "Priya Sharma",    role: "Ops Engineer",          initials: "PS", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  { id: "research",   name: "Tomás Rivera",    role: "Research Lead",         initials: "TR", color: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30" },
  { id: "scriptwriter",name: "Nia Okafor",     role: "Scriptwriter",          initials: "NO", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  { id: "editor",     name: "Kenji Watanabe",  role: "Video Editor",          initials: "KW", color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  { id: "thumbnail",  name: "Sofia Vasquez",   role: "Thumbnail Designer",    initials: "SV", color: "bg-pink-500/20 text-pink-400 border-pink-500/30" },
  { id: "seo",        name: "Arjun Mehta",     role: "SEO Manager",           initials: "AM", color: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
  { id: "shorts",     name: "Zara Ibrahim",    role: "Shorts Specialist",     initials: "ZI", color: "bg-red-500/20 text-red-400 border-red-500/30" },
  { id: "social",     name: "Marcus Wilson",   role: "Social Media Manager",  initials: "MW", color: "bg-indigo-500/20 text-indigo-400 border-indigo-500/30" },
  { id: "community",  name: "Chloe Chen",      role: "Community Manager",     initials: "CC", color: "bg-teal-500/20 text-teal-400 border-teal-500/30" },
  { id: "analyst",    name: "Dr. Leo Zhang",   role: "Data Analyst",          initials: "LZ", color: "bg-violet-500/20 text-violet-400 border-violet-500/30" },
  { id: "brand",      name: "Elena Rossi",     role: "Brand & Sponsorships",  initials: "ER", color: "bg-rose-500/20 text-rose-400 border-rose-500/30" },
  { id: "talent",     name: "Sarah Jenkins",   role: "Talent Manager",        initials: "SJ", color: "bg-lime-500/20 text-lime-400 border-lime-500/30" },
  { id: "legal",      name: "Alex Rivera",     role: "Legal & Compliance",    initials: "AR", color: "bg-slate-500/20 text-slate-400 border-slate-500/30" },
  { id: "catalog",    name: "Jamie Cruz",      role: "Catalog Content Director",  initials: "JC", color: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  { id: "livestream", name: "River Osei",      role: "Live Stream Growth Agent",     initials: "RO", color: "bg-red-600/20 text-red-400 border-red-600/30" },
  { id: "livechat",   name: "Kai Nakamura",   role: "Live Chat Commander",           initials: "KN", color: "bg-sky-500/20 text-sky-400 border-sky-500/30" },
  { id: "clipper",    name: "Mila Reyes",     role: "Moment Hunter",                 initials: "MR", color: "bg-fuchsia-500/20 text-fuchsia-400 border-fuchsia-500/30" },
  { id: "raidscout",  name: "Devon Hall",     role: "Raid Scout & Network Builder",  initials: "DH", color: "bg-green-500/20 text-green-400 border-green-500/30" },
  { id: "revpulse",   name: "Jade Kim",       role: "Revenue Pulse",                 initials: "JK", color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  { id: "continuity", name: "Morgan Wells",   role: "Autonomous Operations Director", initials: "MW", color: "bg-violet-500/20 text-violet-400 border-violet-500/30" },
];

function StatusDot({ status }: { status: string }) {
  if (status === "active") return <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0 animate-pulse" data-testid="dot-active" />;
  if (status === "error")  return <span className="w-2 h-2 rounded-full bg-red-400 flex-shrink-0" data-testid="dot-error" />;
  return <span className="w-2 h-2 rounded-full bg-muted-foreground/30 flex-shrink-0" data-testid="dot-idle" />;
}

function AgentCard({ agent, liveData }: { agent: typeof AGENT_ROSTER[number]; liveData?: any }) {
  const status  = liveData?.status ?? "idle";
  const lastRun = liveData?.lastRun;
  const tasks   = liveData?.tasksToday ?? 0;
  return (
    <Card
      className="p-4 border border-border/40 bg-card/50 hover:bg-card/80 transition-colors"
      data-testid={`card-agent-${agent.id}`}
    >
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-full border flex items-center justify-center flex-shrink-0 text-[11px] font-bold ${agent.color}`}>
          {agent.initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <StatusDot status={status} />
            <span className="text-sm font-semibold text-foreground truncate" data-testid={`text-agent-name-${agent.id}`}>{agent.name}</span>
          </div>
          <div className="text-[11px] text-muted-foreground truncate">{agent.role}</div>
          {lastRun && (
            <div className="text-[10px] text-muted-foreground/60 mt-1 truncate" data-testid={`text-agent-lastrun-${agent.id}`}>
              Last active {formatDistanceToNow(new Date(lastRun), { addSuffix: true })}
            </div>
          )}
        </div>
        {tasks > 0 && (
          <div className="flex-shrink-0 text-center" data-testid={`badge-tasks-${agent.id}`}>
            <div className="text-xs font-bold text-foreground font-mono">{tasks}</div>
            <div className="text-[9px] text-muted-foreground">tasks</div>
          </div>
        )}
      </div>
    </Card>
  );
}

function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: any; label: string; value: string | number; sub?: string; color: string;
}) {
  return (
    <div className={`rounded-xl p-4 border flex items-center gap-3 ${color}`} data-testid={`stat-${label.toLowerCase().replace(/\s/g,"-")}`}>
      <Icon className="h-5 w-5 flex-shrink-0 opacity-70" />
      <div className="min-w-0">
        <div className="flex items-center gap-1 text-xs text-muted-foreground mb-0.5">
          {label}
        </div>
        <div className="text-xl font-bold text-foreground font-mono leading-none">{value}</div>
        {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

function TaskResultModal({ task, onClose }: { task: any; onClose: () => void }) {
  const { data: result, isLoading } = useQuery<any>({
    queryKey: ["/api/agents/tasks", task?.id, "result"],
    queryFn: () => fetch(`/api/agents/tasks/${task.id}/result`).then(res => res.json()),
    enabled: !!task?.id,
  });

  return (
    <Dialog open={!!task} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {task?.agentName || "AI Agent"} Task Result
          </DialogTitle>
          <DialogDescription>
            {task?.action || task?.taskType || "AI Task Output"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden mt-4">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-[90%]" />
              <Skeleton className="h-4 w-[95%]" />
            </div>
          ) : result ? (
            <ScrollArea className="h-full pr-4">
              <div className="bg-muted/30 rounded-lg p-4 border border-border/50">
                <pre className="text-xs font-mono whitespace-pre-wrap break-words text-foreground/90">
                  {typeof result === 'object' 
                    ? JSON.stringify(result, null, 2) 
                    : String(result)
                  }
                </pre>
              </div>
              <div className="mt-4 flex flex-col gap-2 text-[11px] text-muted-foreground border-t border-border/20 pt-4">
                <div className="flex justify-between">
                  <span>Task ID:</span>
                  <span className="font-mono">{task?.id}</span>
                </div>
                {task?.createdAt && (
                  <div className="flex justify-between">
                    <span>Completed:</span>
                    <span>{new Date(task.createdAt).toLocaleString()}</span>
                  </div>
                )}
                {task?.taskType && (
                  <div className="flex justify-between">
                    <span>Type:</span>
                    <Badge variant="outline" className="text-[10px] py-0 h-4">{task.taskType}</Badge>
                  </div>
                )}
              </div>
            </ScrollArea>
          ) : (
            <div className="py-8 text-center text-muted-foreground">
              No result data available for this task.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StreamQualityBrief() {
  const { data: streams, isLoading: streamsLoading } = useQuery<any>({
    queryKey: ["/api/stream/command-center"],
    refetchInterval: 2 * 60_000,
    staleTime: 60_000,
  });

  const sessionId = (streams as any)?.sessionId;
  const { data: qualityState, isLoading: qualityLoading } = useQuery<any>({
    queryKey: ["/api/resolution/quality-state", sessionId],
    enabled: !!sessionId,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  if (streamsLoading) return null;
  if (!sessionId || !qualityState?.sourceProfile) return null;

  const source = qualityState.sourceProfile;
  const snap = qualityState.latestSnapshot;
  const governorState = snap?.governorState || "nominal";
  const events = qualityState.recentGovernorEvents || [];

  const stateColor: Record<string, string> = {
    nominal: "text-emerald-400",
    caution: "text-amber-400",
    degraded: "text-orange-400",
    emergency: "text-red-400",
  };

  return (
    <div className="lg:col-span-3 mb-4" data-testid="stream-quality-brief">
      <Card className="p-3">
        <div className="flex items-center gap-3 flex-wrap">
          <Activity className="h-4 w-4 text-blue-400" />
          <span className="text-xs font-medium">Stream Quality:</span>
          <span className="text-xs">{source.sourceResolution}@{source.sourceFps}fps</span>
          <Badge variant="outline" className="text-[10px]">{source.nativeVsWeakClassification}</Badge>
          <span className={`text-xs font-medium ${stateColor[governorState] || ""}`}>
            Governor: {governorState}
          </span>
          {events.length > 0 && (
            <span className="text-[10px] text-amber-400">
              {events.length} quality intervention{events.length > 1 ? "s" : ""}
            </span>
          )}
        </div>
      </Card>
    </div>
  );
}

export default function TeamDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [dismissedBanners, setDismissedBanners] = useState<string[]>([]);

  const syncChannelsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/sync/channels");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "Channel stats refreshed" });
    },
    onError: (e: any) => {
      toast({ title: "Refresh failed", description: e.message, variant: "destructive" });
    }
  });

  const { data: stats, isLoading: statsLoading } = useQuery<any>({
    queryKey: ["/api/dashboard/stats"],
    refetchInterval: 5 * 60_000,
    staleTime: 3 * 60_000,
  });

  const { data: agentStatus, isLoading: agentsLoading } = useQuery<any[]>({
    queryKey: ["/api/agents/status"],
    refetchInterval: 2 * 60_000,
    staleTime: 60_000,
  });

  const { data: activities, isLoading: activitiesLoading } = useQuery<any[]>({
    queryKey: ["/api/agents/activities"],
    queryFn: () => fetch("/api/agents/activities?limit=40").then(r => r.json()),
    refetchInterval: 2 * 60_000,
    staleTime: 60_000,
  });

  const { data: channels, isLoading: channelsLoading } = useQuery<any[]>({
    queryKey: ["/api/channels"],
    refetchInterval: 10 * 60_000,
    staleTime: 5 * 60_000,
  });

  const { data: operatorBrief } = useQuery<any>({
    queryKey: ["/api/operator/brief"],
    refetchInterval: 10 * 60_000,
    staleTime: 5 * 60_000,
  });

  const { data: sponsorData } = useQuery<any>({
    queryKey: ["/api/monetization/sponsorship-opportunities"],
    refetchInterval: 15 * 60_000,
    staleTime: 10 * 60_000,
  });

  const { data: missions } = useQuery<any>({
    queryKey: ["/api/monetization/missions"],
    refetchInterval: 15 * 60_000,
    staleTime: 10 * 60_000,
  });


  const expiredPlatforms = (channels || [])
    .filter((ch: any) => ch.connectionStatus === "expired")
    .map((ch: any) => ch.platform.charAt(0).toUpperCase() + ch.platform.slice(1));

  const activeCount = agentStatus?.filter((a: any) => a.status === "active").length ?? 0;

  const fmt = (n?: number | null) => {
    if (n == null) return "—";
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border/50 px-4 sm:px-6 py-3 flex items-center gap-3">
        <SidebarTrigger className="text-muted-foreground hover:text-foreground" data-testid="button-sidebar-trigger" />
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold text-foreground leading-none">Your AI Team</h1>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {agentsLoading ? "Checking team…" : `${activeCount} of ${AGENT_ROSTER.length} agents active right now`}
          </p>
        </div>
        {stats?.isLive && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/15 border border-red-500/30" data-testid="badge-live">
            <Radio className="h-3 w-3 text-red-400" />
            <span className="text-[11px] font-bold text-red-400">LIVE</span>
          </div>
        )}
      </div>

      <div className="px-4 sm:px-6 py-6 max-w-6xl mx-auto space-y-6">
        {channels && !channels.some((c: any) => c.platform === "youtube") && !dismissedBanners.includes("youtube") && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30" data-testid="banner-youtube-not-connected">
            <Radio className="h-4 w-4 text-amber-500 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-500 leading-none">Connect YouTube</p>
              <p className="text-xs text-muted-foreground mt-0.5">Unlock AI agents, revenue sync, and VOD automation. <a href="/settings" className="font-medium underline underline-offset-2">Go to Settings</a></p>
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setDismissedBanners([...dismissedBanners, "youtube"])}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}
        {user?.tier === "free" && !dismissedBanners.includes("stripe") && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30" data-testid="banner-stripe-not-configured">
            <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-500 leading-none">Stripe Not Configured</p>
              <p className="text-xs text-muted-foreground mt-0.5">Upgrade your plan to access premium features. <a href="/money" className="font-medium underline underline-offset-2">Go to Billing</a></p>
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setDismissedBanners([...dismissedBanners, "stripe"])}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}
        {expiredPlatforms.length > 0 && (
          <a href="/settings" className="flex items-center gap-3 p-3 rounded-lg bg-destructive/10 border border-destructive/30 hover:bg-destructive/15 transition-colors" data-testid="banner-platform-alert">
            <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-destructive leading-none">{expiredPlatforms.join(" & ")} {expiredPlatforms.length === 1 ? "needs" : "need"} reconnection</p>
              <p className="text-xs text-muted-foreground mt-0.5">Posting is paused. Tap to reconnect in Settings.</p>
            </div>
            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          </a>
        )}
        <FirstLiveMission />

        {statsLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard icon={Users}      label="Subscribers"    value={fmt(stats?.subscriberCount)}  sub="YouTube"      color="border-purple-500/20 bg-purple-500/5" />
            <StatCard icon={Eye}        label="Views this month" value={fmt(stats?.monthlyViews)}   sub="30 days"      color="border-blue-500/20 bg-blue-500/5" />
            <StatCard icon={DollarSign} label="Revenue"        value={`$${stats?.monthlyRevenue != null ? Number(stats.monthlyRevenue).toFixed(0) : "—"}`} sub="this month" color="border-emerald-500/20 bg-emerald-500/5" />
            <StatCard icon={Video}      label="Total Videos"   value={fmt(stats?.channelVideoCount && stats.channelVideoCount > 0 ? stats.channelVideoCount : stats?.totalVideos)}   sub="all platforms"   color="border-yellow-500/20 bg-yellow-500/5" />
          </div>
        )}

        <DailyBriefingSection briefing={operatorBrief} />

        {operatorBrief?.topActions?.length > 0 && (
          <div className="rounded-xl border border-border/30 bg-card/20 p-4" data-testid="card-top-actions">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
              <Sparkles className="h-4 w-4 text-primary" />
              Top 3 Actions
            </h2>
            <div className="space-y-2">
              {operatorBrief.topActions.slice(0, 3).map((action: any, i: number) => (
                <div key={i} className="flex items-start gap-2 text-sm" data-testid={`text-top-action-${i}`}>
                  <span className={`h-2 w-2 rounded-full mt-1.5 shrink-0 ${action.priority === "high" ? "bg-red-400" : action.priority === "medium" ? "bg-amber-400" : "bg-emerald-400"}`} />
                  <span className="text-muted-foreground">{action.title}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {operatorBrief?.blockers?.length > 0 && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4" data-testid="card-blockers">
            <h2 className="text-sm font-semibold text-destructive flex items-center gap-2 mb-3">
              <AlertTriangle className="h-4 w-4" />
              Blockers
            </h2>
            <div className="space-y-2">
              {operatorBrief.blockers.map((b: string, i: number) => (
                <div key={i} className="text-sm text-muted-foreground flex items-start gap-2" data-testid={`text-blocker-${i}`}>
                  <AlertCircle className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />
                  {b}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {sponsorData?.opportunities?.length > 0 && (
            <div className="rounded-xl border border-border/30 bg-card/20 p-4" data-testid="card-sponsor-pipeline">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
                <DollarSign className="h-4 w-4 text-emerald-400" />
                Sponsor Pipeline
              </h2>
              <div className="space-y-2">
                {sponsorData.opportunities.slice(0, 3).map((s: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-sm" data-testid={`text-sponsor-${i}`}>
                    <span className="text-muted-foreground truncate">{s.brandName || s.name || "Brand"}</span>
                    <Badge variant="outline" className="text-[10px]">{s.fitLevel || s.status || "prospect"}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
          {missions?.missions?.length > 0 && (
            <div className="rounded-xl border border-border/30 bg-card/20 p-4" data-testid="card-monetization-missions">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
                <TrendingUp className="h-4 w-4 text-amber-400" />
                Monetization Readiness ({missions.readinessScore}%)
              </h2>
              <div className="space-y-1.5">
                {missions.missions.slice(0, 4).map((m: any) => (
                  <div key={m.id} className="flex items-center gap-2 text-sm" data-testid={`mission-${m.id}`}>
                    {m.completed ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" /> : <Clock className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />}
                    <span className={m.completed ? "text-muted-foreground line-through" : "text-muted-foreground"}>{m.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                The Team
              </h2>
              {!agentsLoading && (
                <span className="text-xs text-muted-foreground" data-testid="text-agent-count">
                  {activeCount} active
                </span>
              )}
            </div>

            {agentsLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {[...Array(AGENT_ROSTER.length)].map((_, i) => <Skeleton key={i} className="h-[76px] rounded-lg" />)}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {AGENT_ROSTER.map(agent => {
                  const live = agentStatus?.find((a: any) =>
                    a.name?.toLowerCase().includes(agent.name.split(" ")[0].toLowerCase()) ||
                    a.role?.toLowerCase().includes(agent.role.toLowerCase().split(" ")[0])
                  );
                  return <AgentCard key={agent.id} agent={agent} liveData={live} />;
                })}
              </div>
            )}
          </div>

          <StreamQualityBrief />

          <div className="lg:col-span-1">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-muted-foreground" />
                Team Activity
              </h2>
            </div>

            <div className="rounded-xl border border-border/40 bg-card/30 overflow-hidden">
              <ScrollArea className="h-[540px]">
                <div className="p-3 space-y-0" data-testid="activity-feed">
                  {!activities || activities.length === 0 ? (
                    <div className="py-12 text-center">
                      <Clock className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                      <p className="text-xs text-muted-foreground">Team activity will appear here once agents start working.</p>
                    </div>
                  ) : (
                    activities.map((a: any, i: number) => (
                      <ActivityRow 
                        key={a.id ?? i} 
                        activity={a} 
                        onClick={() => setSelectedTask(a)}
                      />
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
        </div>

        <AudienceGrowthSection />

        <AgentUIPayloadCard />

        <TaskResultModal 
          task={selectedTask} 
          onClose={() => setSelectedTask(null)} 
        />

        {stats && (
          <div className="rounded-xl border border-border/30 bg-card/20 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                Channel Performance
              </h2>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => syncChannelsMutation.mutate()}
                disabled={syncChannelsMutation.isPending}
                data-testid="button-refresh-channels"
              >
                <RefreshCw className={`h-4 w-4 ${syncChannelsMutation.isPending ? "animate-spin" : ""}`} />
              </Button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <PerfMetric label="Total Views"       value={fmt(stats?.totalViews)}       />
              <PerfMetric label="Channel Videos"    value={fmt(stats?.channelVideoCount)} />
              <PerfMetric label="Shorts"            value={fmt(stats?.totalShorts)}       />
              <PerfMetric label="Total Videos"      value={fmt(stats?.totalVideos)}      />
              <PerfMetric label="Watch Hours"       value={stats?.watchHours != null ? `${Number(stats.watchHours).toFixed(0)}h` : "—"} />
              <PerfMetric label="Avg View Duration" value={stats?.avgViewDuration != null ? `${Number(stats.avgViewDuration).toFixed(0)}s` : "—"} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ActivityRow({ activity, onClick }: { activity: any; onClick?: () => void }) {
  const statusIcon = activity.status === "completed"
    ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
    : activity.status === "error"
    ? <AlertCircle className="h-3.5 w-3.5 text-red-400 flex-shrink-0 mt-0.5" />
    : <Sparkles className="h-3.5 w-3.5 text-primary/60 flex-shrink-0 mt-0.5" />;

  const time = activity.createdAt || activity.timestamp || activity.updatedAt;

  return (
    <div 
      className={`flex gap-2.5 py-2.5 border-b border-border/20 last:border-0 ${onClick ? 'cursor-pointer hover:bg-muted/30 transition-colors' : ''}`} 
      data-testid={`activity-row-${activity.id}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {statusIcon}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1 min-w-0">
            {activity.agentName && (
              <span className="text-[11px] font-semibold text-primary/80">{activity.agentName} </span>
            )}
            <span className="text-[11px] text-foreground/80 leading-snug">
              {activity.action || activity.description || activity.taskType || "completed a task"}
            </span>
          </div>
          {onClick && (
            <button 
              className="text-[10px] text-primary hover:underline flex-shrink-0"
              data-testid={`button-view-task-result-${activity.id}`}
            >
              View
            </button>
          )}
        </div>
        {time && (
          <div className="text-[10px] text-muted-foreground/50 mt-0.5">
            {formatDistanceToNow(new Date(time), { addSuffix: true })}
          </div>
        )}
      </div>
    </div>
  );
}

function PerfMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center p-2.5 rounded-lg bg-muted/10 border border-border/20" data-testid={`perf-${label.toLowerCase().replace(/\s/g,"-")}`}>
      <div className="text-base font-bold text-foreground font-mono">{value}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}
