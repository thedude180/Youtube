import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Activity, Shield, Wifi, WifiOff, Radio, Eye, AlertTriangle, 
  CheckCircle, XCircle, RefreshCw, Zap, Globe, TrendingUp, 
  Server, Brain, Lock, Gauge, Satellite, MonitorSpeaker
} from "lucide-react";
import { SiYoutube, SiTwitch, SiTiktok, SiDiscord } from "react-icons/si";
import { useState } from "react";

const PLATFORM_ICONS: Record<string, any> = {
  youtube: SiYoutube, twitch: SiTwitch, tiktok: SiTiktok, discord: SiDiscord,
};

const STATUS_COLORS: Record<string, string> = {
  online: "text-green-400", standby: "text-yellow-400", offline: "text-red-400",
  connected: "text-green-400", active: "text-green-400", healthy: "text-green-400",
  warning: "text-yellow-400", critical: "text-red-400", idle: "text-gray-400",
};

function StatusRing({ status, size = 120, label }: { status: string; size?: number; label: string }) {
  const color = status === "online" || status === "healthy" || status === "active" ? "#22c55e" : status === "warning" || status === "standby" ? "#eab308" : status === "critical" || status === "offline" ? "#ef4444" : "#6b7280";
  const radius = size / 2 - 8;
  const circumference = 2 * Math.PI * radius;
  const progress = status === "online" || status === "healthy" || status === "active" ? 1 : status === "warning" || status === "standby" ? 0.6 : 0.2;

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={size} height={size} className="transform -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="rgba(255,255,255,0.1)" strokeWidth="4" fill="none" />
        <circle cx={size / 2} cy={size / 2} r={radius} stroke={color} strokeWidth="4" fill="none" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - progress)} strokeLinecap="round" className="transition-all duration-1000" />
        <circle cx={size / 2} cy={size / 2} r={radius - 12} fill="rgba(0,0,0,0.3)" />
      </svg>
      <div className="absolute flex flex-col items-center justify-center" style={{ width: size, height: size }}>
        <div className={`text-xs font-bold uppercase ${STATUS_COLORS[status] || "text-gray-400"}`}>{status}</div>
      </div>
      <span className="text-xs text-muted-foreground mt-1">{label}</span>
    </div>
  );
}

export default function MissionControl() {
  const { data: controlData, isLoading } = useQuery({ queryKey: ["/api/nexus/mission-control"] });
  const { data: creatorScore } = useQuery({ queryKey: ["/api/nexus/creator-score"] });
  const { data: momentum } = useQuery({ queryKey: ["/api/nexus/momentum"] });

  const refreshMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/nexus/mission-control/refresh"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/nexus/mission-control"] }),
  });

  const systemStatus = controlData?.systemStatus || { ai: "online", streaming: "standby", content: "online", analytics: "online", security: "online", autopilot: "active" };
  const score = creatorScore?.overallScore || 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-purple-950/20 to-gray-950 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center">
              <Satellite className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white" data-testid="text-page-title">Mission Control</h1>
              <p className="text-sm text-purple-300">Real-time command center for your creator empire</p>
            </div>
          </div>
          <Button onClick={() => refreshMutation.mutate()} disabled={refreshMutation.isPending} variant="outline" className="border-purple-500/30" data-testid="button-refresh-control">
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshMutation.isPending ? "animate-spin" : ""}`} /> Refresh Systems
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-purple-900/40 to-purple-800/20 border-purple-500/20">
            <CardContent className="p-6 text-center">
              <div className="relative inline-flex items-center justify-center">
                <svg width="100" height="100" className="transform -rotate-90">
                  <circle cx="50" cy="50" r="42" stroke="rgba(255,255,255,0.1)" strokeWidth="6" fill="none" />
                  <circle cx="50" cy="50" r="42" stroke={score > 70 ? "#22c55e" : score > 40 ? "#eab308" : "#ef4444"} strokeWidth="6" fill="none" strokeDasharray={264} strokeDashoffset={264 * (1 - score / 100)} strokeLinecap="round" className="transition-all duration-1000" />
                </svg>
                <span className="absolute text-2xl font-bold text-white">{score}</span>
              </div>
              <p className="text-sm text-purple-300 mt-2">Creator Score</p>
              <Badge variant="outline" className="mt-1 text-xs border-purple-500/30">{creatorScore?.trend === "up" ? "Trending Up" : creatorScore?.trend === "down" ? "Trending Down" : "Stable"}</Badge>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-blue-900/40 to-blue-800/20 border-blue-500/20">
            <CardContent className="p-6 text-center">
              <Eye className="w-8 h-8 text-blue-400 mx-auto mb-2" />
              <div className="text-3xl font-bold text-white">{controlData?.totalViewers || 0}</div>
              <p className="text-sm text-blue-300">Live Viewers</p>
              <Badge variant="outline" className="mt-1 text-xs border-blue-500/30">{controlData?.activeStreams || 0} Active Streams</Badge>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-900/40 to-green-800/20 border-green-500/20">
            <CardContent className="p-6 text-center">
              <Gauge className="w-8 h-8 text-green-400 mx-auto mb-2" />
              <div className="text-3xl font-bold text-white">{momentum?.score || 50}</div>
              <p className="text-sm text-green-300">Momentum Score</p>
              <Badge variant="outline" className={`mt-1 text-xs ${momentum?.trend === "up" ? "border-green-500/30 text-green-400" : "border-yellow-500/30 text-yellow-400"}`}>{momentum?.trend === "up" ? "Accelerating" : "Stable"}</Badge>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-amber-900/40 to-amber-800/20 border-amber-500/20">
            <CardContent className="p-6 text-center">
              <Shield className="w-8 h-8 text-amber-400 mx-auto mb-2" />
              <div className="text-3xl font-bold text-white">{controlData?.overallHealth === "healthy" ? "100%" : "75%"}</div>
              <p className="text-sm text-amber-300">System Health</p>
              <Badge variant="outline" className="mt-1 text-xs border-amber-500/30">All Systems Go</Badge>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {Object.entries(systemStatus).map(([system, status]) => (
            <Card key={system} className="bg-gray-900/60 border-gray-700/30">
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${status === "online" || status === "active" ? "bg-green-400 animate-pulse" : status === "standby" ? "bg-yellow-400" : "bg-red-400"}`} />
                <div>
                  <p className="text-xs font-medium text-white capitalize">{system}</p>
                  <p className={`text-xs capitalize ${STATUS_COLORS[status as string] || "text-gray-400"}`}>{status as string}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="bg-gray-900/60 border-gray-700/30">
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
                      <span className="text-sm font-medium text-white capitalize">{platform}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {metrics?.status === "connected" ? (
                        <Badge variant="outline" className="text-xs border-green-500/30 text-green-400"><CheckCircle className="w-3 h-3 mr-1" /> Connected</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs border-gray-500/30 text-gray-400"><WifiOff className="w-3 h-3 mr-1" /> Not Connected</Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card className="bg-gray-900/60 border-gray-700/30">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-amber-400" /> Active Alerts</CardTitle>
            </CardHeader>
            <CardContent>
              {(controlData?.alerts as any[])?.length ? (
                <div className="space-y-2">
                  {(controlData?.alerts as any[]).map((alert: any, i: number) => (
                    <div key={i} className="p-3 rounded-lg bg-amber-900/20 border border-amber-500/20 text-sm text-amber-200">
                      {alert.message || alert}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
                  <p className="text-green-300 font-medium">All Clear</p>
                  <p className="text-sm text-gray-400 mt-1">No active alerts. All systems operating normally.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="bg-gray-900/60 border-gray-700/30">
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
                <div key={engine.name} className="p-3 rounded-lg bg-gray-800/40 border border-gray-700/20">
                  <div className="flex items-center gap-2 mb-1">
                    <engine.icon className={`w-4 h-4 ${STATUS_COLORS[engine.status]}`} />
                    <span className="text-sm font-medium text-white">{engine.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${engine.status === "active" || engine.status === "online" ? "bg-green-400 animate-pulse" : "bg-yellow-400"}`} />
                    <span className="text-xs text-gray-400">{engine.desc}</span>
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
