import { useState, useRef, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { usePageTitle } from "@/hooks/use-page-title";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  RefreshCw, Dna, BarChart3, FlaskConical, Handshake, Users, Shield, CreditCard,
  CheckCircle2, AlertTriangle, Clock, TrendingUp, Zap, ArrowRight, Brain,
  Play, Pause, Settings2, Star, Target, Eye, ThumbsUp, Video, Crown, Rocket,
  ChevronRight, Activity, Lock, Sparkles, Mail, UserPlus, Trash2, Loader2,
  Share2, ShieldCheck, Heart, MessageSquare, Flame, Globe, ZapOff,
  Crosshair, Radio, HardDrive, Cpu, Terminal, Search
} from "lucide-react";

const CompetitorBattleBars = ({ yourScore = 72, compScore = 65 }: { yourScore?: number, compScore?: number }) => {
  const metrics = [
    { label: "Views/Video", yours: yourScore + 8, theirs: compScore + 5 },
    { label: "Subscribers", yours: yourScore - 5, theirs: compScore + 10 },
    { label: "Engagement", yours: yourScore + 12, theirs: compScore - 3 },
    { label: "Revenue/Mo", yours: yourScore + 3, theirs: compScore + 8 },
    { label: "Growth Rate", yours: yourScore + 15, theirs: compScore - 8 },
  ].map(m => ({ ...m, yours: Math.min(99, Math.max(1, m.yours)), theirs: Math.min(99, Math.max(1, m.theirs)) }));
  const winning = metrics.filter(m => m.yours > m.theirs).length;
  return (
    <div className="card-empire rounded-2xl p-5 mb-4 relative overflow-hidden" data-testid="widget-battle-bars">
      <div className="data-grid-bg absolute inset-0 opacity-5 pointer-events-none" />
      <div className="flex items-center justify-between mb-4 relative">
        <h3 className="text-sm font-bold font-mono text-primary uppercase">Competitor Battle</h3>
        <span className={`text-xs px-2 py-0.5 rounded-full font-mono ${winning >= 3 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-yellow-500/20 text-yellow-400'}`} data-testid="badge-battle-result">
          You're winning {winning}/{metrics.length} metrics
        </span>
      </div>
      <div className="space-y-3 relative">
        {metrics.map(({ label, yours, theirs }) => (
          <div key={label} data-testid={`battle-bar-${label.toLowerCase().replace(/[/]/g,'-')}`}>
            <div className="flex justify-between text-[10px] font-mono mb-1">
              <span className="text-primary">{yours}%</span>
              <span className="text-muted-foreground">{label}</span>
              <span className="text-red-400/70">{theirs}%</span>
            </div>
            <div className="flex gap-0.5 h-2">
              <div className="flex-1 bg-muted/20 rounded-l-full overflow-hidden flex justify-end">
                <div className="h-full bg-primary/70 rounded-l-full transition-all duration-1000"
                  style={{ width: `${yours}%`, boxShadow: '0 0 6px hsl(265 80% 60% / 0.5)' }} />
              </div>
              <div className="w-0.5 bg-border/50" />
              <div className="flex-1 bg-muted/20 rounded-r-full overflow-hidden">
                <div className="h-full bg-red-500/50 rounded-r-full transition-all duration-1000"
                  style={{ width: `${theirs}%` }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const MarketShareRadar = () => {
  const axes = ["Reach", "Engagement", "Quality", "SEO", "Revenue", "Brand"];
  const yours = [80, 72, 85, 68, 75, 88];
  const theirs = [65, 78, 60, 82, 70, 55];
  const cx = 120, cy = 120, r = 90;
  const toPoint = (value: number, i: number) => {
    const angle = (i / axes.length) * Math.PI * 2 - Math.PI / 2;
    const d = (value / 100) * r;
    return { x: cx + d * Math.cos(angle), y: cy + d * Math.sin(angle) };
  };
  const toPath = (values: number[]) => values.map((v, i) => {
    const { x, y } = toPoint(v, i);
    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ') + ' Z';
  return (
    <div className="card-empire rounded-2xl p-5 mb-4" data-testid="widget-market-radar">
      <h3 className="text-sm font-bold font-mono text-primary uppercase mb-3">Market Share Radar</h3>
      <div className="flex justify-center">
        <svg width="240" height="240" viewBox="0 0 240 240">
          {[20, 40, 60, 80, 100].map(pct => (
            <polygon key={pct} fill="none" stroke="hsl(265 80% 60% / 0.1)" strokeWidth="1"
              points={axes.map((_, i) => { const p = toPoint(pct, i); return `${p.x},${p.y}`; }).join(' ')} />
          ))}
          {axes.map((_, i) => { const p = toPoint(100, i); return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="hsl(265 80% 60% / 0.1)" strokeWidth="1" />; })}
          <path d={toPath(yours)} fill="hsl(265 80% 60% / 0.2)" stroke="hsl(265 80% 65%)" strokeWidth="2" />
          <path d={toPath(theirs)} fill="hsl(0 80% 55% / 0.15)" stroke="hsl(0 80% 60%)" strokeWidth="1.5" strokeDasharray="4 2" />
          {axes.map((label, i) => { const { x, y } = toPoint(115, i); return <text key={i} x={x} y={y} textAnchor="middle" fill="hsl(265 60% 70%)" fontSize="9" fontFamily="monospace">{label}</text>; })}
        </svg>
      </div>
      <div className="flex justify-center gap-4 mt-2">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <div className="w-3 h-0.5 bg-primary rounded" />You
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <div className="w-3 h-0.5 rounded" style={{ background: 'hsl(0 80% 60%)' }} />Competitor
        </div>
      </div>
    </div>
  );
};

function CompetitiveStatsStrip() {
  const { data: insights } = useQuery<any>({ queryKey: ["/api/competitive-edge/insights"] });
  const stats = useMemo(() => {
    return [
      { icon: Target, label: "Market Share", value: "12.4%", color: "text-primary" },
      { icon: TrendingUp, label: "Growth Velocity", value: "+22%", color: "text-emerald-400" },
      { icon: Users, label: "Audience Overlap", value: "45%", color: "text-blue-400" },
      { icon: Zap, label: "Viral Potential", value: "High", color: "text-purple-400" },
      { icon: ShieldCheck, label: "Brand Strength", value: "88/100", color: "text-amber-400" },
    ];
  }, []);

  return (
    <div className="card-empire rounded-xl px-4 py-3 flex flex-wrap gap-4 items-center relative overflow-hidden mb-4" data-testid="competitive-stats-strip">
      <div className="data-grid-bg absolute inset-0 opacity-5 pointer-events-none" />
      <div className="flex items-center gap-2 shrink-0 relative">
        <Crosshair className="h-4 w-4 text-primary" />
        <span className="holographic-text text-xs font-bold uppercase tracking-wider">War Room Intel</span>
      </div>
      <div className="w-px h-6 bg-border/30 hidden sm:block" />
      <div className="flex flex-wrap gap-4 relative">
        {stats.map(({ icon: Icon, label, value, color }) => (
          <div key={label} className="flex items-center gap-2" data-testid={`stat-intel-${label.toLowerCase().replace(/\s+/g, '-')}`}>
            <Icon className={`h-3.5 w-3.5 ${color}`} />
            <div>
              <div className={`text-sm font-bold metric-display ${color}`}>{value}</div>
              <div className="text-[10px] text-muted-foreground leading-none">{label}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="ml-auto shrink-0 relative flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
        <span className="text-[10px] text-emerald-400 font-mono">SCANNING COMPETITORS</span>
      </div>
    </div>
  );
}

const MatrixGrid = () => {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-[0.03]" data-testid="widget-matrix-grid">
      <div className="absolute inset-0 flex flex-wrap gap-4 p-4 font-mono text-[10px] leading-none select-none">
        {Array.from({ length: 20 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-4 animate-data-stream" style={{ animationDelay: `${i * 0.2}s`, animationDuration: `${3 + (i % 3)}s` }}>
            {Array.from({ length: 15 }).map((_, j) => (
              <span key={j}>{Math.random() > 0.5 ? '1' : '0'}</span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

const CompetitiveRadar = () => {
  return (
    <div className="relative w-full aspect-square max-w-[300px] mx-auto mb-8" data-testid="widget-competitive-radar">
      <div className="absolute inset-0 rounded-full border border-primary/20 radar-sweep" />
      <div className="absolute inset-0 rounded-full border border-primary/10 scale-75" />
      <div className="absolute inset-0 rounded-full border border-primary/10 scale-50" />
      <div className="absolute inset-0 rounded-full border border-primary/10 scale-25" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-full bg-primary/10" />
      <div className="absolute top-1/2 left-0 -translate-y-1/2 w-full h-px bg-primary/10" />
      {[
        { x: '20%', y: '30%', label: 'Top Tier', color: 'bg-emerald-500' },
        { x: '70%', y: '20%', label: 'Viral', color: 'bg-primary' },
        { x: '40%', y: '60%', label: 'You', color: 'bg-white', pulse: true },
        { x: '80%', y: '70%', label: 'Rising', color: 'bg-blue-400' },
        { x: '15%', y: '75%', label: 'Legacy', color: 'bg-red-400' }
      ].map((p, i) => (
        <div key={i} className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1" style={{ left: p.x, top: p.y }}>
          <div className={`w-2 h-2 rounded-full ${p.color} ${p.pulse ? 'animate-pulse glow-purple' : ''}`} />
          <span className="text-[8px] font-mono text-muted-foreground uppercase whitespace-nowrap">{p.label}</span>
        </div>
      ))}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] font-mono text-primary/60">SCANNING SECTOR 7G</div>
    </div>
  );
};

const SignalStream = () => {
  const [signals, setSignals] = useState<string[]>([]);
  const phrases = ["SEO Boost detected", "Competitor uploaded", "Trend spike: AI", "CTR optimizing", "Retention peak", "Keyword match"];
  
  useEffect(() => {
    const interval = setInterval(() => {
      setSignals(prev => [phrases[Math.floor(Math.random() * phrases.length)], ...prev.slice(0, 4)]);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="terminal bg-black/40 border border-primary/20 rounded-lg p-3 h-32 overflow-hidden" data-testid="widget-signal-stream">
      {signals.map((s, i) => (
        <div key={i} className="text-[10px] font-mono text-primary/80 animate-in fade-in slide-in-from-left-2">
          <span className="text-primary/40 mr-2">[{new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}]</span>
          SIG_IN: {s}... <span className="text-emerald-400">OK</span>
        </div>
      ))}
    </div>
  );
};

const DNAHelix = () => {
  return (
    <div className="relative w-full h-48 flex items-center justify-center overflow-hidden" data-testid="widget-dna-helix">
      <div className="relative flex gap-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-12 relative">
            <div className="w-3 h-3 rounded-full bg-primary/60 glow-purple animate-orbit" style={{ animationDelay: `${i * 0.2}s`, '--orbit-radius': '30px' } as any} />
            <div className="w-0.5 h-12 bg-gradient-to-b from-primary/40 to-blue-400/40 absolute left-1.5 top-3" />
            <div className="w-3 h-3 rounded-full bg-blue-400/60 glow-blue animate-orbit" style={{ animationDelay: `${(i * 0.2) + 1}s`, '--orbit-radius': '30px' } as any} />
          </div>
        ))}
      </div>
    </div>
  );
};

const PulseGrid = () => {
  const platforms = [
    { name: "YouTube", icon: Video, color: "text-red-500", glow: "glow-red" },
    { name: "Twitch", icon: Heart, color: "text-purple-500", glow: "glow-purple" },
    { name: "TikTok", icon: Music2, color: "text-pink-500", glow: "glow-pink" },
    { name: "Twitter", icon: Share2, color: "text-blue-400", glow: "glow-blue" },
    { name: "Discord", icon: MessageSquare, color: "text-indigo-400", glow: "glow-purple" },
    { name: "Instagram", icon: Heart, color: "text-rose-500", glow: "glow-red" },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3" data-testid="widget-pulse-grid">
      {platforms.map((p) => {
        const Icon = p.icon;
        return (
          <div key={p.name} className="card-empire p-3 flex items-center gap-3 relative overflow-hidden group hover:scale-[1.02] transition-transform">
            <div className={`p-2 rounded-lg bg-muted/30 ${p.color} ${p.glow} group-hover:animate-pulse`}>
              <Icon className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-mono text-muted-foreground uppercase">{p.name}</div>
              <div className="text-xs font-bold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                OPTIMIZED
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

const Music2 = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </svg>
);

function StatCard({ label, value, icon: Icon, trend, testId }: { label: string; value: string | number; icon: any; trend?: string; testId: string }) {
  return (
    <Card data-testid={testId} className="card-empire transition-all duration-300 hover:scale-[1.02]">
      <div className="data-grid-bg absolute inset-0 opacity-5 pointer-events-none" />
      <CardContent className="p-4 relative">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-mono">{label}</p>
            <p className="text-2xl font-bold mt-1 metric-display holographic-text">{value}</p>
            {trend && (
              <div className="flex items-center gap-1 mt-1">
                <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
                <p className="text-[10px] font-mono text-emerald-400">{trend}</p>
              </div>
            )}
          </div>
          <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
            <Icon className="h-5 w-5 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function VodLoopTab() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/vod-loop/status"] });
  const { data: history } = useQuery<any>({ queryKey: ["/api/vod-loop/history"] });

  if (isLoading) return <div className="space-y-4">{[1,2,3].map(i => <Skeleton key={i} className="h-24" />)}</div>;

  const s = data || {};
  return (
    <div className="space-y-4" data-testid="tab-vod-loop">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total Optimized" value={s.totalOptimized || 0} icon={RefreshCw} testId="stat-vod-total" />
        <StatCard label="Pending Updates" value={s.pendingUpdates || 0} icon={Clock} testId="stat-vod-pending" />
        <StatCard label="This Week" value={s.thisWeek || 0} icon={TrendingUp} testId="stat-vod-week" />
        <StatCard label="Loop Status" value={s.enabled ? "Active" : "Ready"} icon={s.enabled ? Play : Pause} testId="stat-vod-status" />
      </div>

      <Card data-testid="card-vod-humanization">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" />
            Humanization Engine
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
              <p className="text-xs text-muted-foreground mb-1">Update Frequency</p>
              <p className="font-medium capitalize" data-testid="text-vod-frequency">{s.humanizationSettings?.updateFrequency || "moderate"}</p>
              <p className="text-xs text-muted-foreground mt-1">Updates spread across natural hours</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
              <p className="text-xs text-muted-foreground mb-1">Timing Jitter</p>
              <p className="font-medium" data-testid="text-vod-jitter">{s.humanizationSettings?.humanizeTimingJitter !== false ? "Enabled" : "Off"}</p>
              <p className="text-xs text-muted-foreground mt-1">Random delays mimic human behavior</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
              <p className="text-xs text-muted-foreground mb-1">Language Variation</p>
              <p className="font-medium" data-testid="text-vod-variation">{s.humanizationSettings?.naturalLanguageVariation !== false ? "Active" : "Off"}</p>
              <p className="text-xs text-muted-foreground mt-1">Each update uses unique wording</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="card-vod-history">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Recent VOD Updates
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(history?.updates || []).length === 0 ? (
            <div className="flex flex-col items-center py-6 text-center">
              <Video className="h-8 w-8 text-muted-foreground/20 mb-2" />
              <p className="text-sm text-muted-foreground">No VOD updates yet</p>
              <p className="text-xs text-muted-foreground/60">The system will automatically optimize your older videos</p>
            </div>
          ) : (
            <div className="space-y-2">
              {(history?.updates || []).slice(0, 8).map((u: any, i: number) => (
                <div key={i} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/30 transition-colors" data-testid={`vod-update-${i}`}>
                  <div className={`w-2 h-2 rounded-full shrink-0 ${u.status === "completed" ? "bg-emerald-500" : u.status === "pending" ? "bg-amber-500" : "bg-blue-500"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{u.caption || "VOD Optimization"}</p>
                    <p className="text-xs text-muted-foreground">{u.createdAt ? new Date(u.createdAt).toLocaleDateString() : ""}</p>
                  </div>
                  <Badge variant="secondary" className="text-xs shrink-0 capitalize">{u.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AutopilotLoopTab() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/autopilot-loop/status"] });
  const { data: metrics } = useQuery<any>({ queryKey: ["/api/autopilot-loop/metrics"] });

  if (isLoading) return <div className="space-y-4">{[1,2,3].map(i => <Skeleton key={i} className="h-24" />)}</div>;

  const s = data || {};
  const m = metrics || {};
  const phases = s.phases || [];

  return (
    <div className="space-y-4" data-testid="tab-autopilot-loop">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Active Loops" value={s.activeLoops || 0} icon={Zap} testId="stat-loop-active" />
        <StatCard label="Completed Cycles" value={s.completedCycles || 0} icon={CheckCircle2} testId="stat-loop-completed" />
        <StatCard label="Success Rate" value={`${m.successRate || 0}%`} icon={Target} testId="stat-loop-success" />
        <StatCard label="Total Processed" value={m.totalProcessed || 0} icon={Activity} testId="stat-loop-processed" />
      </div>

      <Card data-testid="card-loop-phases">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Rocket className="h-4 w-4 text-primary" />
            Autopilot Pipeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-1 overflow-x-auto pb-2">
            {phases.map((p: any, i: number) => (
              <div key={p.name} className="flex items-center shrink-0">
                <div className={`px-3 py-2 rounded-lg text-xs font-medium border ${
                  p.status === "active" ? "bg-primary/10 border-primary/30 text-primary" :
                  p.status === "completed" ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" :
                  "bg-muted/30 border-border/50 text-muted-foreground"
                }`} data-testid={`phase-${p.name}`}>
                  {p.name.replace(/-/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase())}
                </div>
                {i < phases.length - 1 && <ChevronRight className="h-4 w-4 text-muted-foreground/30 mx-0.5 shrink-0" />}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card data-testid="card-loop-platforms">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Content by Platform</CardTitle>
          </CardHeader>
          <CardContent>
            {Object.entries(m.contentByPlatform || {}).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No content processed yet</p>
            ) : (
              <div className="space-y-2">
                {Object.entries(m.contentByPlatform || {}).map(([platform, count]) => (
                  <div key={platform} className="flex items-center justify-between">
                    <span className="text-sm capitalize">{platform}</span>
                    <Badge variant="secondary">{count as number}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-loop-actions">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Recent Actions</CardTitle>
          </CardHeader>
          <CardContent>
            {(s.recentActions || []).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Pipeline ready to process content</p>
            ) : (
              <div className="space-y-2">
                {(s.recentActions || []).slice(0, 5).map((a: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <div className={`w-1.5 h-1.5 rounded-full ${a.status === "completed" ? "bg-emerald-500" : "bg-amber-500"}`} />
                    <span className="truncate">{a.caption || a.type}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CreatorDnaTab() {
  const { toast } = useToast();
  const { data: profile, isLoading } = useQuery<any>({ queryKey: ["/api/creator-dna/profile"] });
  const [voicePrompt, setVoicePrompt] = useState("");
  const [generatedText, setGeneratedText] = useState<any>(null);

  const buildMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/creator-dna/build"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/creator-dna/profile"] });
      toast({ title: "DNA Profile built", description: "Your unique creator fingerprint has been analyzed" });
    },
  });

  const generateMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/creator-dna/generate", { prompt: voicePrompt }),
    onSuccess: async (res) => { setGeneratedText(await res.json()); },
  });

  if (isLoading) return <div className="space-y-4">{[1,2,3].map(i => <Skeleton key={i} className="h-32" />)}</div>;

  const p = profile || {};
  const hasProfile = !!p.styleVector;
  const sv = p.styleVector || {};

  return (
    <div className="space-y-4" data-testid="tab-creator-dna">
      {!hasProfile ? (
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-center">
            <Dna className="h-12 w-12 text-primary/30 mb-3" />
            <h3 className="text-lg font-semibold mb-1">Build Your Creator DNA</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-md">
              AI will analyze your content to learn your unique style, voice, humor, and energy patterns.
              The more content you have, the more accurate your DNA profile.
            </p>
            <Button onClick={() => buildMutation.mutate()} disabled={buildMutation.isPending} data-testid="button-build-dna">
              {buildMutation.isPending ? <><RefreshCw className="h-4 w-4 animate-spin mr-2" /> Analyzing...</> : <><Dna className="h-4 w-4 mr-2" /> Build DNA Profile</>}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Maturity Score" value={`${Math.round((p.maturityScore || 0) * 100)}%`} icon={Brain} testId="stat-dna-maturity" />
            <StatCard label="Samples Analyzed" value={p.sampleCount || 0} icon={Eye} testId="stat-dna-samples" />
            <StatCard label="Catchphrases" value={(p.catchphrases || []).length} icon={Sparkles} testId="stat-dna-catchphrases" />
            <StatCard label="Content Themes" value={(p.contentThemes || []).length} icon={Target} testId="stat-dna-themes" />
          </div>

          <Card data-testid="card-dna-style">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Dna className="h-4 w-4 text-primary" />
                Style Vector
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {Object.entries(sv).map(([key, val]) => (
                  <div key={key} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs capitalize text-muted-foreground">{key.replace(/([A-Z])/g, " $1").trim()}</span>
                      <span className="text-xs font-medium">{Math.round((val as number) * 100)}%</span>
                    </div>
                    <Progress value={(val as number) * 100} className="h-1.5" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card data-testid="card-dna-voice">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Voice Patterns</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {p.voicePatterns && Object.entries(p.voicePatterns).map(([k, v]) => (
                  <div key={k}>
                    <span className="text-xs text-muted-foreground capitalize">{k.replace(/([A-Z])/g, " $1")}: </span>
                    <span>{Array.isArray(v) ? (v as string[]).join(", ") : String(v)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card data-testid="card-dna-catchphrases">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Catchphrases & Banned Words</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {(p.catchphrases || []).map((c: string, i: number) => (
                    <Badge key={i} variant="secondary" className="text-xs">{c}</Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mb-1">Banned phrases:</p>
                <div className="flex flex-wrap gap-1.5">
                  {(p.bannedPhrases || []).map((b: string, i: number) => (
                    <Badge key={i} variant="destructive" className="text-xs opacity-60">{b}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card data-testid="card-dna-generate">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                Generate in Your Voice
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 mb-3">
                <Textarea
                  value={voicePrompt}
                  onChange={(e) => setVoicePrompt(e.target.value)}
                  placeholder="e.g. Write a YouTube video title about a crazy Fortnite win"
                  className="min-h-[60px]"
                  data-testid="input-voice-prompt"
                />
              </div>
              <Button onClick={() => generateMutation.mutate()} disabled={!voicePrompt.trim() || generateMutation.isPending} size="sm" data-testid="button-generate-voice">
                {generateMutation.isPending ? "Generating..." : "Generate"}
              </Button>
              {generatedText && (
                <div className="mt-3 p-3 rounded-lg bg-muted/30 border border-border/50" data-testid="generated-voice-result">
                  <p className="text-sm">{generatedText.text}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="secondary" className="text-xs">Match: {Math.round((generatedText.voiceMatchScore || 0) * 100)}%</Badge>
                    {generatedText.toneNotes && <span className="text-xs text-muted-foreground">{generatedText.toneNotes}</span>}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => buildMutation.mutate()} disabled={buildMutation.isPending} data-testid="button-rebuild-dna">
              <RefreshCw className={`h-3 w-3 mr-1.5 ${buildMutation.isPending ? "animate-spin" : ""}`} /> Rebuild DNA
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function AnalyticsTab() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/analytics/cross-platform"] });
  const { data: attribution } = useQuery<any>({ queryKey: ["/api/analytics/attribution"] });

  if (isLoading) return <div className="space-y-4">{[1,2,3].map(i => <Skeleton key={i} className="h-24" />)}</div>;

  const t = data?.totals || {};
  const roi = data?.roiMetrics || {};

  return (
    <div className="space-y-4" data-testid="tab-analytics">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total Subscribers" value={t.subscribers?.toLocaleString() || "0"} icon={Users} testId="stat-analytics-subs" />
        <StatCard label="Total Views" value={t.views?.toLocaleString() || "0"} icon={Eye} testId="stat-analytics-views" />
        <StatCard label="Total Videos" value={t.videos || 0} icon={Video} testId="stat-analytics-videos" />
        <StatCard label="Est. Revenue" value={`$${roi.estimatedRevenue?.toLocaleString() || "0"}`} icon={CreditCard} testId="stat-analytics-revenue" />
      </div>

      <Card data-testid="card-analytics-platforms">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            Platform Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(data?.platforms || []).length === 0 ? (
            <div className="flex flex-col items-center py-6 text-center">
              <BarChart3 className="h-8 w-8 text-muted-foreground/20 mb-2" />
              <p className="text-sm text-muted-foreground">Connect platforms to see analytics</p>
            </div>
          ) : (
            <div className="space-y-3">
              {(data?.platforms || []).map((p: any, i: number) => (
                <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-muted/20" data-testid={`platform-${p.name}`}>
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-xs font-bold text-primary">{(p.name || "?")[0].toUpperCase()}</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium capitalize">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.subscribers?.toLocaleString() || 0} subs · {p.totalViews?.toLocaleString() || 0} views</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">{p.totalVideos} videos</p>
                    <p className="text-xs text-muted-foreground">{p.avgViews?.toLocaleString() || 0} avg views</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-analytics-attribution">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            ROI Attribution
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold">${roi.estimatedRevenue?.toLocaleString() || "0"}</p>
              <p className="text-xs text-muted-foreground">Est. Revenue</p>
            </div>
            <div>
              <p className="text-2xl font-bold">${roi.costPerView || "0.00"}</p>
              <p className="text-xs text-muted-foreground">Cost per View</p>
            </div>
            <div>
              <p className="text-2xl font-bold">${roi.revenuePerSub || "0.00"}</p>
              <p className="text-xs text-muted-foreground">Revenue per Sub</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AbTestingTab() {
  const { toast } = useToast();
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/ab-testing/experiments"] });
  const { data: stats } = useQuery<any>({ queryKey: ["/api/ab-testing/stats"] });

  const createMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/ab-testing/create", {
      experimentType: "title",
      variants: [
        { label: "Original", title: "My Video Title" },
        { label: "AI Optimized", title: "AI-Generated Alternative" },
      ],
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ab-testing/experiments"] });
      toast({ title: "Experiment created", description: "A/B test is now running" });
    },
  });

  if (isLoading) return <div className="space-y-4">{[1,2,3].map(i => <Skeleton key={i} className="h-24" />)}</div>;

  const s = stats || {};
  const active = data?.active || [];
  const completed = data?.completed || [];

  return (
    <div className="space-y-4" data-testid="tab-ab-testing">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total Experiments" value={s.totalExperiments || 0} icon={FlaskConical} testId="stat-ab-total" />
        <StatCard label="Active Tests" value={s.activeCount || 0} icon={Play} testId="stat-ab-active" />
        <StatCard label="Win Rate" value={`${s.winRate || 0}%`} icon={Star} testId="stat-ab-winrate" />
        <StatCard label="Avg Improvement" value={s.avgImprovement || "N/A"} icon={TrendingUp} testId="stat-ab-improvement" />
      </div>

      <Card data-testid="card-ab-active">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-primary" />
            Active Experiments
            <Button variant="outline" size="sm" className="ml-auto text-xs" onClick={() => createMutation.mutate()} disabled={createMutation.isPending} data-testid="button-create-experiment">
              + New Test
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {active.length === 0 ? (
            <div className="flex flex-col items-center py-6 text-center">
              <FlaskConical className="h-8 w-8 text-muted-foreground/20 mb-2" />
              <p className="text-sm text-muted-foreground">No active experiments</p>
              <p className="text-xs text-muted-foreground/60">Create a test to compare titles, thumbnails, or descriptions</p>
            </div>
          ) : (
            <div className="space-y-2">
              {active.map((e: any) => (
                <div key={e.id} className="p-3 rounded-lg bg-muted/20 border border-border/50" data-testid={`experiment-${e.id}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium capitalize">{e.experimentType} Test</span>
                    <Badge className="text-xs bg-blue-500/10 text-blue-400">Running</Badge>
                  </div>
                  <div className="flex gap-2">
                    {((e.variants as any[]) || []).map((v: any, i: number) => (
                      <div key={i} className="flex-1 p-2 rounded bg-muted/30 text-xs">
                        <p className="font-medium">{v.label}</p>
                        <p className="text-muted-foreground mt-0.5">{v.metrics?.impressions || 0} impressions</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {completed.length > 0 && (
        <Card data-testid="card-ab-results">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              Completed Tests
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {completed.slice(0, 5).map((e: any) => (
                <div key={e.id} className="flex items-center gap-3 p-2 rounded-lg bg-muted/20">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm capitalize">{e.experimentType} Test</p>
                    <p className="text-xs text-muted-foreground">Winner: {e.winnerId || "N/A"}</p>
                  </div>
                  <Badge variant="secondary" className="text-xs">{e.completedAt ? new Date(e.completedAt).toLocaleDateString() : ""}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SponsorshipTab() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/sponsorships/dashboard"] });
  const { data: mediaKit } = useQuery<any>({ queryKey: ["/api/sponsorships/media-kit"] });
  const { toast } = useToast();

  const findMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/sponsorships/find-matches"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sponsorships/dashboard"] });
      toast({ title: "Sponsor scan complete", description: "AI found potential brand matches" });
    },
  });

  if (isLoading) return <div className="space-y-4">{[1,2,3].map(i => <Skeleton key={i} className="h-24" />)}</div>;

  const d = data || {};
  const mk = mediaKit || {};

  return (
    <div className="space-y-4" data-testid="tab-sponsorships">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Active Deals" value={d.activeDeals || 0} icon={Handshake} testId="stat-sponsor-active" />
        <StatCard label="Total Revenue" value={`$${(d.totalRevenue || 0).toLocaleString()}`} icon={CreditCard} testId="stat-sponsor-revenue" />
        <StatCard label="Pending Offers" value={d.pendingOffers || 0} icon={Clock} testId="stat-sponsor-pending" />
        <StatCard label="AI Match Score" value={`${d.aiMatchScore || 0}%`} icon={Target} testId="stat-sponsor-match" />
      </div>

      <Card data-testid="card-sponsor-media-kit">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Crown className="h-4 w-4 text-primary" />
            Media Kit
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="p-3 rounded-lg bg-muted/30">
              <p className="text-lg font-bold">{mk.totalSubscribers?.toLocaleString() || 0}</p>
              <p className="text-xs text-muted-foreground">Subscribers</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/30">
              <p className="text-lg font-bold">{mk.totalViews?.toLocaleString() || 0}</p>
              <p className="text-xs text-muted-foreground">Total Views</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/30">
              <p className="text-lg font-bold">{mk.avgViews?.toLocaleString() || 0}</p>
              <p className="text-xs text-muted-foreground">Avg Views</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/30">
              <p className="text-lg font-bold">{mk.platformCount || 0}</p>
              <p className="text-xs text-muted-foreground">Platforms</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="card-sponsor-find">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Handshake className="h-4 w-4 text-primary" />
            AI Sponsor Matching
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Button onClick={() => findMutation.mutate()} disabled={findMutation.isPending} data-testid="button-find-sponsors">
            {findMutation.isPending ? <><RefreshCw className="h-4 w-4 animate-spin mr-2" /> Scanning...</> : <><Sparkles className="h-4 w-4 mr-2" /> Find Sponsor Matches</>}
          </Button>
          {(d.recentDeals || []).length > 0 && (
            <div className="mt-4 space-y-2">
              {d.recentDeals.map((deal: any, i: number) => (
                <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-muted/20" data-testid={`deal-${i}`}>
                  <Handshake className="h-4 w-4 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">{deal.brandName || "Brand"}</p>
                    <p className="text-xs text-muted-foreground capitalize">{deal.status}</p>
                  </div>
                  <span className="text-sm font-medium">${deal.value || 0}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

const AGENT_META: Record<string, { icon: any; color: string; bgColor: string; borderColor: string }> = {
  "ai-editor": { icon: Video, color: "text-blue-400", bgColor: "bg-blue-500/10", borderColor: "border-blue-500/30" },
  "ai-moderator": { icon: Users, color: "text-green-400", bgColor: "bg-green-500/10", borderColor: "border-green-500/30" },
  "ai-analyst": { icon: BarChart3, color: "text-purple-400", bgColor: "bg-purple-500/10", borderColor: "border-purple-500/30" },
};

const STATUS_META: Record<string, { label: string; color: string; dotColor: string }> = {
  idle: { label: "Idle", color: "text-emerald-400", dotColor: "bg-emerald-400" },
  working: { label: "Working", color: "text-yellow-400", dotColor: "bg-yellow-400 animate-pulse" },
  offline: { label: "Offline", color: "text-muted-foreground", dotColor: "bg-muted-foreground" },
};

function TeamTab() {
  const { toast } = useToast();
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/team/members"] });
  const { data: aiStatus, isLoading: aiLoading } = useQuery<any>({ queryKey: ["/api/team/ai/status"] });
  const { data: activityData } = useQuery<any[]>({ queryKey: ["/api/team/activity"] });
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");
  const [activeSection, setActiveSection] = useState<"ai-team" | "human-team">("ai-team");

  const runCycleMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/team/ai/run-cycle"),
    onSuccess: () => {
      toast({ title: "AI Team Cycle Complete", description: "All agents have processed their tasks" });
      queryClient.invalidateQueries({ queryKey: ["/api/team/ai/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/team/activity"] });
    },
    onError: () => toast({ title: "Error", description: "Failed to run team cycle", variant: "destructive" }),
  });

  const sendTaskMutation = useMutation({
    mutationFn: (params: { agentRole: string; taskType: string; title: string }) => apiRequest("POST", "/api/team/ai/task", params),
    onSuccess: () => {
      toast({ title: "Task Queued" });
      queryClient.invalidateQueries({ queryKey: ["/api/team/ai/status"] });
    },
  });

  const inviteMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/team/invite", { email: inviteEmail, role: inviteRole }),
    onSuccess: () => {
      toast({ title: "Invitation Sent", description: `Invite sent to ${inviteEmail}` });
      setInviteEmail("");
      setInviteRole("viewer");
      queryClient.invalidateQueries({ queryKey: ["/api/team/members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/team/activity"] });
    },
    onError: async (err: any) => {
      let msg = "Failed to send invitation";
      try { const r = await err?.json?.(); if (r?.error) msg = r.error; } catch {}
      toast({ title: "Error", description: msg, variant: "destructive" });
    },
  });

  const changeRoleMutation = useMutation({
    mutationFn: ({ id, role }: { id: number; role: string }) => apiRequest("PATCH", `/api/team/member/${id}/role`, { role }),
    onSuccess: () => {
      toast({ title: "Role Updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/team/members"] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/team/member/${id}`),
    onSuccess: () => {
      toast({ title: "Member Removed" });
      queryClient.invalidateQueries({ queryKey: ["/api/team/members"] });
    },
  });

  if (isLoading || aiLoading) return <div className="space-y-4">{[1,2,3,4].map(i => <Skeleton key={i} className="h-32" />)}</div>;

  const d = data || {};
  const humanMembers = (d.members || []).filter((m: any) => !m.isAi);
  const pending = d.invitePending || [];
  const agents = aiStatus?.agents || [];
  const recentTasks = aiStatus?.recentTasks || [];
  const health = aiStatus?.teamHealth || {};
  const activity = activityData || [];

  return (
    <div className="space-y-4" data-testid="tab-team">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="AI Agents" value={agents.length} icon={Brain} trend="Active" testId="stat-ai-agents" />
        <StatCard label="Tasks Completed" value={health.completedTasks || 0} icon={CheckCircle2} testId="stat-tasks-completed" />
        <StatCard label="Handoffs" value={health.handoffs || 0} icon={ArrowRight} trend="Cross-team" testId="stat-handoffs" />
        <StatCard label="Human Members" value={humanMembers.length + pending.length} icon={Users} testId="stat-human-members" />
      </div>

      <div className="flex gap-2 mb-2">
        <Button
          variant={activeSection === "ai-team" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveSection("ai-team")}
          data-testid="button-section-ai"
        >
          <Brain className="h-4 w-4 mr-1" /> AI Team
        </Button>
        <Button
          variant={activeSection === "human-team" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveSection("human-team")}
          data-testid="button-section-human"
        >
          <Users className="h-4 w-4 mr-1" /> Human Team
        </Button>
      </div>

      {activeSection === "ai-team" && (
        <>
          <Card data-testid="card-ai-agents" className="border-primary/20">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Brain className="h-4 w-4 text-primary" />
                  AI Team — Working Together
                </CardTitle>
                <Button
                  size="sm"
                  onClick={() => runCycleMutation.mutate()}
                  disabled={runCycleMutation.isPending}
                  data-testid="button-run-cycle"
                >
                  {runCycleMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Zap className="h-4 w-4 mr-1" />}
                  Run Team Cycle
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {agents.map((agent: any) => {
                  const meta = AGENT_META[agent.type] || AGENT_META["ai-analyst"];
                  const statusMeta = STATUS_META[agent.status] || STATUS_META.idle;
                  const AgentIcon = meta.icon;
                  return (
                    <div key={agent.type} className={`p-4 rounded-xl ${meta.bgColor} border ${meta.borderColor} relative overflow-hidden`} data-testid={`agent-card-${agent.type}`}>
                      <div className="absolute top-2 right-2 flex items-center gap-1.5">
                        <div className={`h-2 w-2 rounded-full ${statusMeta.dotColor}`} />
                        <span className={`text-[10px] font-medium ${statusMeta.color}`}>{statusMeta.label}</span>
                      </div>
                      <div className="flex items-center gap-2 mb-2">
                        <div className={`h-10 w-10 rounded-lg ${meta.bgColor} border ${meta.borderColor} flex items-center justify-center`}>
                          <AgentIcon className={`h-5 w-5 ${meta.color}`} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold flex items-center gap-1">
                            {agent.name}
                            <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-primary/30 text-primary ml-1">AI</Badge>
                          </p>
                          <p className="text-[10px] text-muted-foreground capitalize">{agent.role}</p>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{agent.personality}</p>
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-muted-foreground">{agent.tasksCompleted} tasks done</span>
                        {agent.tasksQueued > 0 && <Badge variant="secondary" className="text-[9px] h-4">{agent.tasksQueued} queued</Badge>}
                      </div>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {(agent.capabilities || []).slice(0, 3).map((cap: string) => (
                          <span key={cap} className="text-[9px] px-1.5 py-0.5 rounded-full bg-background/50 text-muted-foreground border border-border/30">
                            {cap.replace(/_/g, " ")}
                          </span>
                        ))}
                        {(agent.capabilities || []).length > 3 && (
                          <span className="text-[9px] text-muted-foreground/60">+{agent.capabilities.length - 3} more</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-collaboration-flow" className="border-primary/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <ArrowRight className="h-4 w-4 text-primary" />
                Team Collaboration Flow
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-center gap-2 py-3 flex-wrap">
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-500/10 border border-purple-500/20">
                  <BarChart3 className="h-4 w-4 text-purple-400" />
                  <span className="text-xs font-medium">Analyst</span>
                </div>
                <div className="flex flex-col items-center">
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  <span className="text-[9px] text-muted-foreground">insights</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <Video className="h-4 w-4 text-blue-400" />
                  <span className="text-xs font-medium">Editor</span>
                </div>
                <div className="flex flex-col items-center">
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  <span className="text-[9px] text-muted-foreground">content</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/20">
                  <Users className="h-4 w-4 text-green-400" />
                  <span className="text-xs font-medium">Moderator</span>
                </div>
                <div className="flex flex-col items-center">
                  <ArrowRight className="h-4 w-4 text-muted-foreground rotate-180" />
                  <span className="text-[9px] text-muted-foreground">feedback</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-500/10 border border-purple-500/20">
                  <BarChart3 className="h-4 w-4 text-purple-400" />
                  <span className="text-xs font-medium">Analyst</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground text-center mt-1">
                Agents autonomously hand off tasks to each other — the Analyst feeds data to the Editor, who creates content for the Moderator to promote, with feedback looping back
              </p>
            </CardContent>
          </Card>

          {recentTasks.length > 0 && (
            <Card data-testid="card-recent-tasks">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" />
                  Recent AI Tasks
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {recentTasks.slice(0, 15).map((t: any) => {
                    const meta = AGENT_META[t.agentRole] || AGENT_META["ai-analyst"];
                    const TaskIcon = meta.icon;
                    return (
                      <div key={t.id} className="flex items-start gap-2 p-2.5 rounded-lg bg-muted/10 border border-border/20" data-testid={`task-row-${t.id}`}>
                        <TaskIcon className={`h-4 w-4 mt-0.5 shrink-0 ${meta.color}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{t.title}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <Badge variant="outline" className={`text-[9px] px-1 h-4 ${meta.color} ${meta.borderColor}`}>
                              {t.agentRole?.replace("ai-", "")}
                            </Badge>
                            <Badge variant={t.status === "completed" ? "default" : t.status === "handed_off" ? "secondary" : t.status === "failed" ? "destructive" : "outline"} className="text-[9px] px-1 h-4">
                              {t.status === "handed_off" ? `→ ${t.handedOffTo?.replace("ai-", "")}` : t.status}
                            </Badge>
                          </div>
                          {t.result?.output && (
                            <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2">{typeof t.result.output === "string" ? t.result.output : JSON.stringify(t.result.output)}</p>
                          )}
                        </div>
                        <span className="text-[10px] text-muted-foreground/50 shrink-0">
                          {t.completedAt ? new Date(t.completedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {activity.length > 0 && (
            <Card data-testid="card-team-activity">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" />
                  Team Activity Log
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1.5 max-h-60 overflow-y-auto">
                  {activity.slice(0, 25).map((a: any) => {
                    const isAi = a.actorUserId?.startsWith("ai:");
                    return (
                      <div key={a.id} className="flex items-start gap-2 text-xs p-2 rounded bg-muted/10" data-testid={`activity-row-${a.id}`}>
                        <div className="mt-0.5">
                          {a.action === "ai_task_completed" && <CheckCircle2 className="h-3.5 w-3.5 text-primary" />}
                          {a.action === "ai_handoff" && <ArrowRight className="h-3.5 w-3.5 text-yellow-400" />}
                          {a.action === "ai_agent_provisioned" && <Sparkles className="h-3.5 w-3.5 text-primary" />}
                          {a.action === "invited" && <UserPlus className="h-3.5 w-3.5 text-blue-400" />}
                          {a.action === "accepted" && <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />}
                          {a.action === "rejected" && <AlertTriangle className="h-3.5 w-3.5 text-red-400" />}
                          {a.action === "removed" && <Trash2 className="h-3.5 w-3.5 text-red-400" />}
                          {a.action === "invite_cancelled" && <Trash2 className="h-3.5 w-3.5 text-orange-400" />}
                          {a.action === "role_changed" && <Settings2 className="h-3.5 w-3.5 text-yellow-400" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          {isAi && <Badge variant="outline" className="text-[8px] px-1 h-3 mr-1 border-primary/30 text-primary">AI</Badge>}
                          <span className="text-foreground capitalize">{a.action.replaceAll("_", " ")}</span>
                          {a.metadata?.summary && <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{a.metadata.summary}</p>}
                          {a.metadata?.from && a.metadata?.to && (
                            <span className="text-muted-foreground text-[10px]"> {a.metadata.from.replace("ai-", "")} → {a.metadata.to.replace("ai-", "")}</span>
                          )}
                          {a.targetEmail && !isAi && <span className="text-muted-foreground"> — {a.targetEmail}</span>}
                        </div>
                        <span className="text-muted-foreground/50 shrink-0 text-[10px]">
                          {a.createdAt ? new Date(a.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {activeSection === "human-team" && (
        <>
          <Card data-testid="card-invite-member">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-primary" />
                Invite Team Member
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={(e) => { e.preventDefault(); if (inviteEmail.trim()) inviteMutation.mutate(); }} className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input data-testid="input-invite-email" type="email" placeholder="teammate@example.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} className="pl-8" required />
                </div>
                <Select value={inviteRole} onValueChange={setInviteRole}>
                  <SelectTrigger className="w-full sm:w-[140px]" data-testid="select-invite-role"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="editor">Editor</SelectItem>
                    <SelectItem value="moderator">Moderator</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
                <Button type="submit" disabled={inviteMutation.isPending || !inviteEmail.trim()} data-testid="button-send-invite">
                  {inviteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4 mr-1" />}
                  Invite
                </Button>
              </form>
            </CardContent>
          </Card>

          {humanMembers.length > 0 && (
            <Card data-testid="card-team-members">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  Active Members ({humanMembers.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {humanMembers.map((m: any) => (
                    <div key={m.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/20 border border-border/30" data-testid={`member-row-${m.id}`}>
                      <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                        {m.profileImageUrl ? <img src={m.profileImageUrl} alt="" className="h-8 w-8 rounded-full object-cover" /> : <Users className="h-4 w-4 text-primary" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{m.firstName ? `${m.firstName} ${m.lastName || ""}`.trim() : m.invitedEmail}</p>
                        <p className="text-xs text-muted-foreground truncate">{m.invitedEmail}</p>
                      </div>
                      <Select value={m.role} onValueChange={(role) => changeRoleMutation.mutate({ id: m.id, role })}>
                        <SelectTrigger className="w-[120px]" data-testid={`select-role-${m.id}`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="editor">Editor</SelectItem>
                          <SelectItem value="moderator">Moderator</SelectItem>
                          <SelectItem value="viewer">Viewer</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button variant="ghost" size="icon" onClick={() => removeMutation.mutate(m.id)} data-testid={`button-remove-${m.id}`}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {pending.length > 0 && (
            <Card data-testid="card-pending-invites">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="h-4 w-4 text-yellow-400" />
                  Pending Invitations ({pending.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {pending.map((p: any) => (
                    <div key={p.id} className="flex items-center gap-3 p-3 rounded-lg bg-yellow-500/5 border border-yellow-500/20" data-testid={`pending-row-${p.id}`}>
                      <Mail className="h-4 w-4 text-yellow-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{p.email}</p>
                        <p className="text-xs text-muted-foreground">Invited as <span className="capitalize font-medium">{p.role}</span></p>
                      </div>
                      <Badge variant="outline" className="text-yellow-400 border-yellow-400/30">Pending</Badge>
                      <Button variant="ghost" size="icon" onClick={() => removeMutation.mutate(p.id)} data-testid={`button-cancel-invite-${p.id}`}><Trash2 className="h-4 w-4 text-muted-foreground" /></Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {humanMembers.length === 0 && pending.length === 0 && (
            <Card>
              <CardContent className="flex flex-col items-center py-10 text-center">
                <Users className="h-10 w-10 text-muted-foreground/20 mb-3" />
                <p className="text-sm text-muted-foreground">No human team members yet</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Your AI team is handling everything — invite humans when you need extra hands</p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function CopyrightTab() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/copyright/status"] });
  const [checkContent, setCheckContent] = useState("");
  const [checkResult, setCheckResult] = useState<any>(null);
  const { toast } = useToast();

  const checkMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/copyright/check", { content: checkContent, platform: "youtube" }),
    onSuccess: async (res) => {
      const result = await res.json();
      setCheckResult(result);
      toast({ title: result.safe ? "Content is safe" : "Issues found", variant: result.safe ? "default" : "destructive" });
    },
  });

  if (isLoading) return <div className="space-y-4">{[1,2,3].map(i => <Skeleton key={i} className="h-24" />)}</div>;

  const d = data || {};

  return (
    <div className="space-y-4" data-testid="tab-copyright">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total Checked" value={d.totalChecked || 0} icon={Shield} testId="stat-copyright-total" />
        <StatCard label="Issues Found" value={d.issuesFound || 0} icon={AlertTriangle} testId="stat-copyright-issues" />
        <StatCard label="Issues Resolved" value={d.issuesResolved || 0} icon={CheckCircle2} testId="stat-copyright-resolved" />
        <StatCard label="Shield Status" value={d.shieldActive ? "Active" : "Ready"} icon={Shield} testId="stat-copyright-status" />
      </div>

      <Card data-testid="card-copyright-check">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            Content Scanner
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={checkContent}
            onChange={(e) => setCheckContent(e.target.value)}
            placeholder="Paste your title, description, or content to scan for copyright issues..."
            className="min-h-[80px] mb-3"
            data-testid="input-copyright-content"
          />
          <Button onClick={() => checkMutation.mutate()} disabled={!checkContent.trim() || checkMutation.isPending} size="sm" data-testid="button-copyright-check">
            {checkMutation.isPending ? "Scanning..." : "Scan Content"}
          </Button>
          {checkResult && (
            <div className={`mt-3 p-3 rounded-lg border ${checkResult.safe ? "bg-emerald-500/5 border-emerald-500/20" : "bg-red-500/5 border-red-500/20"}`} data-testid="copyright-result">
              <div className="flex items-center gap-2 mb-2">
                {checkResult.safe ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <AlertTriangle className="h-4 w-4 text-red-500" />}
                <span className="text-sm font-medium">{checkResult.safe ? "Content is safe to publish" : "Copyright issues detected"}</span>
                <Badge variant={checkResult.safe ? "secondary" : "destructive"} className="text-xs capitalize">{checkResult.riskLevel}</Badge>
              </div>
              {(checkResult.issues || []).length > 0 && (
                <div className="space-y-1 mt-2">
                  {checkResult.issues.map((issue: any, i: number) => (
                    <p key={i} className="text-xs text-muted-foreground">• {issue.description}</p>
                  ))}
                </div>
              )}
              {checkResult.rewrittenContent && (
                <div className="mt-2 p-2 rounded bg-muted/30">
                  <p className="text-xs text-muted-foreground mb-1">Suggested rewrite:</p>
                  <p className="text-sm">{checkResult.rewrittenContent}</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function UsageBillingTab() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/usage/current"] });
  const { data: history } = useQuery<any>({ queryKey: ["/api/usage/history"] });

  if (isLoading) return <div className="space-y-4">{[1,2,3].map(i => <Skeleton key={i} className="h-24" />)}</div>;

  const d = data || {};
  const limits = d.limits || {};

  return (
    <div className="space-y-4" data-testid="tab-usage">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="AI Calls" value={`${d.aiCalls || 0}/${limits.aiCalls || 1000}`} icon={Brain} testId="stat-usage-ai" />
        <StatCard label="Videos Processed" value={`${d.videosProcessed || 0}/${limits.videos || 100}`} icon={Video} testId="stat-usage-videos" />
        <StatCard label="Platforms" value={d.platformsManaged || 0} icon={BarChart3} testId="stat-usage-platforms" />
        <StatCard label="Usage" value={`${d.percentUsed || 0}%`} icon={Activity} testId="stat-usage-percent" />
      </div>

      <Card data-testid="card-usage-breakdown">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-primary" />
            Current Billing Cycle
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm">AI Calls</span>
                <span className="text-xs text-muted-foreground">{d.aiCalls || 0} / {limits.aiCalls || 1000}</span>
              </div>
              <Progress value={limits.aiCalls ? ((d.aiCalls || 0) / limits.aiCalls) * 100 : 0} className="h-2" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm">Videos Processed</span>
                <span className="text-xs text-muted-foreground">{d.videosProcessed || 0} / {limits.videos || 100}</span>
              </div>
              <Progress value={limits.videos ? ((d.videosProcessed || 0) / limits.videos) * 100 : 0} className="h-2" />
            </div>
          </div>
        </CardContent>
      </Card>

      {(history?.months || []).length > 0 && (
        <Card data-testid="card-usage-history">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              Usage History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(history?.months || []).map((m: any, i: number) => (
                <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-muted/20">
                  <span className="text-sm">{m.month}</span>
                  <div className="flex gap-3">
                    <span className="text-xs text-muted-foreground">{m.aiCalls} AI calls</span>
                    <span className="text-xs text-muted-foreground">{m.videosProcessed} videos</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}


const TAB_CONFIG = [
  { id: "vod-loop", label: "VOD Loop", icon: RefreshCw },
  { id: "autopilot", label: "Autopilot", icon: Rocket },
  { id: "dna", label: "Creator DNA", icon: Dna },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "ab-testing", label: "A/B Testing", icon: FlaskConical },
  { id: "sponsors", label: "Sponsors", icon: Handshake },
  { id: "team", label: "Team", icon: Users },
  { id: "copyright", label: "Copyright", icon: Shield },
  { id: "usage", label: "Usage", icon: CreditCard },
] as const;

function CompetitorBattle({ data }: { data: any }) {
  const metrics = [
    { label: "Views", key: "views", icon: Eye },
    { label: "Subscribers", key: "subscribers", icon: Users },
    { label: "Engagement", key: "engagement", icon: Activity },
    { label: "Revenue", key: "revenue", icon: CreditCard },
    { label: "Growth Rate", key: "growthRate", icon: TrendingUp },
  ];

  const yourData = data?.yourStats || { views: 75, subscribers: 60, engagement: 85, revenue: 45, growthRate: 90 };
  const compData = data?.competitorStats || { views: 85, subscribers: 80, engagement: 70, revenue: 95, growthRate: 65 };

  const winningCount = metrics.filter(m => (yourData[m.key] || 0) > (compData[m.key] || 0)).length;

  return (
    <Card className="card-empire empire-glow overflow-hidden" data-testid="card-competitor-battle">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Competitor Battle
          </div>
          <Badge variant={winningCount >= 3 ? "default" : "secondary"} className={winningCount >= 3 ? "glow-purple" : ""}>
            {winningCount >= 3 ? "You're Winning!" : "Climbing the Ranks"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex justify-between text-xs font-mono text-muted-foreground mb-1 px-1">
          <span>YOU</span>
          <span>VS #1 COMPETITOR</span>
        </div>
        <div className="space-y-5">
          {metrics.map((m) => {
            const total = (yourData[m.key] || 0) + (compData[m.key] || 0);
            const yourWidth = total > 0 ? ((yourData[m.key] || 0) / total) * 100 : 50;
            const compWidth = 100 - yourWidth;
            const Icon = m.icon;

            return (
              <div key={m.key} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm px-1">
                  <span className="flex items-center gap-1.5">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    {m.label}
                  </span>
                  <span className="font-mono text-xs">
                    {yourData[m.key]} vs {compData[m.key]}
                  </span>
                </div>
                <div className="h-3 w-full bg-muted/30 rounded-full flex overflow-hidden border border-white/5">
                  <div 
                    className="h-full bg-gradient-to-r from-primary/80 to-primary transition-all duration-1000 ease-out"
                    style={{ width: `${yourWidth}%` }}
                  />
                  <div 
                    className="h-full bg-muted/50 transition-all duration-1000 ease-out"
                    style={{ width: `${compWidth}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        <div className="pt-2">
          <div className="p-3 rounded-lg bg-primary/5 border border-primary/10 text-xs text-primary/80 leading-relaxed">
            <Brain className="h-3.5 w-3.5 inline mr-1.5 mb-0.5" />
            AI Insight: You lead in {winningCount} out of {metrics.length} core metrics. Focus on {metrics.find(m => (yourData[m.key] || 0) < (compData[m.key] || 0))?.label || "scaling your lead"}.
          </div>
        </div>
      </CardContent>
    </Card>
  );
}


function SecurityTab() {
  return (
    <Card data-testid="tab-security">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          System Security
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50">
          <div className="flex items-center gap-3">
            <Lock className="h-4 w-4 text-emerald-500" />
            <div className="text-sm">Neural Encryption</div>
          </div>
          <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-400">Active</Badge>
        </div>
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
            <div className="text-sm">Platform Guardians</div>
          </div>
          <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-400">99.9% Reliable</Badge>
        </div>
      </CardContent>
    </Card>
  );
}

export default function CompetitiveEdge() {
  usePageTitle("Competitive Edge - CreatorOS");

  return (
    <div className="p-6 pb-24 max-w-7xl mx-auto space-y-8 page-enter" data-testid="page-competitive-edge">
      <div className="relative mb-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 animate-pulse">ELITE SYSTEM</Badge>
              <div className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                ENCRYPTED_LINK_ESTABLISHED
              </div>
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight holographic-text">Competitive Edge</h1>
            <p className="text-muted-foreground mt-2 max-w-2xl">
              Advanced intelligence tools to outpace the competition. Leverage AI-driven loops,
              creator DNA matching, and cross-platform forensics.
            </p>
          </div>
          <div className="flex gap-2">
            <div className="text-right hidden sm:block">
              <div className="text-[10px] font-mono text-muted-foreground uppercase">System Load</div>
              <div className="flex gap-0.5 mt-1">
                {[1,2,3,4,5,6,7,8].map(i => <div key={i} className={`w-1.5 h-3 rounded-sm ${i < 6 ? 'bg-primary/60' : 'bg-muted/30'}`} />)}
              </div>
            </div>
          </div>
        </div>
      </div>

      <CompetitiveStatsStrip />

      <div className="grid md:grid-cols-2 gap-6 mb-8">
        <Card className="card-empire p-6">
          <div className="text-xs font-mono text-muted-foreground uppercase mb-4">Competitor Analysis</div>
          <CompetitorBattleBars />
        </Card>
        <Card className="card-empire p-6">
          <div className="text-xs font-mono text-muted-foreground uppercase mb-4">Market Presence</div>
          <MarketShareRadar />
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <Card className="card-empire overflow-hidden border-none shadow-none">
            <div className="data-grid-bg absolute inset-0 opacity-10 pointer-events-none" />
            <CardHeader className="relative pb-0">
              <CardTitle className="text-sm font-mono uppercase tracking-widest text-primary/80 flex items-center gap-2">
                <Crosshair className="h-4 w-4" />
                Market Radar
              </CardTitle>
            </CardHeader>
            <CardContent className="relative pt-6">
              <CompetitiveRadar />
              <SignalStream />
            </CardContent>
          </Card>

          <Card className="card-empire border-none shadow-none">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-mono uppercase tracking-widest text-primary/80 flex items-center gap-2">
                <HardDrive className="h-4 w-4" />
                Hardware Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { label: 'Neural Core', value: 88, icon: Cpu },
                { label: 'Signal Range', value: 94, icon: Radio },
                { label: 'Sync Rate', value: 72, icon: RefreshCw }
              ].map((m) => (
                <div key={m.label} className="space-y-1.5">
                  <div className="flex justify-between text-[10px] font-mono uppercase">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <m.icon className="h-3 w-3" />
                      {m.label}
                    </span>
                    <span className="text-primary">{m.value}%</span>
                  </div>
                  <div className="h-1 bg-muted/30 rounded-full overflow-hidden">
                    <div className="h-full bg-primary/60 rounded-full" style={{ width: `${m.value}%` }} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Tabs defaultValue="vod-loop" className="w-full">
            <TabsList className="grid w-full grid-cols-2 md:grid-cols-5 bg-muted/20 p-1 border border-border/50 h-auto">
              {[
                { value: 'vod-loop', label: 'VOD Loop', icon: RefreshCw },
                { value: 'autopilot-loop', label: 'Autopilot', icon: Zap },
                { value: 'creator-dna', label: 'Creator DNA', icon: Dna },
                { value: 'analytics', label: 'Analytics', icon: BarChart3 },
                { value: 'security', label: 'Security', icon: Shield }
              ].map((t) => (
                <TabsTrigger key={t.value} value={t.value} className="flex flex-col gap-1 py-2 data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm transition-all" data-testid={`tab-trigger-${t.value}`}>
                  <t.icon className="h-4 w-4" />
                  <span className="text-[10px] uppercase font-mono">{t.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>
            <div className="mt-6">
              <TabsContent value="vod-loop"><VodLoopTab /></TabsContent>
              <TabsContent value="autopilot-loop"><AutopilotLoopTab /></TabsContent>
              <TabsContent value="creator-dna"><CreatorDnaTab /></TabsContent>
              <TabsContent value="analytics"><AnalyticsTab /></TabsContent>
              <TabsContent value="security"><SecurityTab /></TabsContent>
            </div>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
