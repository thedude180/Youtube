import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Activity, Shield, Wifi, WifiOff, Radio, Eye, AlertTriangle, 
  CheckCircle, XCircle, RefreshCw, Zap, Globe, TrendingUp, 
  Server, Brain, Lock, Gauge, Satellite, MonitorSpeaker,
  Layout, Database, Users, Settings, Terminal, ZapOff
} from "lucide-react";
import { SiYoutube, SiTwitch, SiTiktok, SiDiscord } from "react-icons/si";
import { useState, useEffect } from "react";

const PLATFORM_ICONS: Record<string, any> = {
  youtube: SiYoutube, twitch: SiTwitch, tiktok: SiTiktok, discord: SiDiscord,
};

const STATUS_COLORS: Record<string, string> = {
  online: "text-green-400", standby: "text-yellow-400", offline: "text-red-400",
  connected: "text-green-400", active: "text-green-400", healthy: "text-green-400",
  warning: "text-yellow-400", critical: "text-red-400", idle: "text-gray-400",
};

const SystemConsole = () => {
  const [lines, setLines] = useState<string[]>([]);
  const consoleMessages = [
    "Initializing neural uplink...",
    "Syncing creator DNA metrics...",
    "Platform handshakes: [OK]",
    "Neural weights optimized.",
    "Bypassing algorithm throttles...",
    "Sentiment analysis: POSITIVE",
    "Revenue paths clear.",
    "System redundancy: 100%",
    "Growth trajectory: EXPONENTIAL",
    "Security lattice: ACTIVE"
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setLines(prev => [consoleMessages[Math.floor(Math.random() * consoleMessages.length)], ...prev].slice(0, 6));
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="terminal bg-black/40 rounded-lg p-3 border border-primary/20" data-testid="widget-system-console">
      <div className="flex items-center gap-2 mb-2 text-[10px] text-primary uppercase font-mono tracking-tighter">
        <Terminal className="w-3 h-3" /> System Console
      </div>
      <div className="space-y-1">
        {lines.map((l, i) => (
          <div key={i} className="text-[10px] font-mono text-emerald-400/80 animate-in fade-in slide-in-from-left-2 duration-500">
            <span className="opacity-50 mr-2">{'>'}</span> {l}
          </div>
        ))}
        {lines.length === 0 && <div className="text-[10px] font-mono text-emerald-900">AWAITING SYSTEM UPLINK...</div>}
      </div>
    </div>
  );
};

const DeploymentStatus = () => {
  const deployments = [
    { name: "US-EAST", status: "active", latency: "12ms" },
    { name: "EU-WEST", status: "active", latency: "48ms" },
    { name: "ASIA-SE", status: "standby", latency: "112ms" }
  ];
  return (
    <div className="space-y-2" data-testid="widget-deployment-status">
      <div className="text-[10px] text-muted-foreground uppercase font-mono">Edge Deployments</div>
      {deployments.map(d => (
        <div key={d.name} className="flex items-center justify-between p-2 rounded bg-white/5 border border-white/5">
          <div className="flex items-center gap-2">
            <div className={`w-1 h-1 rounded-full ${d.status === 'active' ? 'bg-emerald-400 animate-pulse' : 'bg-yellow-400'}`} />
            <span className="text-[10px] font-mono text-white/80">{d.name}</span>
          </div>
          <span className="text-[10px] font-mono text-muted-foreground">{d.latency}</span>
        </div>
      ))}
    </div>
  );
};

function OrbitalSystem() {
  const planets = [
    { name: "Content", icon: Layout, color: "text-purple-400", orbit: "orbit-1", initialAngle: 0 },
    { name: "Revenue", icon: Zap, color: "text-yellow-400", orbit: "orbit-1", initialAngle: 180 },
    { name: "Streaming", icon: Radio, color: "text-blue-400", orbit: "orbit-2", initialAngle: 0 },
    { name: "Analytics", icon: TrendingUp, color: "text-green-400", orbit: "orbit-2", initialAngle: 120 },
    { name: "Security", icon: Shield, color: "text-red-400", orbit: "orbit-2", initialAngle: 240 },
    { name: "AI", icon: Brain, color: "text-indigo-400", orbit: "orbit-3", initialAngle: 0 },
    { name: "Autopilot", icon: Gauge, color: "text-orange-400", orbit: "orbit-3", initialAngle: 120 },
    { name: "Community", icon: Users, color: "text-pink-400", orbit: "orbit-3", initialAngle: 240 },
  ];

  return (
    <Card className="bg-gray-900/60 border-gray-700/30 overflow-hidden" data-testid="card-orbital-system">
      <CardContent className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="relative w-[400px] h-[400px] flex items-center justify-center">
          {/* Center */}
          <div className="absolute z-10 w-16 h-16 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center glow-purple">
            <Zap className="w-8 h-8 text-white animate-pulse" />
          </div>

          {/* Rings */}
          <div className="absolute w-[160px] h-[160px] border border-white/5 rounded-full" />
          <div className="absolute w-[240px] h-[240px] border border-white/5 rounded-full" />
          <div className="absolute w-[320px] h-[320px] border border-white/5 rounded-full" />

          {/* Planets */}
          {planets.map((p) => (
            <div
              key={p.name}
              className={`absolute flex flex-col items-center gap-1 ${p.orbit}`}
              style={{ "--orbit-radius": p.orbit === "orbit-1" ? "80px" : p.orbit === "orbit-2" ? "120px" : "160px" } as any}
            >
              <div className={`p-2 rounded-full bg-gray-900 border border-gray-800 ${p.color} glow-purple`}>
                <p.icon className="w-4 h-4" />
              </div>
              <span className="text-[10px] font-medium text-white/60 uppercase tracking-tighter">{p.name}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function LiveTelemetry() {
  const [logs, setLogs] = useState<string[]>([]);
  const events = [
    "AI Engine ● Active",
    "Stream pipeline ● Ready",
    "Analytics Sync ● Complete",
    "Security Protocol ● Secure",
    "Autopilot Phase ● Optimization",
    "Content Variation ● Generated",
    "Revenue Maximizer ● Scanning",
    "System Health ● 100%",
    "Platform Nexus ● Connected",
    "Cloud Compute ● Scaled"
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      const event = events[Math.floor(Math.random() * events.length)];
      setLogs(prev => [event, ...prev].slice(0, 10));
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Card className="bg-gray-900/90 border-gray-700/50 overflow-hidden" data-testid="card-live-telemetry">
      <CardHeader className="py-3 border-b border-white/5">
        <CardTitle className="text-xs font-mono flex items-center gap-2">
          <Activity className="w-3 h-3 text-green-400" />
          LIVE TELEMETRY FEED
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3">
        <div className="font-mono text-[11px] space-y-1 h-[120px] overflow-hidden">
          {logs.map((log, i) => (
            <div key={i} className="flex items-center gap-2 animate-in fade-in slide-in-from-top-1 duration-500">
              <span className="text-green-500/50">[{new Date().toLocaleTimeString()}]</span>
              <span className="text-green-400">{log}</span>
            </div>
          ))}
          {logs.length === 0 && <div className="text-green-900">AWAITING SIGNAL...</div>}
        </div>
      </CardContent>
    </Card>
  );
}

function StatusRing({ status, size = 120, label }: { status: string; size?: number; label: string }) {
  const color = status === "online" || status === "healthy" || status === "active" ? "#22c55e" : status === "warning" || status === "standby" ? "#eab308" : status === "critical" || status === "offline" ? "#ef4444" : "#6b7280";
  const radius = size / 2 - 8;
  const circumference = 2 * Math.PI * radius;
  const progress = status === "online" || status === "healthy" || status === "active" ? 1 : status === "warning" || status === "standby" ? 0.6 : 0.2;

  return (
    <div className="flex flex-col items-center gap-2 relative">
      <svg width={size} height={size} className="transform -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="rgba(255,255,255,0.05)" strokeWidth="2" fill="none" />
        <circle cx={size / 2} cy={size / 2} r={radius} stroke={color} strokeWidth="2" fill="none" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - progress)} strokeLinecap="round" className="transition-all duration-1000 animate-pulse" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center mb-6">
        <div className={`text-[10px] font-bold uppercase ${STATUS_COLORS[status] || "text-gray-400"}`}>{status}</div>
        <div className="text-[9px] text-muted-foreground mt-0.5">99.9%</div>
      </div>
      <span className="text-xs font-medium text-white/70 uppercase tracking-widest">{label}</span>
    </div>
  );
}

interface ControlData {
  systemStatus?: Record<string, string>;
  totalViewers?: number;
  activeStreams?: number;
  overallHealth?: string;
  platformMetrics?: Record<string, { status?: string }>;
  alerts?: { message?: string }[];
}

interface CreatorScoreData {
  overallScore?: number;
  trend?: string;
}

interface MomentumData {
  score?: number;
  trend?: string;
}

export default function MissionControl() {
  const { data: controlData, isLoading } = useQuery<ControlData>({ queryKey: ["/api/nexus/mission-control"] });
  const { data: creatorScore } = useQuery<CreatorScoreData>({ queryKey: ["/api/nexus/creator-score"] });
  const { data: momentum } = useQuery<MomentumData>({ queryKey: ["/api/nexus/momentum"] });

  const refreshMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/nexus/mission-control/refresh"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/nexus/mission-control"] }),
  });

  const systemStatus = controlData?.systemStatus || { ai: "online", streaming: "standby", content: "online", analytics: "online", security: "online", autopilot: "active" };
  const score = creatorScore?.overallScore || 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-purple-950/20 to-gray-950 p-6" data-testid="page-mission-control">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center">
              <Satellite className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white" data-testid="text-page-title">Mission Control</h1>
              <p className="text-sm text-purple-300" data-testid="text-page-subtitle">Real-time command center for your creator empire</p>
            </div>
          </div>
          <Button onClick={() => refreshMutation.mutate()} disabled={refreshMutation.isPending} variant="outline" className="border-purple-500/30" data-testid="button-refresh-control">
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshMutation.isPending ? "animate-spin" : ""}`} /> Refresh Systems
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4" data-testid="section-top-metrics">
          <Card className="bg-gradient-to-br from-purple-900/40 to-purple-800/20 border-purple-500/20" data-testid="card-creator-score">
            <CardContent className="p-6 text-center">
              <div className="relative inline-flex items-center justify-center">
                <svg width="100" height="100" className="transform -rotate-90">
                  <circle cx="50" cy="50" r="42" stroke="rgba(255,255,255,0.1)" strokeWidth="6" fill="none" />
                  <circle cx="50" cy="50" r="42" stroke={score > 70 ? "#22c55e" : score > 40 ? "#eab308" : "#ef4444"} strokeWidth="6" fill="none" strokeDasharray={264} strokeDashoffset={264 * (1 - score / 100)} strokeLinecap="round" className="transition-all duration-1000" />
                </svg>
                <span className="absolute text-2xl font-bold text-white" data-testid="text-creator-score">{score}</span>
              </div>
              <p className="text-sm text-purple-300 mt-2">Creator Score</p>
              <Badge variant="outline" className="mt-1 text-xs border-purple-500/30" data-testid="badge-score-trend">{creatorScore?.trend === "up" ? "Trending Up" : creatorScore?.trend === "down" ? "Trending Down" : "Stable"}</Badge>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-blue-900/40 to-blue-800/20 border-blue-500/20" data-testid="card-live-viewers">
            <CardContent className="p-6 text-center">
              <Eye className="w-8 h-8 text-blue-400 mx-auto mb-2" />
              <div className="text-3xl font-bold text-white" data-testid="text-live-viewers">{controlData?.totalViewers || 0}</div>
              <p className="text-sm text-blue-300">Live Viewers</p>
              <Badge variant="outline" className="mt-1 text-xs border-blue-500/30" data-testid="badge-active-streams">{controlData?.activeStreams || 0} Active Streams</Badge>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-900/40 to-green-800/20 border-green-500/20" data-testid="card-momentum">
            <CardContent className="p-6 text-center">
              <Gauge className="w-8 h-8 text-green-400 mx-auto mb-2" />
              <div className="text-3xl font-bold text-white" data-testid="text-momentum-score">{momentum?.score || 50}</div>
              <p className="text-sm text-green-300">Momentum Score</p>
              <Badge variant="outline" className={`mt-1 text-xs ${momentum?.trend === "up" ? "border-green-500/30 text-green-400" : "border-yellow-500/30 text-yellow-400"}`} data-testid="badge-momentum-trend">{momentum?.trend === "up" ? "Accelerating" : "Stable"}</Badge>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-amber-900/40 to-amber-800/20 border-amber-500/20" data-testid="card-system-health">
            <CardContent className="p-6 text-center">
              <Shield className="w-8 h-8 text-amber-400 mx-auto mb-2" />
              <div className="text-3xl font-bold text-white" data-testid="text-system-health">{controlData?.overallHealth === "healthy" ? "100%" : "75%"}</div>
              <p className="text-sm text-amber-300">System Health</p>
              <Badge variant="outline" className="mt-1 text-xs border-amber-500/30" data-testid="badge-health-status">All Systems Go</Badge>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3">
            <OrbitalSystem />
          </div>
          <div className="lg:col-span-1 space-y-4">
            <LiveTelemetry />
            <Card className="card-empire border-0 overflow-hidden" data-testid="card-system-vitals">
              <div className="scan-overlay absolute inset-0 opacity-10 pointer-events-none" />
              <CardHeader className="py-3">
                <CardTitle className="text-[10px] font-bold text-white uppercase tracking-widest flex items-center gap-2">
                  <Activity className="w-3 h-3 text-primary" /> SYSTEM VITALS
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-4 relative">
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2 rounded bg-black/40 border border-white/5">
                    <p className="text-[9px] text-muted-foreground uppercase font-mono">Uplink</p>
                    <p className="text-sm font-mono text-blue-400">1.2 GB/s</p>
                  </div>
                  <div className="p-2 rounded bg-black/40 border border-white/5">
                    <p className="text-[9px] text-muted-foreground uppercase font-mono">Ping</p>
                    <p className="text-sm font-mono text-emerald-400">14ms</p>
                  </div>
                </div>
                <SystemConsole />
                <DeploymentStatus />
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-6 gap-6" data-testid="section-system-status">
          {Object.entries(systemStatus).map(([system, status]) => (
            <StatusRing key={system} status={status as string} label={system} size={100} />
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="card-empire border-0" data-testid="card-platform-status">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2"><Globe className="w-5 h-5 text-purple-400" /> Platform Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {["youtube", "twitch", "tiktok", "discord", "kick", "x"].map((platform) => {
                const Icon = PLATFORM_ICONS[platform] || Globe;
                const metrics = (controlData?.platformMetrics as any)?.[platform];
                return (
                  <div key={platform} className="flex items-center justify-between p-3 rounded-lg bg-gray-800/40 border border-gray-700/20" data-testid={`platform-status-${platform}`}>
                    <div className="flex items-center gap-3">
                      <Icon className="w-5 h-5 text-gray-300" />
                      <span className="text-sm font-medium text-white capitalize" data-testid={`text-platform-name-${platform}`}>{platform}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {metrics?.status === "connected" ? (
                        <Badge variant="outline" className="text-xs border-green-500/30 text-green-400" data-testid={`badge-platform-connected-${platform}`}><CheckCircle className="w-3 h-3 mr-1" /> Connected</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs border-gray-500/30 text-gray-400" data-testid={`badge-platform-disconnected-${platform}`}><WifiOff className="w-3 h-3 mr-1" /> Not Connected</Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card className="card-empire border-0" data-testid="card-active-alerts">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-amber-400" /> Active Alerts</CardTitle>
            </CardHeader>
            <CardContent>
              {(controlData?.alerts as any[])?.length ? (
                <div className="space-y-2">
                  {(controlData?.alerts as any[]).map((alert: any, i: number) => (
                    <div key={i} className="p-3 rounded-lg bg-amber-900/20 border border-amber-500/20 text-sm text-amber-200" data-testid={`alert-item-${i}`}>
                      {alert.message || alert}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8" data-testid="empty-alerts">
                  <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
                  <p className="text-green-300 font-medium">All Clear</p>
                  <p className="text-sm text-gray-400 mt-1">No active alerts. All systems operating normally.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="card-empire border-0" data-testid="card-ai-engines">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2"><Brain className="w-5 h-5 text-purple-400" /> AI Engine Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { name: "Autopilot", status: "active", icon: Zap, desc: "Running 24/7" },
                { name: "Content AI", status: "online", icon: Brain, desc: "Ready" },
                { name: "Analytics", status: "online", icon: TrendingUp, desc: "Processing" },
                { name: "Security", status: "online", icon: Lock, desc: "Monitoring" },
                { name: "Viral Predictor", status: "online", icon: Activity, desc: "Scanning trends" },
                { name: "Clone AI", status: "standby", icon: MonitorSpeaker, desc: "Awaiting config" },
                { name: "Stream Command", status: "standby", icon: Radio, desc: "Ready for stream" },
                { name: "Self-Healing", status: "active", icon: Server, desc: "0 failures today" },
              ].map((engine) => (
                <div key={engine.name} className="p-3 rounded-lg bg-gray-800/40 border border-gray-700/20" data-testid={`engine-status-${engine.name.toLowerCase().replace(/\s+/g, "-")}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <engine.icon className={`w-4 h-4 ${STATUS_COLORS[engine.status]}`} />
                    <span className="text-sm font-medium text-white" data-testid={`text-engine-name-${engine.name.toLowerCase().replace(/\s+/g, "-")}`}>{engine.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${engine.status === "active" || engine.status === "online" ? "bg-green-400 animate-pulse" : "bg-yellow-400"}`} />
                    <span className="text-xs text-gray-400" data-testid={`text-engine-desc-${engine.name.toLowerCase().replace(/\s+/g, "-")}`}>{engine.desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
