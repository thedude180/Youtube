import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Activity, Heart, Zap, Brain, Shield, Clock, CheckCircle, XCircle,
  AlertTriangle, Play, Pause, RefreshCw, BarChart3, Timer, Cpu, Eye
} from "lucide-react";

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

        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <Card className="bg-gray-900/60 border-gray-700/30">
            <CardContent className="p-3 text-center">
              <Heart className={`w-6 h-6 mx-auto mb-1 ${healthColor}`} />
              <p className={`text-xl font-bold ${healthColor}`}>{s.overallHealth || 0}%</p>
              <p className="text-xs text-gray-400">System Health</p>
            </CardContent>
          </Card>
          <Card className="bg-gray-900/60 border-gray-700/30">
            <CardContent className="p-3 text-center">
              <Cpu className="w-6 h-6 mx-auto mb-1 text-blue-400" />
              <p className="text-xl font-bold text-white">{s.autonomyLevel || 0}%</p>
              <p className="text-xs text-gray-400">Autonomy Level</p>
            </CardContent>
          </Card>
          <Card className="bg-gray-900/60 border-gray-700/30">
            <CardContent className="p-3 text-center">
              <Zap className="w-6 h-6 mx-auto mb-1 text-yellow-400" />
              <p className="text-xl font-bold text-white">{s.enabledEngines || 0}/{s.totalEngines || 15}</p>
              <p className="text-xs text-gray-400">Engines Active</p>
            </CardContent>
          </Card>
          <Card className="bg-gray-900/60 border-gray-700/30">
            <CardContent className="p-3 text-center">
              <BarChart3 className="w-6 h-6 mx-auto mb-1 text-purple-400" />
              <p className="text-xl font-bold text-white">{s.decisionsToday || 0}</p>
              <p className="text-xs text-gray-400">Runs Today</p>
            </CardContent>
          </Card>
          <Card className="bg-gray-900/60 border-gray-700/30">
            <CardContent className="p-3 text-center">
              <Activity className="w-6 h-6 mx-auto mb-1 text-emerald-400" />
              <p className="text-xl font-bold text-white">{s.totalActionsToday || 0}</p>
              <p className="text-xs text-gray-400">Actions Today</p>
            </CardContent>
          </Card>
          <Card className="bg-gray-900/60 border-gray-700/30">
            <CardContent className="p-3 text-center">
              <Timer className="w-6 h-6 mx-auto mb-1 text-cyan-400" />
              <p className="text-xl font-bold text-white">{s.uptime || "0h"}</p>
              <p className="text-xs text-gray-400">Uptime</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="engines" className="space-y-4">
          <TabsList className="bg-gray-900/60 border border-gray-700/30 p-1">
            <TabsTrigger value="engines" data-testid="tab-engines">Live Engines ({engines.length})</TabsTrigger>
            <TabsTrigger value="decisions" data-testid="tab-decisions">Decision Log</TabsTrigger>
            <TabsTrigger value="runs" data-testid="tab-runs">Run History</TabsTrigger>
          </TabsList>

          <TabsContent value="engines" className="space-y-3">
            {engines.map((engine: any) => (
              <Card key={engine.name} className={`border ${engine.status === "error" ? "bg-red-900/20 border-red-500/20" : engine.status === "running" ? "bg-blue-900/10 border-blue-500/20" : "bg-gray-900/60 border-gray-700/30"}`} data-testid={`card-engine-${engine.name}`}>
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
                      <div className="text-center hidden md:block">
                        <p>{formatTimeAgo(engine.lastRun)}</p>
                        <p className="text-gray-500">Last Run</p>
                      </div>
                      <div className="text-center hidden md:block">
                        <p>{formatNextRun(engine.nextRun)}</p>
                        <p className="text-gray-500">Next Run</p>
                      </div>
                      <div className="text-center hidden md:block">
                        <p>{engine.tasksCompleted}</p>
                        <p className="text-gray-500">Runs</p>
                      </div>
                      <div className="text-center hidden md:block">
                        <p>{engine.totalActions}</p>
                        <p className="text-gray-500">Actions</p>
                      </div>
                      <div className="text-center hidden lg:block">
                        <p className={engine.successRate > 0.9 ? "text-green-400" : engine.successRate > 0.7 ? "text-yellow-400" : "text-red-400"}>{(engine.successRate * 100).toFixed(0)}%</p>
                        <p className="text-gray-500">Success</p>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => forceRun.mutate(engine.name)} disabled={!engine.enabled || engine.status === "running"} className="h-7 w-7 p-0" data-testid={`button-force-run-${engine.name}`}>
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
            <Card className="bg-gray-900/60 border-gray-700/30">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2"><Brain className="w-5 h-5 text-purple-400" /> AI Decision Log</CardTitle>
              </CardHeader>
              <CardContent>
                {decisions.length ? (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {decisions.map((d: any) => (
                      <div key={d.id} className="flex items-start gap-3 p-3 rounded-lg bg-gray-800/40 border border-gray-700/20">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${d.outcome === "executed" ? "bg-green-900/50" : "bg-red-900/50"}`}>
                          {d.outcome === "executed" ? <CheckCircle className="w-3 h-3 text-green-400" /> : <XCircle className="w-3 h-3 text-red-400" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs capitalize">{d.engine.replace(/_/g, " ")}</Badge>
                            <span className="text-xs text-gray-400">{formatTimeAgo(d.timestamp)}</span>
                            {d.confidence && <span className="text-xs text-gray-500">{(d.confidence * 100).toFixed(0)}% confidence</span>}
                          </div>
                          <p className="text-xs text-gray-300 mt-1 truncate">{d.decision}</p>
                          {d.reasoning && <p className="text-xs text-gray-500 mt-0.5">{d.reasoning}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Brain className="w-12 h-12 text-purple-400 mx-auto mb-3" />
                    <p className="text-gray-300">AI Decision Log</p>
                    <p className="text-sm text-gray-400 mt-1">Every autonomous decision made by the AI will be logged here with reasoning and confidence levels.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="runs">
            <Card className="bg-gray-900/60 border-gray-700/30">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2"><Clock className="w-5 h-5 text-cyan-400" /> Run History</CardTitle>
              </CardHeader>
              <CardContent>
                {(runs as any[]).length ? (
                  <div className="space-y-1 max-h-96 overflow-y-auto">
                    {(runs as any[]).map((run: any) => (
                      <div key={run.id} className="flex items-center justify-between p-2 rounded bg-gray-800/40 text-xs">
                        <div className="flex items-center gap-2">
                          {run.status === "completed" ? <CheckCircle className="w-3 h-3 text-green-400" /> : <XCircle className="w-3 h-3 text-red-400" />}
                          <span className="text-gray-300 capitalize">{run.engineName?.replace(/_/g, " ")}</span>
                        </div>
                        <div className="flex items-center gap-4 text-gray-400">
                          <span>{run.actionsExecuted} actions</span>
                          <span>{run.durationMs}ms</span>
                          <span>{formatTimeAgo(run.startedAt)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-gray-400">Run history will appear after the first autonomy cycle completes.</div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Card className="bg-green-900/10 border-green-500/20">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Eye className="w-5 h-5 text-green-400 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-green-300">Exception-Only Mode Active</p>
                <p className="text-xs text-gray-400 mt-1">All 15 engines run silently in the background. You'll only be notified when something needs your attention — engine failures, content strikes, engagement crashes, or platform bans. Everything else is handled automatically.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
