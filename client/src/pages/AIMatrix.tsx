import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Zap, Brain, Shield, Radio, BarChart3, Bot, Repeat,
  Play, Pause, RefreshCw, Activity, Cpu, Eye, Clock,
  TrendingUp, Film, MessageSquare, Search, Globe, Lock,
} from "lucide-react";

interface Engine {
  name: string;
  enabled: boolean;
  status: string;
  lastRun: string | null;
  nextRun: string | null;
  runCount: number;
  failureCount: number;
  runs?: { status: string; startedAt: string }[];
}

interface AutonomyStatus {
  engines?: Engine[];
  isRunning?: boolean;
  totalRuns?: number;
  successRate?: number;
}

const ENGINE_META: Record<string, { icon: any; color: string; group: string; desc: string }> = {
  "growth-engine":        { icon: TrendingUp,    color: "emerald", group: "Growth",    desc: "Daily AI actions & roadmap" },
  "content-loop":         { icon: Repeat,        color: "cyan",    group: "Content",   desc: "Auto-schedule content pipeline" },
  "autopilot":            { icon: Zap,           color: "purple",  group: "Publish",   desc: "Clip, post & reply autonomy" },
  "vod-optimizer":        { icon: Film,          color: "blue",    group: "Content",   desc: "Closed-loop VOD optimization" },
  "platform-policy":      { icon: Shield,        color: "amber",   group: "Safety",    desc: "TOS monitoring & compliance" },
  "ai-team":              { icon: Bot,           color: "pink",    group: "AI",        desc: "Editor, moderator & analyst" },
  "competitive-edge":     { icon: Eye,           color: "indigo",  group: "Intel",     desc: "Competitor tracking & analysis" },
  "community":            { icon: MessageSquare, color: "orange",  group: "Engage",    desc: "Comment & community automation" },
  "seo-monitor":          { icon: Search,        color: "teal",    group: "SEO",       desc: "Keyword & ranking intelligence" },
  "stream-monitor":       { icon: Radio,         color: "red",     group: "Live",      desc: "Live stream health & alerts" },
  "analytics":            { icon: BarChart3,     color: "violet",  group: "Data",      desc: "Cross-platform analytics" },
  "security-sentinel":    { icon: Lock,          color: "rose",    group: "Safety",    desc: "AI security & threat detection" },
  "human-behavior":       { icon: Brain,         color: "sky",     group: "AI",        desc: "Human simulation engine" },
  "cross-platform":       { icon: Globe,         color: "lime",    group: "Publish",   desc: "25-platform distribution" },
};

const STATUS_STYLES: Record<string, { dot: string; badge: string; glow: string }> = {
  running:  { dot: "bg-blue-400 animate-pulse",   badge: "text-blue-400 border-blue-500/30 bg-blue-500/10",   glow: "0 0 12px hsl(220 80% 60% / 0.4)" },
  idle:     { dot: "bg-emerald-400",              badge: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10", glow: "0 0 8px hsl(142 70% 50% / 0.2)" },
  completed:{ dot: "bg-emerald-400",              badge: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10", glow: "0 0 8px hsl(142 70% 50% / 0.2)" },
  error:    { dot: "bg-red-400 animate-pulse",    badge: "text-red-400 border-red-500/30 bg-red-500/10",     glow: "0 0 12px hsl(0 80% 55% / 0.4)" },
  disabled: { dot: "bg-gray-600",                 badge: "text-gray-500 border-gray-700/30 bg-gray-800/40",  glow: "none" },
};

const COLOR_CLASSES: Record<string, string> = {
  emerald: "text-emerald-400",  cyan: "text-cyan-400",   purple: "text-purple-400",
  blue: "text-blue-400",        amber: "text-amber-400", pink: "text-pink-400",
  indigo: "text-indigo-400",    orange: "text-orange-400", teal: "text-teal-400",
  red: "text-red-400",          violet: "text-violet-400", rose: "text-rose-400",
  sky: "text-sky-400",          lime: "text-lime-400",
};

const COLOR_BG: Record<string, string> = {
  emerald: "bg-emerald-500/10", cyan: "bg-cyan-500/10",  purple: "bg-purple-500/10",
  blue: "bg-blue-500/10",       amber: "bg-amber-500/10", pink: "bg-pink-500/10",
  indigo: "bg-indigo-500/10",   orange: "bg-orange-500/10", teal: "bg-teal-500/10",
  red: "bg-red-500/10",         violet: "bg-violet-500/10", rose: "bg-rose-500/10",
  sky: "bg-sky-500/10",         lime: "bg-lime-500/10",
};

function Sparkline({ runs }: { runs?: { status: string }[] }) {
  const data = (runs || []).slice(-8).map(r => r.status === "completed" ? 1 : 0);
  if (data.length < 2) return <div className="w-16 h-5 opacity-30 text-[9px] text-muted-foreground">no data</div>;
  const pts = data.map((d, i) => `${(i / (data.length - 1)) * 60},${16 - d * 12}`).join(" ");
  return (
    <svg viewBox="0 0 60 16" className="w-16 h-5">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-emerald-400/60" />
    </svg>
  );
}

function formatAgo(dateStr: string | null) {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

function EngineCard({ engine, onToggle, onForce, isForcing }: {
  engine: Engine;
  onToggle: (name: string, enabled: boolean) => void;
  onForce: (name: string) => void;
  isForcing: boolean;
}) {
  const meta = ENGINE_META[engine.name] || { icon: Cpu, color: "slate", group: "System", desc: engine.name };
  const Icon = meta.icon;
  const statusStyle = STATUS_STYLES[engine.status] || STATUS_STYLES.disabled;
  const successRate = engine.runCount > 0 ? Math.round(((engine.runCount - engine.failureCount) / engine.runCount) * 100) : 0;

  return (
    <div
      className="relative rounded-xl border p-3 transition-all duration-300 group"
      style={{
        background: engine.enabled
          ? "linear-gradient(135deg, hsl(230 22% 8%) 0%, hsl(260 25% 11%) 100%)"
          : "hsl(220 15% 6%)",
        borderColor: engine.enabled ? `hsl(265 60% 40% / 0.25)` : `hsl(215 20% 20% / 0.3)`,
        boxShadow: engine.enabled ? statusStyle.glow : "none",
      }}
      data-testid={`card-engine-${engine.name}`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${COLOR_BG[meta.color] || "bg-slate-500/10"}`}>
            <Icon className={`w-3.5 h-3.5 ${COLOR_CLASSES[meta.color] || "text-slate-400"}`} />
          </div>
          <div>
            <div className="text-xs font-semibold capitalize leading-tight">{engine.name.replace(/-/g, " ")}</div>
            <div className="text-[10px] text-muted-foreground">{meta.group}</div>
          </div>
        </div>
        <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1 ${statusStyle.dot}`} />
      </div>

      <p className="text-[10px] text-muted-foreground mb-2 leading-snug">{meta.desc}</p>

      <div className="flex items-center justify-between mb-2">
        <Sparkline runs={engine.runs} />
        <div className="text-right">
          <div className={`text-xs font-bold metric-display ${successRate >= 80 ? "text-emerald-400" : successRate >= 50 ? "text-amber-400" : "text-red-400"}`}>
            {successRate}%
          </div>
          <div className="text-[9px] text-muted-foreground">success</div>
        </div>
      </div>

      <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-3">
        <span className="flex items-center gap-1">
          <Clock className="w-2.5 h-2.5" />
          {formatAgo(engine.lastRun)}
        </span>
        <span>{engine.runCount} runs</span>
      </div>

      <div className="flex items-center gap-1.5">
        <Button
          size="sm"
          variant="ghost"
          className={`h-6 flex-1 text-[10px] px-2 ${engine.enabled ? "text-red-400 hover:bg-red-500/10" : "text-emerald-400 hover:bg-emerald-500/10"}`}
          onClick={() => onToggle(engine.name, !engine.enabled)}
          data-testid={`button-toggle-${engine.name}`}
        >
          {engine.enabled ? <><Pause className="w-2.5 h-2.5 mr-1" />Pause</> : <><Play className="w-2.5 h-2.5 mr-1" />Enable</>}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0 text-muted-foreground hover:text-primary hover:bg-primary/10"
          onClick={() => onForce(engine.name)}
          disabled={!engine.enabled || engine.status === "running" || isForcing}
          data-testid={`button-force-${engine.name}`}
        >
          <RefreshCw className={`w-2.5 h-2.5 ${isForcing ? "animate-spin" : ""}`} />
        </Button>
      </div>
    </div>
  );
}

export default function AIMatrix() {
  const { toast } = useToast();
  const [log, setLog] = useState<string[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  const { data: autonomy, isLoading } = useQuery<AutonomyStatus>({
    queryKey: ["/api/nexus/autonomy/status"],
    refetchInterval: 10_000,
    staleTime: 5_000,
  });

  const { data: decisions } = useQuery<any[]>({
    queryKey: ["/api/nexus/autonomy/decisions"],
    refetchInterval: 15_000,
  });

  const toggleMutation = useMutation({
    mutationFn: ({ engine, enabled }: { engine: string; enabled: boolean }) =>
      apiRequest("POST", "/api/nexus/autonomy/toggle-engine", { engine, enabled }).then(r => r.json()),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/nexus/autonomy/status"] });
      const msg = `[${new Date().toLocaleTimeString()}] ${vars.engine} → ${vars.enabled ? "ENABLED" : "PAUSED"}`;
      setLog(prev => [msg, ...prev.slice(0, 49)]);
      toast({ title: vars.enabled ? "Engine enabled" : "Engine paused", description: vars.engine });
    },
  });

  const forceMutation = useMutation({
    mutationFn: (engine: string) =>
      apiRequest("POST", "/api/nexus/autonomy/force-run", { engine }).then(r => r.json()),
    onSuccess: (_, engine) => {
      queryClient.invalidateQueries({ queryKey: ["/api/nexus/autonomy/status"] });
      const msg = `[${new Date().toLocaleTimeString()}] FORCE RUN: ${engine}`;
      setLog(prev => [msg, ...prev.slice(0, 49)]);
      toast({ title: "Engine triggered", description: `${engine} is now running` });
    },
  });

  const engines = autonomy?.engines || [];
  const activeCount = engines.filter(e => e.enabled && e.status !== "disabled").length;
  const errorCount = engines.filter(e => e.status === "error").length;
  const totalRuns = engines.reduce((sum, e) => sum + (e.runCount || 0), 0);
  const overallSuccess = totalRuns > 0
    ? Math.round((engines.reduce((sum, e) => sum + (e.runCount - e.failureCount), 0) / totalRuns) * 100)
    : 0;

  useEffect(() => {
    if (Array.isArray(decisions) && decisions.length > 0) {
      const lines = decisions.slice(0, 5).map(d =>
        `[${new Date(d.createdAt || Date.now()).toLocaleTimeString()}] ${d.engineId || "AI"} → ${d.decision || d.action || "ran"}`
      );
      setLog(lines);
    }
  }, [decisions]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = 0;
  }, [log]);

  const pauseAll = () => {
    engines.filter(e => e.enabled).forEach(e => toggleMutation.mutate({ engine: e.name, enabled: false }));
  };

  const resumeAll = () => {
    engines.filter(e => !e.enabled).forEach(e => toggleMutation.mutate({ engine: e.name, enabled: true }));
  };

  const groups = engines.reduce((acc, e) => {
    const meta = ENGINE_META[e.name];
    const g = meta?.group || "System";
    if (!acc[g]) acc[g] = [];
    acc[g].push(e);
    return acc;
  }, {} as Record<string, Engine[]>);

  return (
    <div className="min-h-screen animated-gradient-bg">
      <div className="max-w-[1400px] mx-auto px-4 py-6 space-y-6">

        <div
          className="relative overflow-hidden rounded-2xl border border-primary/20 p-6"
          style={{
            background: "linear-gradient(135deg, hsl(230 22% 7%) 0%, hsl(265 30% 10%) 50%, hsl(220 25% 7%) 100%)",
            boxShadow: "0 0 60px hsl(265 80% 60% / 0.08)",
          }}
          data-testid="header-ai-matrix"
        >
          <div className="absolute inset-0 data-grid-bg opacity-30 pointer-events-none" />
          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center empire-glow">
                <Activity className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-bold holographic-text" data-testid="text-page-title">AI Operations Matrix</h1>
                <p className="text-[11px] text-muted-foreground">Real-time control of all autonomous AI engines</p>
              </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/30 border border-border/40">
                <span className="text-lg font-bold metric-display text-emerald-400" data-testid="text-active-engines">{activeCount}</span>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Active</span>
              </div>
              {errorCount > 0 && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20">
                  <span className="text-lg font-bold metric-display text-red-400">{errorCount}</span>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Errors</span>
                </div>
              )}
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/30 border border-border/40">
                <span className="text-lg font-bold metric-display text-primary" data-testid="text-success-rate">{overallSuccess}%</span>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Success</span>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-red-400 border-red-500/30 hover:bg-red-500/10 h-8"
                  onClick={pauseAll}
                  data-testid="button-pause-all"
                >
                  <Pause className="w-3.5 h-3.5 mr-1.5" />
                  Pause All
                </Button>
                <Button
                  size="sm"
                  className="h-8 bg-emerald-600 hover:bg-emerald-700"
                  onClick={resumeAll}
                  data-testid="button-resume-all"
                >
                  <Play className="w-3.5 h-3.5 mr-1.5" />
                  Resume All
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3 space-y-6">
            {isLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="h-40 rounded-xl bg-muted/20 animate-pulse" />
                ))}
              </div>
            ) : engines.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  <Bot className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p>No AI engines found. Start the autonomy controller to activate engines.</p>
                </CardContent>
              </Card>
            ) : (
              Object.entries(groups).map(([group, groupEngines]) => (
                <div key={group} data-testid={`section-group-${group}`}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{group}</span>
                    <div className="flex-1 h-px bg-border/30" />
                    <Badge variant="outline" className="text-[10px]">{groupEngines.length}</Badge>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                    {groupEngines.map(engine => (
                      <EngineCard
                        key={engine.name}
                        engine={engine}
                        onToggle={(name, enabled) => toggleMutation.mutate({ engine: name, enabled })}
                        onForce={(name) => forceMutation.mutate(name)}
                        isForcing={forceMutation.isPending && forceMutation.variables === engine.name}
                      />
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="space-y-4">
            <div
              className="rounded-xl border border-border/30 overflow-hidden"
              style={{ background: "hsl(220 25% 6%)" }}
            >
              <div className="px-3 py-2 border-b border-border/20 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Decision Log</span>
              </div>
              <div
                ref={logRef}
                className="p-3 space-y-1.5 h-96 overflow-y-auto"
                data-testid="section-decision-log"
              >
                {log.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground font-mono">No recent decisions...</p>
                ) : (
                  log.map((line, i) => (
                    <div
                      key={i}
                      className="text-[10px] font-mono text-emerald-400/70 leading-snug py-0.5 border-b border-border/10"
                    >
                      {line}
                    </div>
                  ))
                )}
              </div>
            </div>

            <Card className="border-border/30">
              <CardContent className="p-4 space-y-3">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Matrix Stats</h3>
                <div className="space-y-2">
                  {[
                    { label: "Total Engines", value: engines.length },
                    { label: "Active Engines", value: activeCount, color: "text-emerald-400" },
                    { label: "Error State", value: errorCount, color: errorCount > 0 ? "text-red-400" : "text-muted-foreground" },
                    { label: "Total Runs", value: totalRuns.toLocaleString(), color: "text-primary" },
                    { label: "Success Rate", value: `${overallSuccess}%`, color: overallSuccess >= 80 ? "text-emerald-400" : overallSuccess >= 60 ? "text-amber-400" : "text-red-400" },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="flex items-center justify-between">
                      <span className="text-[11px] text-muted-foreground">{label}</span>
                      <span className={`text-[11px] font-bold metric-display ${color || ""}`}>{value}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
