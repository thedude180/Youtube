import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Shield, Siren, CheckCircle, RefreshCw, Radio, Activity, Zap, Terminal } from "lucide-react";
import { useState, useEffect } from "react";

function RadarScanner({ mode = "clear" }: { mode?: "clear" | "crisis" }) {
  const colorClass = mode === "crisis" ? "text-red-500" : "text-emerald-500";
  const strokeColor = mode === "crisis" ? "hsl(0 80% 50% / 0.3)" : "hsl(142 70% 50% / 0.3)";
  const sweepColor = mode === "crisis" ? "from-red-500/40" : "from-emerald-500/40";

  return (
    <div className="relative w-60 h-60 mx-auto mb-6" data-testid="radar-scanner">
      <svg viewBox="0 0 200 200" className="w-full h-full">
        {/* Concentric rings */}
        <circle cx="100" cy="100" r="33" fill="none" stroke={strokeColor} strokeWidth="1" />
        <circle cx="100" cy="100" r="66" fill="none" stroke={strokeColor} strokeWidth="1" />
        <circle cx="100" cy="100" r="99" fill="none" stroke={strokeColor} strokeWidth="1" />
        
        {/* Radial lines */}
        {[0, 45, 90, 135, 180, 225, 270, 315].map(angle => (
          <line
            key={angle}
            x1="100" y1="100"
            x2={100 + 100 * Math.cos(angle * Math.PI / 180)}
            y2={100 + 100 * Math.sin(angle * Math.PI / 180)}
            stroke={strokeColor}
            strokeWidth="0.5"
          />
        ))}

        {/* Rotating sweep */}
        <g className="radar-sweep" style={{ animation: 'radar-sweep 4s linear infinite', transformOrigin: '100px 100px' }}>
          <path
            d="M 100 100 L 100 0 A 100 100 0 0 1 170.7 29.3 Z"
            fill={`url(#radar-gradient-${mode})`}
            opacity="0.6"
          />
        </g>
        
        <defs>
          <linearGradient id={`radar-gradient-${mode}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={mode === "crisis" ? "hsl(0 80% 50%)" : "hsl(142 70% 50%)"} stopOpacity="0.4" />
            <stop offset="100%" stopColor={mode === "crisis" ? "hsl(0 80% 50%)" : "hsl(142 70% 50%)"} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Blips */}
        <circle cx="140" cy="60" r="3" className={`${colorClass} fill-current animate-pulse`} />
        <circle cx="60" cy="120" r="2" className={`${colorClass} fill-current animate-pulse`} style={{ animationDelay: '1s' }} />
        <circle cx="110" cy="160" r="2.5" className={`${colorClass} fill-current animate-pulse`} style={{ animationDelay: '2.5s' }} />
      </svg>
      
      <div className="absolute inset-0 flex items-center justify-center">
        <div className={`text-[10px] font-mono tracking-widest ${colorClass} animate-pulse`}>
          SCANNING
        </div>
      </div>
    </div>
  );
}

function LiveSignalFeed() {
  const [signals, setSignals] = useState<string[]>([
    "Scanning YouTube algorithm... OK",
    "Checking shadowban status... Clear",
    "Monitoring engagement rate... +12%",
    "Copyright scan... Clean",
    "Twitch API handshake... Verified",
    "X velocity analysis... Stable",
    "Discord webhook integrity... Good",
    "Creator DNA signature... Matched"
  ]);

  useEffect(() => {
    const interval = setInterval(() => {
      setSignals(prev => {
        const next = [...prev];
        const last = next.pop()!;
        return [last, ...next];
      });
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Card className="bg-black/40 border-emerald-500/20 card-premium">
      <CardHeader className="py-2 px-4 border-b border-emerald-500/10">
        <CardTitle className="text-[10px] font-mono uppercase tracking-tighter text-emerald-500 flex items-center gap-2">
          <Terminal className="w-3 h-3" /> Live Signal Feed
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 font-mono text-[10px]">
        <div className="space-y-1">
          {signals.slice(0, 6).map((signal, i) => (
            <div 
              key={`${signal}-${i}`} 
              className={`transition-opacity duration-1000 ${i === 0 ? "text-emerald-400" : "text-emerald-500/60"}`}
              style={{ opacity: 1 - (i * 0.15) }}
            >
              <span className="mr-2">&gt;</span>{signal}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ThreatLevelGauge({ level }: { level: number }) {
  const levels = [
    { label: "ALL CLEAR", color: "bg-emerald-500", glow: "glow-green", text: "text-emerald-400" },
    { label: "ELEVATED", color: "bg-yellow-500", glow: "glow-gold", text: "text-yellow-400" },
    { label: "HIGH ALERT", color: "bg-orange-500", glow: "glow-orange", text: "text-orange-400" },
    { label: "CRITICAL", color: "bg-red-500", glow: "glow-red", text: "text-red-400" },
    { label: "CRISIS", color: "bg-red-700", glow: "threat-pulse", text: "text-red-600" }
  ];

  const current = levels[level] || levels[0];

  return (
    <div className="space-y-4" data-testid="threat-level-gauge">
      <div className="flex justify-between items-end">
        <div>
          <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Current Threat Status</p>
          <h2 className={`text-4xl font-black italic tracking-tighter ${current.text}`}>{current.label}</h2>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-mono text-muted-foreground">DEFCON LEVEL</p>
          <p className="text-2xl font-bold font-mono">{5 - level}</p>
        </div>
      </div>
      
      <div className="flex gap-1.5 h-6">
        {levels.map((l, i) => (
          <div 
            key={i} 
            className={`flex-1 rounded-sm transition-all duration-500 ${i <= level ? `${l.color} ${i === level ? l.glow : ""}` : "bg-muted/20"}`}
          />
        ))}
      </div>
    </div>
  );
}

export default function WarRoom() {
  const { data: incidents = [], isLoading } = useQuery({ queryKey: ["/api/nexus/war-room"] });
  const { data: anomalies = [] } = useQuery({ queryKey: ["/api/nexus/anomalies"] });

  const scanThreats = useMutation({
    mutationFn: () => apiRequest("POST", "/api/nexus/war-room/scan"),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/nexus/war-room"] }); queryClient.invalidateQueries({ queryKey: ["/api/nexus/anomalies"] }); },
  });

  const activeIncidents = (incidents as any[]).filter((i: any) => i.status === "active");
  const hasActiveCrisis = activeIncidents.length > 0;
  const threatLevel = hasActiveCrisis ? Math.min(activeIncidents.length + 2, 4) : 0;

  if (isLoading) return <div className="min-h-screen bg-background flex items-center justify-center"><div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" /></div>;

  return (
    <div className={`min-h-screen p-6 transition-colors duration-1000 ${hasActiveCrisis ? "bg-red-950/20 animated-gradient-bg" : "bg-background"}`} data-testid="page-war-room">
      {hasActiveCrisis && (
        <div className="fixed inset-0 pointer-events-none z-50">
          <div className="absolute inset-0 border-[20px] border-red-500/10 threat-pulse" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,transparent_0%,rgba(127,0,0,0.2)_100%)]" />
        </div>
      )}

      <div className="max-w-[1600px] mx-auto space-y-8 relative z-10">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shadow-2xl transition-all duration-500 ${hasActiveCrisis ? "bg-red-600 empire-glow scale-110" : "bg-muted/50 border border-border"}`}>
              <Siren className={`w-8 h-8 ${hasActiveCrisis ? "text-white animate-pulse" : "text-muted-foreground"}`} />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-4xl font-black tracking-tighter uppercase italic" data-testid="text-page-title">War Room</h1>
                {hasActiveCrisis && (
                  <Badge variant="destructive" className="animate-pulse px-3 py-1 text-sm font-bold tracking-widest">CRISIS MODE ACTIVE</Badge>
                )}
              </div>
              <p className="text-muted-foreground font-mono text-sm tracking-tight" data-testid="text-page-subtitle">
                {hasActiveCrisis ? `ALERT: ${activeIncidents.length} CRITICAL THREATS DETECTED` : "SYSTEMS NOMINAL — CONTINUOUS NEURAL MONITORING ACTIVE"}
              </p>
            </div>
          </div>
          
          <Button 
            onClick={() => scanThreats.mutate()} 
            disabled={scanThreats.isPending} 
            variant={hasActiveCrisis ? "destructive" : "outline"}
            size="lg"
            className={`font-mono tracking-tighter ${hasActiveCrisis ? "empire-glow" : ""}`}
            data-testid="button-scan-threats"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${scanThreats.isPending ? "animate-spin" : ""}`} /> 
            {scanThreats.isPending ? "SCANNING SECTORS..." : "INITIATE THREAT SCAN"}
          </Button>
        </div>

        {/* 3-Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Column: Visualization */}
          <div className="lg:col-span-3 space-y-6">
            <Card className="card-premium overflow-hidden bg-black/40 border-border/50">
              <CardHeader className="pb-0 text-center">
                <CardTitle className="text-xs font-mono text-muted-foreground uppercase tracking-[0.2em]">Neural Radar Scanner</CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <RadarScanner mode={hasActiveCrisis ? "crisis" : "clear"} />
                <div className="grid grid-cols-2 gap-2 mt-4">
                  <div className="p-2 rounded bg-muted/30 text-center">
                    <p className="text-[10px] font-mono text-muted-foreground">SIGNALS</p>
                    <p className="text-lg font-bold font-mono">12.4k</p>
                  </div>
                  <div className="p-2 rounded bg-muted/30 text-center">
                    <p className="text-[10px] font-mono text-muted-foreground">LATENCY</p>
                    <p className="text-lg font-bold font-mono text-emerald-400">14ms</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <LiveSignalFeed />
          </div>

          {/* Center Column: Main Control */}
          <div className="lg:col-span-6 space-y-8">
            <Card className={`card-premium p-8 border-none relative overflow-hidden ${hasActiveCrisis ? "card-empire" : "bg-card/50"}`}>
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <Shield className="w-32 h-32" />
              </div>
              <ThreatLevelGauge level={threatLevel} />
            </Card>

            <div className="space-y-4">
              <h2 className={`text-xl font-bold flex items-center gap-2 ${hasActiveCrisis ? "text-red-400" : "text-muted-foreground"}`}>
                <AlertTriangle className={hasActiveCrisis ? "animate-pulse" : ""} /> 
                {hasActiveCrisis ? "Active Containment Procedures" : "Current Watchlist"}
              </h2>
              
              {activeIncidents.length > 0 ? (
                activeIncidents.map((incident: any) => (
                  <Card key={incident.id} className={`card-premium border-l-4 ${incident.severity === "critical" ? "border-l-red-600 bg-red-950/20" : "border-l-orange-500 bg-orange-950/20"}`} data-testid={`card-incident-${incident.id}`}>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <CardTitle className="text-xl font-bold tracking-tight">{incident.title}</CardTitle>
                      <Badge variant={incident.severity === "critical" ? "destructive" : "outline"} className="font-mono">
                        {incident.severity?.toUpperCase()}
                      </Badge>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <p className="text-muted-foreground leading-relaxed">{incident.description}</p>
                      
                      {incident.affectedPlatforms?.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {incident.affectedPlatforms.map((p: string, i: number) => (
                            <Badge key={i} variant="secondary" className="bg-muted/50 hover:bg-muted font-mono text-[10px] uppercase">{p}</Badge>
                          ))}
                        </div>
                      )}

                      <div className="grid md:grid-cols-2 gap-4">
                        {incident.recoveryPlan?.length > 0 && (
                          <div className="bg-black/20 p-4 rounded-xl border border-white/5">
                            <p className="text-xs font-mono text-muted-foreground uppercase mb-3">Recovery Protocol</p>
                            <div className="space-y-2">
                              {incident.recoveryPlan.map((step: any, i: number) => (
                                <div key={i} className="flex items-start gap-3 group">
                                  {step.status === "completed" ? 
                                    <CheckCircle className="w-4 h-4 text-emerald-400 mt-0.5" /> : 
                                    <div className="w-4 h-4 rounded-full border border-yellow-500/50 flex items-center justify-center mt-0.5">
                                      <div className="w-1.5 h-1.5 bg-yellow-500 rounded-full animate-pulse" />
                                    </div>
                                  }
                                  <span className={`text-sm ${step.status === "completed" ? "text-muted-foreground line-through" : "text-foreground font-medium"}`}>{step.step}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {incident.automatedActions?.length > 0 && (
                          <div className="bg-emerald-950/10 p-4 rounded-xl border border-emerald-500/10">
                            <p className="text-xs font-mono text-emerald-400 uppercase mb-3">Neural Countermeasures</p>
                            <div className="space-y-2">
                              {incident.automatedActions.map((action: string, i: number) => (
                                <div key={i} className="flex items-center gap-2">
                                  <Zap className="w-3 h-3 text-emerald-400" />
                                  <p className="text-xs text-emerald-300/80 font-mono">{action}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <Card className="bg-muted/20 border-dashed border-2 border-border/50">
                  <CardContent className="py-12 text-center">
                    <Shield className="w-12 h-12 text-emerald-500/30 mx-auto mb-4" />
                    <p className="text-muted-foreground font-mono">NO ACTIVE THREATS IN PERIMETER</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>

          {/* Right Column: Intel & History */}
          <div className="lg:col-span-3 space-y-6">
            <div className="grid grid-cols-1 gap-4">
              <Card className="card-premium bg-blue-950/10 border-blue-500/20">
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-mono text-blue-400 uppercase">Anomalies</p>
                    <p className="text-2xl font-bold font-mono tracking-tighter">{(anomalies as any[]).length}</p>
                  </div>
                  <Activity className="w-8 h-8 text-blue-500/40" />
                </CardContent>
              </Card>
              <Card className="card-premium bg-emerald-950/10 border-emerald-500/20">
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-mono text-emerald-400 uppercase">Resolved</p>
                    <p className="text-2xl font-bold font-mono tracking-tighter">{(incidents as any[]).filter((i: any) => i.status === "resolved").length}</p>
                  </div>
                  <CheckCircle className="w-8 h-8 text-emerald-500/40" />
                </CardContent>
              </Card>
            </div>

            <div className="space-y-4">
              <h2 className="text-sm font-mono text-muted-foreground uppercase tracking-widest px-1">Mission Log</h2>
              <div className="space-y-3">
                {(incidents as any[]).filter((i: any) => i.status === "resolved").slice(0, 5).map((incident: any) => (
                  <Card key={incident.id} className="bg-muted/10 border-border/30 hover:bg-muted/20 transition-colors group">
                    <CardContent className="p-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded bg-emerald-500/10 flex items-center justify-center">
                          <CheckCircle className="w-4 h-4 text-emerald-500" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-foreground line-clamp-1">{incident.title}</p>
                          <p className="text-[10px] font-mono text-muted-foreground">{incident.incidentType}</p>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-[9px] border-emerald-500/30 text-emerald-400 group-hover:bg-emerald-500/10 transition-colors">FIXED</Badge>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

