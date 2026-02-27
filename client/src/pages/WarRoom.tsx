import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Shield, Siren, CheckCircle, RefreshCw, Radio, Activity, Zap, Terminal } from "lucide-react";
import { useState, useEffect, useRef } from "react";

const RadarScanner = ({ crisis }: { crisis: boolean }) => {
  const color = crisis ? "hsl(0 80% 55%)" : "hsl(142 70% 50%)";
  return (
    <div className="relative w-48 h-48 mx-auto" data-testid="widget-radar-scanner">
      <svg width="192" height="192" viewBox="0 0 192 192">
        <circle cx="96" cy="96" r="88" fill="none" stroke={color} strokeOpacity="0.15" strokeWidth="1" />
        <circle cx="96" cy="96" r="59" fill="none" stroke={color} strokeOpacity="0.15" strokeWidth="1" />
        <circle cx="96" cy="96" r="30" fill="none" stroke={color} strokeOpacity="0.15" strokeWidth="1" />
        {[0,45,90,135,180,225,270,315].map((angle) => (
          <line key={angle} x1="96" y1="96"
            x2={96 + 88 * Math.cos((angle - 90) * Math.PI / 180)}
            y2={96 + 88 * Math.sin((angle - 90) * Math.PI / 180)}
            stroke={color} strokeOpacity="0.1" strokeWidth="1" />
        ))}
        <defs>
          <radialGradient id="sweepGrad" cx="50%" cy="100%" r="100%" fx="50%" fy="100%">
            <stop offset="0%" stopColor={color} stopOpacity="0.6" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </radialGradient>
        </defs>
        <g style={{ animation: 'radar-sweep 3s linear infinite', transformOrigin: '96px 96px' }}>
          <path d="M96,96 L96,8 A88,88 0 0,1 96,96 Z" fill="url(#sweepGrad)" opacity="0.4" />
        </g>
        {[[60,45],[130,80],[80,130],[110,55],[75,100]].map(([x,y], i) => (
          <circle key={i} cx={x} cy={y} r="3" fill={color} style={{ animation: `pulse ${1+i*0.3}s ease-in-out infinite` }} />
        ))}
        <text x="96" y="100" textAnchor="middle" fill={color} fontSize="8" fontFamily="monospace" opacity="0.8">SCANNING</text>
      </svg>
    </div>
  );
};

const ThreatLevelGauge = ({ level }: { level: number }) => {
  const levels = [
    { label: "ALL CLEAR", color: "hsl(142 70% 50%)" },
    { label: "ELEVATED", color: "hsl(90 70% 50%)" },
    { label: "HIGH ALERT", color: "hsl(45 90% 55%)" },
    { label: "CRITICAL", color: "hsl(20 90% 55%)" },
    { label: "CRISIS", color: "hsl(0 80% 55%)" },
  ];
  const current = levels[Math.min(level, 4)];
  return (
    <div data-testid="widget-threat-gauge">
      <div className="text-center mb-3">
        <span className="text-lg font-bold font-mono" style={{ color: current.color, textShadow: `0 0 15px ${current.color}` }}>{current.label}</span>
      </div>
      <div className="flex gap-1">
        {levels.map((l, i) => (
          <div key={i} className="flex-1 h-4 rounded-sm transition-all duration-500"
            style={{ background: i <= level ? l.color : 'hsl(265 20% 20%)', boxShadow: i === level ? `0 0 12px ${l.color}` : 'none', opacity: i <= level ? 1 : 0.3 }}
            data-testid={`threat-segment-${i}`} />
        ))}
      </div>
      <div className="flex justify-between mt-1">
        {levels.map((l) => <span key={l.label} className="text-[8px] text-muted-foreground font-mono">{l.label.split(' ')[0]}</span>)}
      </div>
    </div>
  );
};

const SIGNALS = [
  "Scanning YouTube algorithm... OK",
  "Checking shadowban status... Clear",
  "Monitoring engagement rate... +12%",
  "Copyright scan... Clean",
  "AI content review... Passed",
  "Platform TOS check... Compliant",
  "Revenue stream health... Nominal",
  "Audience retention scan... 68%",
  "SEO ranking monitor... Stable",
  "Competitor activity... Detected",
];

const LiveSignalFeed = () => {
  const [signals, setSignals] = useState<string[]>(SIGNALS.slice(0, 5));
  const idxRef = useRef(5);
  useEffect(() => {
    const t = setInterval(() => {
      setSignals(prev => [SIGNALS[idxRef.current % SIGNALS.length], ...prev.slice(0, 4)]);
      idxRef.current += 1;
    }, 3000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="terminal bg-black/60 border border-emerald-500/20 rounded-lg p-3 space-y-1" data-testid="widget-signal-feed">
      <div className="text-[10px] text-emerald-400/60 font-mono uppercase mb-2">Live Signal Feed</div>
      {signals.map((s, i) => (
        <div key={i} className="text-[11px] font-mono flex gap-2 transition-all duration-500"
          style={{ opacity: 1 - i * 0.18, color: (s.includes('OK') || s.includes('Clear') || s.includes('Clean') || s.includes('Passed') || s.includes('Compliant') || s.includes('Nominal') || s.includes('Stable')) ? 'hsl(142 70% 50%)' : 'hsl(45 90% 55%)' }}>
          <span className="text-emerald-600/60">{'>'}</span>
          {s}
        </div>
      ))}
    </div>
  );
};

export default function WarRoom() {
  const { data: incidents = [], isLoading } = useQuery({ queryKey: ["/api/nexus/war-room"] });
  const { data: anomalies = [] } = useQuery({ queryKey: ["/api/nexus/anomalies"] });

  const scanThreats = useMutation({
    mutationFn: () => apiRequest("POST", "/api/nexus/war-room/scan"),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/nexus/war-room"] }); queryClient.invalidateQueries({ queryKey: ["/api/nexus/anomalies"] }); },
  });

  const activeIncidents = (incidents as any[]).filter((i: any) => i.status === "active");
  const hasActiveCrisis = activeIncidents.length > 0;
  const threatLevel = hasActiveCrisis ? 3 : ((incidents as any[]).length > 2 ? 2 : (incidents as any[]).length > 0 ? 1 : 0);

  if (isLoading) return <div className="min-h-screen bg-background flex items-center justify-center"><div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" /></div>;

  return (
    <div className={`min-h-screen p-6 transition-colors duration-1000 ${hasActiveCrisis ? "bg-red-950/20 animated-gradient-bg" : "bg-background"}`} data-testid="page-war-room">
      <div className="max-w-[1600px] mx-auto space-y-4 relative z-10">
        {hasActiveCrisis && (
          <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-3 mb-4 threat-pulse flex items-center gap-2" data-testid="banner-crisis-mode">
            <span className="text-red-400 font-bold font-mono animate-pulse text-sm">⚠ CRISIS MODE ACTIVE</span>
            <span className="text-red-300 text-xs">All systems on high alert</span>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-4 mb-4">
          <div className="card-empire rounded-2xl p-4">
            <div className="text-xs font-mono text-muted-foreground uppercase mb-3">Threat Detection</div>
            <RadarScanner crisis={hasActiveCrisis} />
            <div className="mt-4"><LiveSignalFeed /></div>
          </div>
          <div className="card-empire rounded-2xl p-4">
            <div className="text-xs font-mono text-muted-foreground uppercase mb-3">Threat Level</div>
            <ThreatLevelGauge level={threatLevel} />
          </div>
        </div>

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
          
          {/* Left Column: Intel */}
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

          {/* Center Column: Main Control */}
          <div className="lg:col-span-9 space-y-4">
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
        </div>
      </div>
    </div>
  );
}


