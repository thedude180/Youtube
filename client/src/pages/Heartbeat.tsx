import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Activity, Heart, Zap, Brain, Shield, Clock, CheckCircle, XCircle,
  AlertTriangle, Play, Pause, RefreshCw, BarChart3, Timer, Cpu, Eye,
  Waves, ActivitySquare
} from "lucide-react";

const NeuralPulse = () => {
  return (
    <div className="relative h-24 w-full overflow-hidden bg-black/20 rounded-lg border border-primary/10 flex items-center justify-center" data-testid="widget-neural-pulse">
      <div className="absolute inset-0 flex items-center justify-center opacity-20">
        <div className="w-full h-[1px] bg-primary/50 animate-pulse" />
      </div>
      <div className="flex gap-1 items-end h-12">
        {Array.from({ length: 40 }).map((_, i) => {
          const seed = ((i * 7 + 13) * 31) % 100;
          const seed2 = ((i * 11 + 7) * 17) % 100;
          return (
            <div
              key={i}
              className="w-1 bg-primary/40 rounded-t"
              style={{
                height: `${20 + seed * 0.8}%`,
                animation: `pulse ${1 + seed2 * 0.01}s ease-in-out infinite`
              }}
            />
          );
        })}
      </div>
      <div className="absolute top-2 left-3 flex items-center gap-2">
        <ActivitySquare className="w-3 h-3 text-primary animate-pulse" />
        <span className="text-[10px] font-mono text-primary/80 uppercase tracking-tighter">Neural Oscilloscope</span>
      </div>
    </div>
  );
};

const SystemUptimeGauge = ({ uptime }: { uptime: string }) => {
  return (
    <div className="space-y-3" data-testid="widget-uptime-gauge">
      <div className="flex justify-between items-end">
        <span className="text-[10px] font-mono text-muted-foreground uppercase">Session Continuity</span>
        <span className="text-xs font-mono text-emerald-400">99.99%</span>
      </div>
      <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
        <div className="h-full bg-emerald-500/60 rounded-full w-[99.99%]" style={{ animation: 'gradient-shift 4s ease infinite', backgroundSize: '200% 200%' }} />
      </div>
      <div className="flex justify-between text-[9px] font-mono text-muted-foreground/50">
        <span>0ms</span>
        <span>UPTIME: {uptime}</span>
      </div>
    </div>
  );
};

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    running: "bg-blue-400 animate-pulse",
    idle: "bg-green-400",
    completed: "bg-green-400",
    error: "bg-red-400 animate-pulse",
    disabled: "bg-gray-600",
  };
  return <div className={`w-2.5 h-2.5 rounded-full ${colors[status] || "bg-gray-500"}`} />;
}

function formatTimeAgo(dateStr: string | null) {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

function formatNextRun(dateStr: string | null) {
  if (!dateStr) return "—";
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff <= 0) return "Due now";
  if (diff < 60000) return `${Math.ceil(diff / 1000)}s`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  return `${Math.floor(diff / 3600000)}h ${Math.floor((diff % 3600000) / 60000)}m`;
}

function Sparkline({ data }: { data: number[] }) {
  const max = Math.max(...data, 1);
  const points = data.map((d, i) => `${(i / (data.length - 1)) * 100},${40 - (d / max) * 40}`).join(" ");
  return (
    <svg viewBox="0 0 100 40" className="w-16 h-8">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function HealthTimeline({ runs }: { runs: any[] }) {
  // Simple 24h simulation based on real runs
  const hourlyHealth = Array.from({ length: 24 }).map((_, i) => {
    const hourRuns = runs.filter(r => new Date(r.startedAt).getHours() === i);
    if (hourRuns.length === 0) return "idle";
    return hourRuns.every(r => r.status === "completed") ? "healthy" : "error";
  });

  return (
    <Card className="card-empire border-0" data-testid="card-health-timeline">
      <CardHeader className="py-2 px-4 border-b border-white/5">
        <CardTitle className="text-xs font-mono text-muted-foreground uppercase tracking-widest">24-Hour System Health</CardTitle>
      </CardHeader>
      <CardContent className="p-4">
        <div className="flex gap-1 h-8">
          {hourlyHealth.map((status, i) => (
            <div
              key={i}
              className={`flex-1 rounded-sm ${
                status === "healthy" ? "bg-green-500/40" : status === "error" ? "bg-red-500/40" : "bg-gray-800"
              }`}
              title={`Hour ${i}: ${status}`}
            />
          ))}
        </div>
        <div className="flex justify-between mt-1 text-[10px] text-muted-foreground font-mono">
          <span>00:00</span>
          <span>12:00</span>
          <span>23:59</span>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Heartbeat() {
  const { data: status, isLoading } = useQuery({ queryKey: ["/api/nexus/autonomy/status"], refetchInterval: 30000 });
  const { data: decisionsData } = useQuery({ queryKey: ["/api/nexus/autonomy/decisions"] });
  const { data: runs = [] } = useQuery({ queryKey: ["/api/nexus/autonomy/runs"] });

  const toggleEngine = useMutation({
    mutationFn: ({ engineName, enabled }: { engineName: string; enabled: boolean }) =>
      apiRequest("POST", "/api/nexus/autonomy/toggle-engine", { engineName, enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/nexus/autonomy/status"] }),
  });

  const forceRun = useMutation({
    mutationFn: (engineName: string) => apiRequest("POST", "/api/nexus/autonomy/force-run", { engineName }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/nexus/autonomy/status"] }),
  });

  if (isLoading) return <div className="min-h-screen bg-gradient-to-br from-gray-950 to-gray-950 flex items-center justify-center"><div className="animate-spin w-8 h-8 border-2 border-green-400 border-t-transparent rounded-full" /></div>;

  const s = status as any || {};
  const engines = s.engines || [];
  const decisions = (decisionsData as any)?.decisions || [];

  const healthColor = s.overallHealth > 80 ? "text-green-400" : s.overallHealth > 50 ? "text-yellow-400" : "text-red-400";

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-green-950/10 to-gray-950 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-600 to-emerald-600 flex items-center justify-center relative">
              <Heart className="w-6 h-6 text-white" />
              <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-green-400 animate-pulse" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white" data-testid="text-page-title">AI Engine Heartbeat</h1>
              <p className="text-sm text-green-300">15 autonomous AI engines running 24/7 — exception-only alerts</p>
            </div>
          </div>
          <Badge variant="outline" className={`text-lg px-4 py-1 ${s.cycleStatus === "active" ? "border-green-500/30 text-green-400" : "border-red-500/30 text-red-400"}`}>
            {s.cycleStatus === "active" ? "AUTONOMY ACTIVE" : "PAUSED"}
          </Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
          <Card className="card-empire md:col-span-1 overflow-hidden relative border-0" data-testid="card-overall-health-score" id="card-health-score">
            <div className="data-grid-bg absolute inset-0 opacity-5 pointer-events-none" />
            <div className="scan-overlay absolute inset-0 opacity-10 pointer-events-none" />
            <CardContent className="p-8 flex flex-col items-center justify-center text-center relative">
              <div className="flex items-center gap-2 mb-4">
                <span className="holographic-text text-sm font-bold uppercase tracking-wider">System Health</span>
                <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-mono animate-pulse">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />LIVE
                </span>
              </div>
              <div className="relative inline-flex items-center justify-center mb-6">
                <svg width="160" height="160" className="transform -rotate-90" data-testid="svg-health-gauge">
                  <circle cx="80" cy="80" r="70" stroke="rgba(255,255,255,0.05)" strokeWidth="8" fill="none" />
                  <circle cx="80" cy="80" r="70" stroke={s.overallHealth > 80 ? "#22c55e" : s.overallHealth > 50 ? "#eab308" : "#ef4444"} strokeWidth="8" fill="none" strokeDasharray={440} strokeDashoffset={440 * (1 - (s.overallHealth || 0) / 100)} strokeLinecap="round" className="transition-all duration-1000" style={{ filter: `drop-shadow(0 0 8px ${s.overallHealth > 80 ? "#22c55e80" : "#eab30880"})` }} />
                </svg>
                <div className="absolute flex flex-col items-center">
                  <span className={`text-4xl font-bold metric-display ${healthColor}`}>{s.overallHealth || 0}%</span>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-widest">Global Health</span>
                </div>
              </div>
              <div className="flex gap-2 mb-3 flex-wrap justify-center">
                <span className="text-xs px-2 py-0.5 rounded-full font-mono bg-emerald-500/20 text-emerald-400" data-testid="badge-healthy">
                  {engines.filter((e: any) => e.status === 'running' || e.status === 'idle' || e.status === 'completed').length} Healthy
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full font-mono bg-red-500/20 text-red-400" data-testid="badge-unhealthy">
                  {engines.filter((e: any) => e.status === 'error' || e.status === 'disabled').length} Issues
                </span>
              </div>
              <div className="w-full space-y-4">
                <NeuralPulse />
                <SystemUptimeGauge uptime={s.uptime || "0h"} />
              </div>
            </CardContent>
            <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-green-500 via-emerald-400 to-green-500" style={{ animation: "gradient-shift 3s ease infinite", backgroundSize: "200% 200%" }} />
          </Card>

          <div className="md:col-span-2 space-y-6">
            <HealthTimeline runs={runs} />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4" data-testid="section-heartbeat-metrics">
              <Card className="card-empire border-0" data-testid="card-autonomy-level">
                <CardContent className="p-4">
                  <Cpu className="w-5 h-5 text-blue-400 mb-2" />
                  <p className="text-2xl font-bold text-white metric-display">{s.autonomyLevel || 0}%</p>
                  <p className="text-[10px] text-muted-foreground uppercase">Autonomy</p>
                </CardContent>
              </Card>
              <Card className="card-empire border-0" data-testid="card-engines-active">
                <CardContent className="p-4">
                  <Zap className="w-5 h-5 text-yellow-400 mb-2" />
                  <p className="text-2xl font-bold text-white metric-display">{s.enabledEngines || 0}/{s.totalEngines || 15}</p>
                  <p className="text-[10px] text-muted-foreground uppercase">Engines</p>
                </CardContent>
              </Card>
              <Card className="card-empire border-0" data-testid="card-runs-today">
                <CardContent className="p-4">
                  <BarChart3 className="w-5 h-5 text-purple-400 mb-2" />
                  <p className="text-2xl font-bold text-white metric-display">{s.decisionsToday || 0}</p>
                  <p className="text-[10px] text-muted-foreground uppercase">Runs Today</p>
                </CardContent>
              </Card>
              <Card className="card-empire border-0" data-testid="card-uptime">
                <CardContent className="p-4">
                  <Timer className="w-5 h-5 text-cyan-400 mb-2" />
                  <p className="text-2xl font-bold text-white metric-display">{s.uptime || "0h"}</p>
                  <p className="text-[10px] text-muted-foreground uppercase">Uptime</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        <Tabs defaultValue="engines" className="space-y-4">
          <TabsList className="bg-gray-900/60 border border-gray-700/30 p-1">
            <TabsTrigger value="engines" data-testid="tab-engines">Live Engines ({engines.length})</TabsTrigger>
            <TabsTrigger value="decisions" data-testid="tab-decisions">Decision Log</TabsTrigger>
            <TabsTrigger value="runs" data-testid="tab-runs">Run History</TabsTrigger>
          </TabsList>

          <TabsContent value="engines" className="space-y-3">
            {engines.length === 0 && (
              <Card className="card-empire border-0">
                <CardContent className="py-12 text-center">
                  <Cpu className="w-12 h-12 text-blue-400 mx-auto mb-3 opacity-60" />
                  <p className="text-gray-300 font-medium">No Engines Registered</p>
                  <p className="text-sm text-gray-400 mt-1 max-w-md mx-auto">AI engines will appear here once the autonomy system initializes. Each engine handles a specific aspect of your creator workflow.</p>
                </CardContent>
              </Card>
            )}
            {engines.map((engine: any) => (
              <Card key={engine.name} className={`transition-all duration-300 hover:border-primary/30 ${engine.status === "error" ? "bg-red-900/20 border-red-500/30 threat-pulse" : engine.status === "running" ? "bg-blue-900/10 border-blue-500/30" : "bg-gray-900/60 border-gray-700/30"}`} data-testid={`card-engine-${engine.name}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      <StatusDot status={engine.status} />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-white">{engine.label}</span>
                          <Badge variant="outline" className={`text-xs ${
                            engine.status === "running" ? "border-blue-500/30 text-blue-400" :
                            engine.status === "error" ? "border-red-500/30 text-red-400" :
                            engine.status === "disabled" ? "border-gray-500/30 text-gray-400" :
                            "border-green-500/30 text-green-400"
                          }`}>{engine.status}</Badge>
                          {engine.failureCount > 0 && <Badge variant="outline" className="text-xs border-orange-500/30 text-orange-400">{engine.failureCount} failures</Badge>}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">{engine.description}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-6 text-xs text-gray-400">
                      <div className="hidden md:block">
                        <p className="text-white/80 font-mono">{formatTimeAgo(engine.lastRun)}</p>
                        <p className="text-[10px] text-gray-500 uppercase tracking-tighter">Last Run</p>
                      </div>
                      <div className="hidden md:block">
                        <p className="text-white/80 font-mono">{formatNextRun(engine.nextRun)}</p>
                        <p className="text-[10px] text-gray-500 uppercase tracking-tighter">Next Run</p>
                      </div>
                      <div className="hidden lg:block w-24">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[9px] uppercase">Success Rate</span>
                          <span className={`text-[10px] font-mono ${engine.successRate > 0.9 ? "text-green-400" : "text-yellow-400"}`}>{(engine.successRate * 100).toFixed(0)}%</span>
                        </div>
                        <div className="h-1 w-full bg-gray-800 rounded-full overflow-hidden">
                          <div className={`h-full transition-all duration-1000 ${engine.successRate > 0.9 ? "bg-green-500" : "bg-yellow-500"}`} style={{ width: `${engine.successRate * 100}%` }} />
                        </div>
                      </div>
                      <div className="hidden xl:block">
                        <Sparkline data={runs.filter((r: any) => r.engineName === engine.name).map((r: any) => r.durationMs).slice(0, 7)} />
                        <p className="text-[9px] text-center text-gray-500 uppercase mt-0.5">Latency</p>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => forceRun.mutate(engine.name)} disabled={!engine.enabled || engine.status === "running"} className="h-7 w-7 p-0 hover:bg-white/5" data-testid={`button-force-run-${engine.name}`}>
                        <Play className="w-3 h-3" />
                      </Button>
                      <Switch checked={engine.enabled} onCheckedChange={(enabled) => toggleEngine.mutate({ engineName: engine.name, enabled })} data-testid={`switch-engine-${engine.name}`} />
                    </div>
                  </div>
                  {engine.lastError && (
                    <div className="mt-2 p-2 rounded bg-red-900/20 border border-red-500/20">
                      <p className="text-xs text-red-400"><AlertTriangle className="w-3 h-3 inline mr-1" />{engine.lastError}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="decisions">
            <Card className="card-empire border-0" data-testid="card-decision-log">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2"><Brain className="w-5 h-5 text-purple-400" /> AI Decision Log</CardTitle>
              </CardHeader>
              <CardContent>
                {decisions.length ? (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {decisions.map((d: any) => (
                      <div key={d.id} className="flex items-start gap-3 p-3 rounded-lg bg-gray-800/40 border border-gray-700/20" data-testid={`decision-item-${d.id}`}>
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${d.outcome === "executed" ? "bg-green-900/50" : "bg-red-900/50"}`}>
                          {d.outcome === "executed" ? <CheckCircle className="w-3 h-3 text-green-400" /> : <XCircle className="w-3 h-3 text-red-400" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs capitalize" data-testid={`badge-decision-engine-${d.id}`}>{d.engine.replace(/_/g, " ")}</Badge>
                            <span className="text-xs text-gray-400">{formatTimeAgo(d.timestamp)}</span>
                            {d.confidence && <span className="text-xs text-gray-500" data-testid={`text-decision-confidence-${d.id}`}>{(d.confidence * 100).toFixed(0)}% confidence</span>}
                          </div>
                          <p className="text-xs text-gray-300 mt-1 truncate" data-testid={`text-decision-text-${d.id}`}>{d.decision}</p>
                          {d.reasoning && <p className="text-xs text-gray-500 mt-0.5">{d.reasoning}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12" data-testid="empty-decisions">
                    <Brain className="w-12 h-12 text-purple-400 mx-auto mb-3" />
                    <p className="text-gray-300">AI Decision Log</p>
                    <p className="text-sm text-gray-400 mt-1">Every autonomous decision made by the AI will be logged here with reasoning and confidence levels.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="runs">
            <Card className="card-empire border-0" data-testid="card-run-history">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2"><Clock className="w-5 h-5 text-cyan-400" /> Run History</CardTitle>
              </CardHeader>
              <CardContent>
                {(runs as any[]).length ? (
                  <div className="space-y-1 max-h-96 overflow-y-auto">
                    {(runs as any[]).map((run: any) => (
                      <div key={run.id} className="flex items-center justify-between p-2 rounded bg-gray-800/40 text-xs" data-testid={`run-item-${run.id}`}>
                        <div className="flex items-center gap-2">
                          {run.status === "completed" ? <CheckCircle className="w-3 h-3 text-green-400" /> : <XCircle className="w-3 h-3 text-red-400" />}
                          <span className="text-gray-300 capitalize" data-testid={`text-run-engine-${run.id}`}>{run.engineName?.replace(/_/g, " ")}</span>
                        </div>
                        <div className="flex items-center gap-4 text-gray-400">
                          <span data-testid={`text-run-actions-${run.id}`}>{run.actionsExecuted} actions</span>
                          <span>{run.durationMs}ms</span>
                          <span>{formatTimeAgo(run.startedAt)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12" data-testid="empty-runs">
                    <Clock className="w-12 h-12 text-cyan-400 mx-auto mb-3 opacity-60" />
                    <p className="text-gray-300 font-medium">No Run History Yet</p>
                    <p className="text-sm text-gray-400 mt-1 max-w-md mx-auto">Run history will appear after the first autonomy cycle completes. Every engine execution is logged with duration, actions taken, and success status.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Card className="bg-green-900/10 border-green-500/20" data-testid="card-exception-mode">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Eye className="w-5 h-5 text-green-400 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-green-300" data-testid="text-exception-mode">Exception-Only Mode Active</p>
                <p className="text-xs text-gray-400 mt-1">All 15 engines run silently in the background. You'll only be notified when something needs your attention — engine failures, content strikes, engagement crashes, or platform bans. Everything else is handled automatically.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
