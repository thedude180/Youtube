import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  Users, Video, Eye, DollarSign, TrendingUp, CheckCircle2,
  Clock, AlertCircle, Sparkles, Radio,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { SidebarTrigger } from "@/components/ui/sidebar";

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
  { id: "livestream", name: "River Osei",      role: "Live Stream Growth Agent",  initials: "RO", color: "bg-red-600/20 text-red-400 border-red-600/30" },
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
        <div className="text-xs text-muted-foreground mb-0.5">{label}</div>
        <div className="text-xl font-bold text-foreground font-mono leading-none">{value}</div>
        {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

export default function TeamDashboard() {
  const { data: stats, isLoading: statsLoading } = useQuery<any>({
    queryKey: ["/api/dashboard/stats"],
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const { data: agentStatus, isLoading: agentsLoading } = useQuery<any[]>({
    queryKey: ["/api/agents/status"],
    refetchInterval: 30_000,
    staleTime: 20_000,
  });

  const { data: activities } = useQuery<any[]>({
    queryKey: ["/api/agents/activities"],
    queryFn: () => fetch("/api/agents/activities?limit=40").then(r => r.json()),
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

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
            {agentsLoading ? "Checking team…" : `${activeCount} of 14 agents active right now`}
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
        {statsLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard icon={Users}      label="Subscribers"    value={fmt(stats?.subscriberCount)}  sub="YouTube"      color="border-purple-500/20 bg-purple-500/5" />
            <StatCard icon={Eye}        label="Views this month" value={fmt(stats?.monthlyViews)}   sub="30 days"      color="border-blue-500/20 bg-blue-500/5" />
            <StatCard icon={DollarSign} label="Revenue"        value={`$${stats?.monthlyRevenue != null ? Number(stats.monthlyRevenue).toFixed(0) : "—"}`} sub="this month" color="border-emerald-500/20 bg-emerald-500/5" />
            <StatCard icon={Video}      label="Videos posted"  value={stats?.videosPosted ?? "—"}   sub="this month"   color="border-yellow-500/20 bg-yellow-500/5" />
          </div>
        )}

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
                {[...Array(14)].map((_, i) => <Skeleton key={i} className="h-[76px] rounded-lg" />)}
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
                      <ActivityRow key={a.id ?? i} activity={a} />
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
        </div>

        {stats && (
          <div className="rounded-xl border border-border/30 bg-card/20 p-4">
            <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              Channel Performance
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <PerfMetric label="Total Views"       value={fmt(stats?.totalViews)}       />
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

function ActivityRow({ activity }: { activity: any }) {
  const statusIcon = activity.status === "completed"
    ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
    : activity.status === "error"
    ? <AlertCircle className="h-3.5 w-3.5 text-red-400 flex-shrink-0 mt-0.5" />
    : <Sparkles className="h-3.5 w-3.5 text-primary/60 flex-shrink-0 mt-0.5" />;

  const time = activity.createdAt || activity.timestamp || activity.updatedAt;

  return (
    <div className="flex gap-2.5 py-2.5 border-b border-border/20 last:border-0" data-testid={`activity-row-${activity.id}`}>
      {statusIcon}
      <div className="flex-1 min-w-0">
        {activity.agentName && (
          <span className="text-[11px] font-semibold text-primary/80">{activity.agentName} </span>
        )}
        <span className="text-[11px] text-foreground/80 leading-snug">
          {activity.action || activity.description || activity.taskType || "completed a task"}
        </span>
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
