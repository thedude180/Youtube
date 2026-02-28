import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { usePageTitle } from "@/hooks/use-page-title";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, Zap, Play, RefreshCw, Activity, ChevronRight } from "lucide-react";

const DEPT_META = {
  creative: { label: "Creative Team", color: "hsl(265 80% 60%)", bg: "hsl(265 80% 60% / 0.08)", border: "hsl(265 80% 60% / 0.25)", emoji: "🎬", subtitle: "YouTube Content & Distribution — 14 Agents" },
  executive: { label: "C-Suite", color: "hsl(142 70% 50%)", bg: "hsl(142 70% 50% / 0.08)", border: "hsl(142 70% 50% / 0.25)", emoji: "💼", subtitle: "Business Strategy & Operations — 9 Executives" },
  legal: { label: "Legal & Tax", color: "hsl(45 90% 55%)", bg: "hsl(45 90% 55% / 0.08)", border: "hsl(45 90% 55% / 0.25)", emoji: "⚖️", subtitle: "Compliance, Risk & Tax — 18 Specialists" },
};

const STATUS_COLORS: Record<string, string> = {
  running: "hsl(200 80% 60%)",
  idle: "hsl(142 70% 50%)",
  standby: "hsl(265 40% 60%)",
};

const STATUS_LABELS: Record<string, string> = {
  running: "Running",
  idle: "Active",
  standby: "Ready",
};

function AgentInitials({ name, color, size = 36 }: { name: string; color: string; size?: number }) {
  const initials = name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: `${color}22`, border: `1.5px solid ${color}55`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.33, fontWeight: 700, color,
      flexShrink: 0, fontFamily: "monospace",
      boxShadow: `0 0 10px ${color}33`,
    }}>
      {initials}
    </div>
  );
}

function AgentCard({ agent, status }: { agent: any; status?: any }) {
  const dept = DEPT_META[agent.department as keyof typeof DEPT_META];
  const agentStatus = status?.status ?? "standby";
  const statusColor = STATUS_COLORS[agentStatus] ?? STATUS_COLORS.standby;
  const isRunning = agentStatus === "running";

  return (
    <div
      className="rounded-xl p-3 border transition-all duration-300 relative overflow-hidden"
      style={{
        background: isRunning ? `${agent.color}12` : "hsl(265 20% 8%)",
        borderColor: isRunning ? `${agent.color}60` : "hsl(265 30% 18%)",
        boxShadow: isRunning ? `0 0 16px ${agent.color}25` : "none",
      }}
      data-testid={`agent-card-${agent.agentId}`}
    >
      {isRunning && (
        <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t-xl"
          style={{ background: `linear-gradient(90deg, transparent, ${agent.color}, transparent)`, animation: "gradient-shift 2s ease infinite", backgroundSize: "200% 200%" }} />
      )}
      <div className="flex items-start gap-2.5">
        <div className="relative flex-shrink-0">
          <AgentInitials name={agent.name} color={agent.color} size={34} />
          <span className="absolute -bottom-0.5 -right-0.5 text-xs">{agent.emoji}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-xs font-bold text-white truncate">{agent.name}</span>
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ background: statusColor, boxShadow: isRunning ? `0 0 6px ${statusColor}` : "none", animation: isRunning ? "pulse 1.5s ease-in-out infinite" : "none" }} />
          </div>
          <p className="text-[10px] text-muted-foreground leading-tight truncate">{agent.title}</p>
          {status?.lastFinding && (
            <p className="text-[9px] mt-1 leading-tight line-clamp-2" style={{ color: `${agent.color}cc` }}>
              {status.lastFinding}
            </p>
          )}
          <div className="flex flex-wrap gap-0.5 mt-1.5">
            {(agent.appOwns ?? []).slice(0, 2).map((section: string) => (
              <span key={section} className="text-[8px] px-1 py-0.5 rounded font-mono"
                style={{ background: `${dept.color}15`, color: `${dept.color}cc`, border: `1px solid ${dept.color}30` }}>
                {section}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function DepartmentColumn({ dept, agents, statusMap }: { dept: string; agents: any[]; statusMap: Record<string, any> }) {
  const meta = DEPT_META[dept as keyof typeof DEPT_META];
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? agents : agents.slice(0, 5);

  return (
    <div className="flex flex-col rounded-2xl border overflow-hidden"
      style={{ background: meta.bg, borderColor: meta.border }}
      data-testid={`dept-column-${dept}`}>
      <div className="p-4 border-b" style={{ borderColor: meta.border }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">{meta.emoji}</span>
            <div>
              <h3 className="text-sm font-bold text-white">{meta.label}</h3>
              <p className="text-[10px] font-mono" style={{ color: `${meta.color}cc` }}>{meta.subtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: meta.color }} />
            <span className="text-[10px] font-mono" style={{ color: meta.color }}>
              {agents.filter(a => statusMap[a.agentId]?.status === "running").length} active
            </span>
          </div>
        </div>
      </div>
      <div className="p-3 flex flex-col gap-2 flex-1">
        {visible.map((agent: any) => (
          <AgentCard key={agent.agentId} agent={agent} status={statusMap[agent.agentId]} />
        ))}
        {agents.length > 5 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[10px] font-mono text-center py-2 rounded-lg border transition-colors hover:bg-white/5"
            style={{ color: `${meta.color}cc`, borderColor: `${meta.color}30` }}
            data-testid={`btn-expand-${dept}`}>
            {expanded ? "Show less" : `+ ${agents.length - 5} more agents`}
          </button>
        )}
      </div>
    </div>
  );
}

function LiveFeedItem({ item }: { item: any }) {
  const deptMeta = DEPT_META[item.department as keyof typeof DEPT_META] ?? DEPT_META.creative;
  return (
    <div className="flex items-start gap-2.5 py-2 border-b border-border/10 last:border-0 animate-in fade-in slide-in-from-left-2 duration-500">
      <div style={{ width: 28, height: 28, borderRadius: "50%", background: `${item.color}20`, border: `1px solid ${item.color}50`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, flexShrink: 0 }}>
        {item.emoji}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-bold" style={{ color: item.color }}>{item.agentName}</span>
          <span className="text-[9px] px-1 py-0.5 rounded font-mono"
            style={{ background: `${deptMeta.color}15`, color: `${deptMeta.color}cc` }}>
            {deptMeta.label}
          </span>
          {item.handoffsTo?.length > 0 && (
            <span className="text-[9px] text-muted-foreground/60 flex items-center gap-0.5 font-mono">
              <ChevronRight className="w-2.5 h-2.5" />{item.handoffsTo[0]}
            </span>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">
          {(item.details as any)?.description ?? item.action}
        </p>
      </div>
    </div>
  );
}

function PhasePipeline() {
  const phases = [
    { label: "Intelligence", color: "hsl(200 80% 60%)", icon: "🔍" },
    { label: "Content", color: "hsl(265 80% 65%)", icon: "✍️" },
    { label: "Distribute", color: "hsl(25 90% 55%)", icon: "📣" },
    { label: "Revenue", color: "hsl(45 90% 55%)", icon: "💰" },
    { label: "Growth", color: "hsl(142 70% 50%)", icon: "🚀" },
    { label: "Legal", color: "hsl(45 90% 55%)", icon: "⚖️" },
    { label: "Command", color: "hsl(265 80% 65%)", icon: "👑" },
  ];
  const [activePhase, setActivePhase] = useState(0);
  const ref = useRef(0);
  useEffect(() => {
    const t = setInterval(() => {
      ref.current = (ref.current + 1) % phases.length;
      setActivePhase(ref.current);
    }, 1400);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="card-empire rounded-xl p-4 mb-4" data-testid="widget-phase-pipeline">
      <div className="text-[10px] font-mono text-muted-foreground uppercase mb-3 flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
        7-Phase Company Execution Pipeline
      </div>
      <div className="flex items-center gap-1 overflow-x-auto touch-scroll pb-1">
        {phases.map((phase, i) => (
          <div key={i} className="flex items-center gap-1 flex-shrink-0">
            <div className={`flex flex-col items-center gap-1 px-2 py-1.5 rounded-lg transition-all duration-500 ${i === activePhase ? 'ring-1' : ''}`}
              style={{
                background: i <= activePhase ? `${phase.color}20` : "hsl(265 20% 8%)",
                ringColor: phase.color,
                boxShadow: i === activePhase ? `0 0 12px ${phase.color}50` : "none",
              }}
              data-testid={`phase-node-${i}`}>
              <span className="text-base">{phase.icon}</span>
              <span className="text-[8px] font-mono whitespace-nowrap" style={{ color: i <= activePhase ? phase.color : "hsl(265 20% 50%)" }}>
                {phase.label}
              </span>
            </div>
            {i < phases.length - 1 && (
              <div className="w-4 h-0.5 flex-shrink-0 rounded-full transition-all duration-500"
                style={{ background: i < activePhase ? "hsl(142 70% 50%)" : "hsl(265 20% 25%)" }} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TeamOps() {
  usePageTitle("God Mode Team Operations", "41 AI agents working as a coordinated human team across Creative, Executive, and Legal departments.");
  const { user } = useAuth();

  const { data: orgData } = useQuery<any>({ queryKey: ["/api/team-ops/org"], staleTime: 300000 });
  const { data: statusData, refetch: refetchStatus } = useQuery<any>({
    queryKey: ["/api/team-ops/status"],
    refetchInterval: 15000,
  });
  const { data: feedData } = useQuery<any[]>({
    queryKey: ["/api/team-ops/feed"],
    refetchInterval: 10000,
  });

  const runCycle = useMutation({
    mutationFn: () => apiRequest("POST", "/api/team-ops/run-cycle", {}),
    onSuccess: () => {
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/team-ops/status"] });
        queryClient.invalidateQueries({ queryKey: ["/api/team-ops/feed"] });
      }, 3000);
    },
  });

  const agents: any[] = orgData?.agents ?? [];
  const statusMap: Record<string, any> = {};
  (statusData?.agents ?? []).forEach((s: any) => { statusMap[s.agentId] = s; });

  const deptAgents = {
    creative: agents.filter(a => a.department === "creative"),
    executive: agents.filter(a => a.department === "executive"),
    legal: agents.filter(a => a.department === "legal"),
  };

  const totalActive = statusData?.activeNow ?? 0;
  const completedToday = statusData?.completedToday ?? 0;
  const totalAgents = agents.length || 41;
  const feed: any[] = feedData ?? [];

  return (
    <div className="min-h-screen p-4 sm:p-6 animated-gradient-bg" data-testid="page-team-ops">
      <div className="max-w-[1600px] mx-auto space-y-4">

        <div className="card-empire rounded-2xl p-5 relative overflow-hidden empire-glow" data-testid="header-team-ops">
          <div className="data-grid-bg absolute inset-0 opacity-10 pointer-events-none" />
          <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Users className="w-5 h-5 text-primary" />
                <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">God Mode Operations</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] font-mono text-emerald-400">LIVE</span>
              </div>
              <h1 className="text-3xl font-black holographic-text tracking-tight" data-testid="text-page-title">
                Company Command Center
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {totalAgents} AI professionals operating as a coordinated human company — 24/7, zero downtime
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              {[
                { label: "Total Agents", value: totalAgents, color: "hsl(265 80% 65%)" },
                { label: "Active Now", value: totalActive, color: "hsl(142 70% 50%)" },
                { label: "Tasks Today", value: completedToday, color: "hsl(45 90% 55%)" },
                { label: "Departments", value: 3, color: "hsl(200 80% 60%)" },
              ].map(({ label, value, color }) => (
                <div key={label} className="text-center px-4 py-2 rounded-xl border" style={{ background: `${color}10`, borderColor: `${color}30` }} data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>
                  <div className="text-2xl font-black font-mono metric-display" style={{ color, textShadow: `0 0 20px ${color}66` }}>{value}</div>
                  <div className="text-[10px] text-muted-foreground font-mono uppercase">{label}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="relative mt-4 flex items-center gap-3 flex-wrap">
            <Button
              onClick={() => runCycle.mutate()}
              disabled={runCycle.isPending}
              className="gap-2 font-mono font-bold"
              style={{ background: "linear-gradient(135deg, hsl(265 80% 55%), hsl(200 80% 55%))", boxShadow: "0 0 20px hsl(265 80% 60% / 0.4)" }}
              data-testid="button-run-company-cycle">
              {runCycle.isPending ? (
                <><RefreshCw className="w-4 h-4 animate-spin" /> Deploying Company...</>
              ) : (
                <><Play className="w-4 h-4" /> Deploy Full Company Cycle</>
              )}
            </Button>
            <Button variant="outline" size="sm" onClick={() => refetchStatus()} className="gap-1.5 font-mono text-xs" data-testid="button-refresh-status">
              <Activity className="w-3.5 h-3.5" /> Refresh Status
            </Button>
            {runCycle.isSuccess && (
              <span className="text-xs text-emerald-400 font-mono animate-pulse" data-testid="text-cycle-success">
                ✓ All 7 phases launched — 41 agents deploying
              </span>
            )}
          </div>
        </div>

        <PhasePipeline />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {(["creative", "executive", "legal"] as const).map(dept => (
            <DepartmentColumn
              key={dept}
              dept={dept}
              agents={deptAgents[dept]}
              statusMap={statusMap}
            />
          ))}
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <div className="md:col-span-2 card-empire rounded-2xl p-4" data-testid="widget-live-feed">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs font-mono text-muted-foreground uppercase">Cross-Team Activity Feed</span>
              </div>
              <Badge variant="outline" className="text-[10px] font-mono border-emerald-500/30 text-emerald-400">
                {feed.length} events
              </Badge>
            </div>
            <div className="max-h-72 overflow-y-auto space-y-0">
              {feed.length > 0 ? (
                feed.slice(0, 20).map((item: any, i: number) => (
                  <LiveFeedItem key={item.id ?? i} item={item} />
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  <Zap className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p>Run a company cycle to see cross-team activity</p>
                </div>
              )}
            </div>
          </div>

          <div className="card-empire rounded-2xl p-4" data-testid="widget-handoff-map">
            <div className="text-xs font-mono text-muted-foreground uppercase mb-3">Team Handoff Map</div>
            <div className="space-y-2 text-xs">
              {[
                { from: "Tomás Rivera", to: "Nia Okafor", label: "Research → Script", color: "hsl(45 90% 55%)" },
                { from: "Nia Okafor", to: "Kenji Watanabe", label: "Script → Edit", color: "hsl(142 70% 50%)" },
                { from: "Kenji Watanabe", to: "Sofia Vasquez", label: "Edit → Thumbnail", color: "hsl(0 80% 60%)" },
                { from: "Sofia Vasquez", to: "Arjun Mehta", label: "Visual → SEO", color: "hsl(320 70% 60%)" },
                { from: "Arjun Mehta", to: "Marcus Wilson", label: "SEO → Distribute", color: "hsl(210 80% 55%)" },
                { from: "Dr. Danielle Pierce", to: "Jordan Blake", label: "Analytics → Director", color: "hsl(265 60% 70%)" },
                { from: "Rachel Novak", to: "Elena Marchetti", label: "Revenue → CFO", color: "hsl(45 90% 60%)" },
                { from: "Jordan Blake", to: "Alicia Foster", label: "Director → Strategy", color: "hsl(265 80% 65%)" },
              ].map((h, i) => (
                <div key={i} className="flex items-center gap-2 py-1.5 border-b border-border/10 last:border-0" data-testid={`handoff-row-${i}`}>
                  <div className="w-1 h-5 rounded-full flex-shrink-0" style={{ background: h.color }} />
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-[9px] text-muted-foreground/60">{h.label}</div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="text-[10px] text-white truncate">{h.from}</span>
                      <ChevronRight className="w-2.5 h-2.5 text-muted-foreground flex-shrink-0" />
                      <span className="text-[10px] truncate" style={{ color: h.color }}>{h.to}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="section-app-ownership">
          {[
            { section: "Dashboard", agents: ["Jordan Blake", "Elena Marchetti"], color: "hsl(265 80% 65%)", emoji: "🏠" },
            { section: "Content", agents: ["Kenji Watanabe", "Nia Okafor"], color: "hsl(0 80% 60%)", emoji: "🎬" },
            { section: "Money", agents: ["Rachel Novak", "Elena Marchetti"], color: "hsl(45 90% 55%)", emoji: "💰" },
            { section: "Growth", agents: ["Alex Morgan", "Kai Nakamura"], color: "hsl(142 70% 50%)", emoji: "📈" },
            { section: "War Room", agents: ["Dr. Aisha Okonkwo", "Leila Santos"], color: "hsl(0 80% 55%)", emoji: "🚨" },
            { section: "Mission Control", agents: ["Morgan Hayes", "Priya Sharma"], color: "hsl(200 80% 60%)", emoji: "🛰️" },
            { section: "Legal & Tax", agents: ["Victoria Chen", "Carlos Rivera"], color: "hsl(45 90% 55%)", emoji: "⚖️" },
            { section: "Competitive Edge", agents: ["Arjun Mehta", "Alicia Foster"], color: "hsl(210 80% 55%)", emoji: "🏆" },
          ].map(({ section, agents: sectionAgents, color, emoji }) => (
            <div key={section} className="rounded-xl p-3 border transition-colors" style={{ background: `${color}08`, borderColor: `${color}25` }} data-testid={`ownership-card-${section.toLowerCase().replace(/\s+/g, "-")}`}>
              <div className="text-base mb-1.5">{emoji}</div>
              <div className="text-xs font-bold text-white mb-1">{section}</div>
              {sectionAgents.map(name => (
                <div key={name} className="text-[9px] font-mono py-0.5" style={{ color: `${color}cc` }}>{name}</div>
              ))}
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
