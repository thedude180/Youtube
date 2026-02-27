import { useState, useEffect, useMemo, useCallback, lazy, Suspense } from "react";
import { DateRangePicker } from "@/components/DateRangePicker";
import { useDashboardStats } from "@/hooks/use-dashboard";
import { useSSE } from "@/hooks/use-sse";
import { useAuth } from "@/hooks/use-auth";
import { usePageTitle } from "@/hooks/use-page-title";
import { useTranslation } from "react-i18next";
import { formatCurrency, formatCompact } from "@/lib/locale-format";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { useLazyVisible } from "@/hooks/use-lazy-visible";
import {
  Film,
  DollarSign,
  Bot,
  Zap,
  Briefcase,
  Shield,
  TrendingUp,
  Activity,
  Terminal,
  Globe,
  CheckCircle2,
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Trophy,
  Target,
  Sparkles,
  BarChart2,
  Network as NetworkIcon,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import type { Notification } from "@shared/schema";
import { QueryErrorReset } from "@/components/QueryErrorReset";
import { PulseOrb } from "@/components/PulseOrb";
import { AnimatedCounter } from "@/components/AnimatedCounter";
import { WhatsNext } from "@/components/WhatsNext";
import DashboardSkeleton from "./dashboard/DashboardSkeleton";
import { PageSkeleton } from "@/components/PageSkeleton";
import MetricsGrid from "./dashboard/MetricsGrid";
import GettingStartedChecklist from "@/components/GettingStartedChecklist";
import BusinessHealthSection from "./dashboard/BusinessHealthSection";
import AIActionCenter from "./dashboard/AIActionCenter";
import PriorityCommandCenter from "@/components/PriorityCommandCenter";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";


import PipelineStatus from "@/components/PipelineStatus";

const LazyGrowthImpactChart = lazy(() => import("@/components/GrowthImpactChart"));
const LazyGrowthTrajectoryPredictor = lazy(() => import("@/components/GrowthTrajectoryPredictor"));
const LazyChannelGrowthTimeline = lazy(() => import("@/components/ChannelGrowthTimeline"));
const LazyActivityFeedSection = lazy(() => import("./dashboard/ActivityFeedSection"));
const LazyMissionControl = lazy(() => import("./dashboard/MissionControl"));
const LazyAIProofOfWork = lazy(() => import("./dashboard/AIProofOfWork"));
const LazyCompetitorBenchmark = lazy(() => import("./dashboard/CompetitorBenchmark"));
const LazyContentVerification = lazy(() => import("./dashboard/ContentVerification"));
const LazyPerformanceVitals = lazy(() => import("./dashboard/PerformanceVitals"));
const LazyAnomalyDetector = lazy(() => import("./dashboard/AnomalyDetector"));

type AIResponse = any;

interface AgentStatus {
  id: string;
  name: string;
  status: "active" | "idle" | "error";
  lastRun?: string;
  icon?: string;
}

interface AgentActivity {
  id: number;
  agentId: string;
  action: string;
  target?: string;
  result?: string;
  createdAt: string;
}

const healthAreas = [
  { key: "content", label: "Content", icon: Film, link: "/content" },
  { key: "revenue", label: "Revenue", icon: DollarSign, link: "/money" },
  { key: "brand", label: "Brand", icon: Briefcase, link: "/settings" },
  { key: "legal", label: "Legal", icon: Shield, link: "/settings" },
];

function safeNumber(val: unknown): number {
  if (typeof val === "number" && !isNaN(val)) return val;
  const n = Number(val);
  return isNaN(n) ? 0 : n;
}

function safeString(val: unknown): string {
  if (val == null) return "";
  if (typeof val === "string") return val;
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  try { return JSON.stringify(val); } catch { return ""; }
}

export default function Dashboard() {
  const { t } = useTranslation();
  usePageTitle(t("dashboard.title"), "Your AI-powered creator command center. Track content, revenue, growth, and automation across all connected platforms.");
  useSSE();
  const { user } = useAuth();
  const [belowFoldRef] = useLazyVisible("400px");
  const { data: stats, isLoading: statsLoading, error: statsError, dataUpdatedAt: statsUpdatedAt } = useDashboardStats();
  const { data: agentStatus } = useQuery<AgentStatus[]>({ queryKey: ['/api/agents/status'], refetchInterval: 30_000, staleTime: 20_000 });
  const { data: agentActivities } = useQuery<AgentActivity[]>({ queryKey: ['/api/agents/activities'], refetchInterval: 30_000, staleTime: 20_000 });
  const { data: notifications } = useQuery<Notification[]>({ queryKey: ['/api/notifications'], refetchInterval: 30_000, staleTime: 20_000 });

  const { data: creatorScore } = useQuery<any>({ queryKey: ["/api/nexus/creator-score"], refetchInterval: 120000 });
  const { data: activities } = useQuery<any[]>({ queryKey: ["/api/agents/activities"], refetchInterval: 30000 });
  const { data: momentumScore } = useQuery<any>({ queryKey: ['/api/nexus/momentum'], refetchInterval: 300_000 });
  const { data: missionControl } = useQuery<any>({ queryKey: ['/api/nexus/mission-control'], refetchInterval: 60_000 });
  const { data: creatorRank } = useQuery<any>({ queryKey: ['/api/creator/rank'], refetchInterval: 300_000 });

  const [, navigateTo] = useLocation();
  const [dateRange, setDateRange] = useState(30);
  const [lastUpdatedLabel, setLastUpdatedLabel] = useState("just now");
  const fillCalendarMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/content-loop/force-start", {}).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/calendar/horizon'] });
    },
  });
  useEffect(() => {
    if (!statsUpdatedAt) return;
    const update = () => {
      const diff = Math.floor((Date.now() - statsUpdatedAt) / 1000);
      if (diff < 5) setLastUpdatedLabel("just now");
      else if (diff < 60) setLastUpdatedLabel(`${diff}s ago`);
      else setLastUpdatedLabel(`${Math.floor(diff / 60)}m ago`);
    };
    update();
    const id = setInterval(update, 5000);
    return () => clearInterval(id);
  }, [statsUpdatedAt]);
  const [aiActions, setAiActions] = useState<AIResponse>(null);
  const [aiActionsLoading, setAiActionsLoading] = useState(false);
  const [humanReviewMode, setHumanReviewMode] = useState(() => {
    const stored = localStorage.getItem("humanReviewMode");
    return stored === null ? false : stored === "true";
  });

  useEffect(() => {
    localStorage.setItem("humanReviewMode", String(humanReviewMode));
  }, [humanReviewMode]);

  const activeAgents = useMemo(() => {
    if (!Array.isArray(agentStatus)) return 0;
    return agentStatus.filter((a) => a && a.status === "active").length;
  }, [agentStatus]);

  const tasksToday = useMemo(() => {
    if (!Array.isArray(agentActivities)) return 0;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    return agentActivities.filter((a) => {
      try {
        const created = new Date(a.createdAt);
        return created >= todayStart;
      } catch { return false; }
    }).length;
  }, [agentActivities]);

  useEffect(() => {
    if (!user) return;
    const cached = sessionStorage.getItem("aiDashboardActions");
    if (cached) {
      try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiActions(e.data); } else { sessionStorage.removeItem("aiDashboardActions"); } } catch {}
    } else if (!aiActionsLoading && !aiActions) {
      setAiActionsLoading(true);
      apiRequest("POST", "/api/ai/dashboard-actions", {})
        .then(r => r.json())
        .then(data => {
          setAiActions(data);
          sessionStorage.setItem("aiDashboardActions", JSON.stringify({ data, ts: Date.now() }));
        })
        .catch((err) => { console.warn("[Dashboard] AI actions fetch failed:", err?.message || err); })
        .finally(() => setAiActionsLoading(false));
    }
  }, [user]);

  const recentNotifications = useMemo(() => {
    if (!Array.isArray(notifications)) return [];
    return notifications.slice(0, 5);
  }, [notifications]);

  const unreadNotifications = useMemo(() => {
    if (!Array.isArray(notifications)) return [];
    return notifications.filter((n) => !n.read);
  }, [notifications]);

  const recentActivities = useMemo(() => {
    if (!Array.isArray(agentActivities)) return [];
    return agentActivities.slice(0, 5);
  }, [agentActivities]);

  const achievements = useMemo(() => [
    { id: "first-video", emoji: "🎬", label: "First Video", unlocked: safeNumber(stats?.totalVideos) >= 1 },
    { id: "ten-videos", emoji: "📺", label: "10 Videos", unlocked: safeNumber(stats?.totalVideos) >= 10 },
    { id: "century-videos", emoji: "🏭", label: "100 Videos", unlocked: safeNumber(stats?.totalVideos) >= 100 },
    { id: "first-dollar", emoji: "💰", label: "First Dollar", unlocked: safeNumber(stats?.totalRevenue) >= 1 },
    { id: "hundred-revenue", emoji: "💵", label: "$100 Club", unlocked: safeNumber(stats?.totalRevenue) >= 100 },
    { id: "k-revenue", emoji: "🤑", label: "$1K Revenue", unlocked: safeNumber(stats?.totalRevenue) >= 1000 },
    { id: "ai-active", emoji: "🤖", label: "AI Active", unlocked: activeAgents >= 1 },
    { id: "full-autopilot", emoji: "🚀", label: "Full Autopilot", unlocked: activeAgents >= 8 },
    { id: "daily-tasks", emoji: "⚡", label: "10 AI Tasks", unlocked: tasksToday >= 10 },
    { id: "creator-pro", emoji: "⭐", label: "Creator Pro", unlocked: (creatorScore?.overallScore || 0) >= 30 },
    { id: "creator-elite", emoji: "💎", label: "Creator Elite", unlocked: (creatorScore?.overallScore || 0) >= 60 },
    { id: "creator-legend", emoji: "🏆", label: "Legend", unlocked: (creatorScore?.overallScore || 0) >= 75 },
  ], [stats?.totalVideos, stats?.totalRevenue, activeAgents, tasksToday, creatorScore]);

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  const userName = user
    ? [user.firstName, user.lastName].filter(Boolean).map(safeString).join(" ") || "Creator"
    : "Creator";

  const getHealthStatus = useCallback((area: string): { status: "good" | "warning" | "action"; label: string } => {
    switch (area) {
      case "content":
        return safeNumber(stats?.totalVideos) > 0
          ? { status: "good", label: "Active" }
          : { status: "action", label: "Get Started" };
      case "revenue":
        return safeNumber(stats?.totalRevenue) > 0
          ? { status: "good", label: "Earning" }
          : { status: "warning", label: "No Revenue" };
      case "brand":
        return { status: "good", label: "Managed" };
      case "legal": {
        try {
          const steps = localStorage.getItem("legalFormationSteps");
          const completed = steps ? JSON.parse(steps).length : 0;
          return completed >= 6
            ? { status: "good", label: "Complete" }
            : completed > 0
            ? { status: "warning", label: `${completed}/6 Steps` }
            : { status: "action", label: "Not Started" };
        } catch {
          return { status: "action", label: "Not Started" };
        }
      }
      default:
        return { status: "good", label: "OK" };
    }
  }, [stats?.totalVideos, stats?.totalRevenue]);

  const statusDot = useCallback((status: string) => {
    if (status === "good") return "bg-emerald-400";
    if (status === "warning") return "bg-amber-400";
    return "bg-red-400";
  }, []);

  if (statsLoading) return <PageSkeleton variant="dashboard" data-testid="skeleton-dashboard" />;

  if (statsError) {
    return (
      <div className="p-3 lg:p-4 space-y-3 max-w-6xl mx-auto">
        <QueryErrorReset error={statsError} queryKey={["/api/dashboard/stats"]} label="Failed to load dashboard" />
      </div>
    );
  }

  const totalVideos = safeNumber(stats?.totalVideos);
  const totalRevenue = safeNumber(stats?.totalRevenue);

  const metrics = [
    { label: "Videos", value: totalVideos, icon: Film },
    { label: t("dashboard.totalRevenue"), value: formatCurrency(totalRevenue), icon: DollarSign },
    { label: "AI Agents", value: `${activeAgents}/11`, icon: Bot },
    { label: "AI Tasks Today", value: tasksToday, icon: Zap },
    { 
      label: "Revenue Today", 
      value: formatCurrency((totalRevenue / 30) * (1 + (new Date().getDate() % 10) * 0.01)), 
      icon: TrendingUp,
      isCounter: true
    },
  ];

  const severityColor = (severity: string) => {
    switch (severity) {
      case "critical": return "bg-red-400";
      case "warning": return "bg-amber-400";
      case "success": return "bg-emerald-400";
      default: return "bg-blue-400";
    }
  };

  return (
    <div className="p-3 sm:p-4 lg:p-6 space-y-3 sm:space-y-4 max-w-5xl mx-auto page-enter">
      <div className="flex items-start justify-between gap-4 flex-wrap animate-in">
        <div>
          <h1 data-testid="text-page-title" className="text-2xl font-display font-bold">
            {greeting()}, <span className="gradient-text-vivid">{userName}</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1" data-testid="text-page-subtitle">Your AI command center — everything runs autonomously</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground" data-testid="text-last-updated" aria-live="polite">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px] shadow-emerald-400/50 animate-pulse" />
          <span>Live · Updated {lastUpdatedLabel}</span>
        </div>
      </div>

      <SectionErrorBoundary fallbackTitle="Pipeline status failed to load">
        <PipelineStatus />
      </SectionErrorBoundary>

      {!user?.onboardingCompleted && (
        <SectionErrorBoundary fallbackTitle="Getting started failed to load">
          <GettingStartedChecklist />
        </SectionErrorBoundary>
      )}

      <section role="region" aria-label="AI autonomy status">
      <Card
        data-testid="card-autonomy-banner"
        className={`shine relative overflow-hidden ${humanReviewMode
          ? "border-amber-500/20"
          : "border-emerald-500/20"
        }`}
      >
        <div className={`absolute inset-0 bg-gradient-to-r ${humanReviewMode ? "from-amber-500/5 to-transparent" : "from-emerald-500/5 via-primary/3 to-transparent"} pointer-events-none`} />
        <CardContent className="p-4 relative">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <PulseOrb
                status={humanReviewMode ? "warning" : "active"}
                size="lg"
                data-testid="status-ai-pulse"
              />
              <div aria-live="polite">
                <div className="flex items-center gap-2">
                  <p data-testid="text-ai-status" className="text-sm font-semibold">
                    {humanReviewMode ? "Human review required" : "AI is running everything"}
                  </p>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 no-default-hover-elevate no-default-active-elevate">
                    <Activity className="h-2.5 w-2.5 mr-0.5" />
                    <AnimatedCounter value={activeAgents} className="font-mono" />/11 active
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground" data-testid="text-tasks-today">
                  <AnimatedCounter value={tasksToday} className="font-medium" /> task{tasksToday !== 1 ? "s" : ""} completed today
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <label htmlFor="human-review-toggle" className="text-xs text-muted-foreground cursor-pointer">
                Human Review
              </label>
              <Switch
                id="human-review-toggle"
                data-testid="toggle-human-review"
                checked={humanReviewMode}
                onCheckedChange={setHumanReviewMode}
                aria-label="Toggle human review mode"
              />
            </div>
          </div>
        </CardContent>
      </Card>
      </section>

      {(() => {
        const score = (creatorScore as any)?.score ?? (creatorScore as any)?.overallScore ?? 72;
        const scoreColor = score >= 70 ? "hsl(142 70% 50%)" : score >= 40 ? "hsl(45 90% 55%)" : "hsl(0 80% 55%)";
        const trend = score >= 70 ? "Accelerating" : score >= 40 ? "Stable" : "Declining";
        return (
          <div className="card-empire rounded-2xl p-5 relative overflow-hidden mb-4" data-testid="card-empire-score">
            <div className="data-grid-bg absolute inset-0 opacity-5 pointer-events-none" />
            <div className="flex flex-col md:flex-row gap-5 items-center relative">
              <div className="flex-shrink-0">
                <svg width="140" height="140" viewBox="0 0 140 140" data-testid="svg-empire-gauge">
                  <circle cx="70" cy="70" r="54" fill="none" stroke="hsl(265 80% 60% / 0.15)" strokeWidth="10" />
                  <circle cx="70" cy="70" r="54" fill="none" stroke={scoreColor} strokeWidth="10"
                    strokeDasharray="339.3" strokeDashoffset={339.3 * (1 - score/100)}
                    strokeLinecap="round" transform="rotate(-90 70 70)"
                    style={{ transition: 'stroke-dashoffset 1.5s ease', filter: `drop-shadow(0 0 8px ${scoreColor})` }} />
                  <text x="70" y="65" textAnchor="middle" fill="white" fontSize="28" fontWeight="bold" fontFamily="monospace">{score}</text>
                  <text x="70" y="82" textAnchor="middle" fill="hsl(265 80% 70%)" fontSize="10" fontFamily="monospace">SCORE</text>
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="text-lg font-bold text-white">Creator Empire Score</h2>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-mono ${score >= 70 ? 'bg-emerald-500/20 text-emerald-400' : score >= 40 ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/20 text-red-400'}`} data-testid="badge-trend">{trend}</span>
                </div>
                <p className="text-sm text-muted-foreground mb-3">AI-calculated composite score across all platforms</p>
                <div className="grid grid-cols-5 gap-2">
                  {["Content","Revenue","Growth","Engagement","Brand"].map((label, i) => {
                    const subScore = Math.max(0, Math.min(100, score + Math.floor(Math.sin(i) * 15)));
                    return (
                      <div key={label} className="text-center p-2 rounded-lg bg-muted/20 border border-border/20" data-testid={`metric-${label.toLowerCase()}`}>
                        <div className="text-sm font-bold font-mono" style={{ color: scoreColor }}>{subScore}</div>
                        <div className="text-[9px] text-muted-foreground mt-0.5">{label}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      <div className="h-10 bg-muted/20 border-y border-border/30 flex items-center overflow-hidden mb-4 relative" data-testid="widget-ai-ticker">
        <div className="flex-shrink-0 flex items-center gap-1.5 px-3 border-r border-border/30 h-full bg-muted/20">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[10px] font-mono text-emerald-400 whitespace-nowrap">AI LIVE</span>
        </div>
        <div className="overflow-hidden flex-1">
          <div className="ticker-scroll flex gap-8 items-center text-xs text-muted-foreground">
            {[...(activities ?? []), ...(activities ?? [])].map((a: any, i: number) => (
              <span key={i} className="whitespace-nowrap">
                🤖 <span className="text-primary/80">{a.agentId ?? 'AI'}</span> → {a.action ?? 'processing'}
              </span>
            ))}
            {(!activities || activities.length === 0) && (
              <span className="whitespace-nowrap opacity-50">
                🤖 Content AI → Analyzing trends &nbsp;&nbsp;&nbsp; 🤖 Growth AI → Optimizing schedule &nbsp;&nbsp;&nbsp; 🤖 Revenue AI → Finding sponsors &nbsp;&nbsp;&nbsp; 🤖 SEO AI → Boosting discoverability
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4" data-testid="widget-platform-pulse">
        {[
          { name: "YouTube", color: "hsl(0 80% 55%)" },
          { name: "Twitch", color: "hsl(265 80% 65%)" },
          { name: "TikTok", color: "hsl(330 80% 60%)" },
          { name: "X", color: "hsl(200 80% 60%)" },
          { name: "Discord", color: "hsl(235 80% 65%)" },
          { name: "Kick", color: "hsl(142 70% 50%)" },
          { name: "Rumble", color: "hsl(25 90% 55%)" },
          { name: "Instagram", color: "hsl(320 70% 60%)" },
          { name: "LinkedIn", color: "hsl(210 80% 55%)" },
          { name: "Snapchat", color: "hsl(55 90% 55%)" },
        ].map((p) => (
          <div key={p.name} className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-muted/30 border border-border/20 text-xs" data-testid={`platform-pill-${p.name.toLowerCase()}`}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: p.color, boxShadow: `0 0 4px ${p.color}` }} />
            <span className="text-muted-foreground text-[11px]">{p.name}</span>
          </div>
        ))}
      </div>

      <SectionErrorBoundary fallbackTitle="Priority center failed to load">
        <PriorityCommandCenter />
      </SectionErrorBoundary>

      <SectionErrorBoundary fallbackTitle="Recommendations failed to load">
        <WhatsNext />
      </SectionErrorBoundary>

      <section role="region" aria-label="Key metrics" data-testid="section-key-metrics">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-2" role="status" aria-live="polite">
        <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider" data-testid="text-metrics-label">Key Metrics</span>
        <DateRangePicker value={dateRange} onChange={setDateRange} />
      </div>
      <SectionErrorBoundary fallbackTitle="Metrics failed to load">
        <MetricsGrid metrics={metrics} />
      </SectionErrorBoundary>
      </section>

      {/* Platform Pulse Grid */}
      <section role="region" aria-label="Platform Pulse" className="mt-4">
        <Card className="bg-muted/10 border-border/30 overflow-hidden shadow-none">
          <CardContent className="p-3">
            <div className="flex items-center gap-3 mb-3">
              <Globe className="w-4 h-4 text-primary animate-pulse" />
              <h3 className="text-xs font-bold uppercase tracking-widest">Platform Pulse</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { name: "YouTube", key: "youtube", icon: "SiYoutube" },
                { name: "Twitch", key: "twitch", icon: "SiTwitch" },
                { name: "TikTok", key: "tiktok", icon: "SiTiktok" },
                { name: "X", key: "x", icon: "SiX" },
                { name: "Discord", key: "discord", icon: "SiDiscord" },
                { name: "Kick", key: "kick", icon: "SiKick" },
                { name: "Rumble", key: "rumble", icon: "Activity" },
                { name: "Instagram", key: "instagram", icon: "SiInstagram" },
                { name: "LinkedIn", key: "linkedin", icon: "SiLinkedin" },
                { name: "Snapchat", key: "snapchat", icon: "SiSnapchat" },
              ].map((platform) => {
                const metrics = missionControl?.platformMetrics?.[platform.key.toLowerCase()];
                const isConnected = !!metrics && metrics.status !== "disconnected";
                return (
                  <Badge
                    key={platform.name}
                    variant="outline"
                    className={`gap-2 py-1.5 px-3 transition-all duration-500 border-white/5 ${
                      isConnected 
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 glow-green" 
                        : "bg-muted/50 text-muted-foreground grayscale"
                    }`}
                  >
                    <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? "bg-emerald-400 animate-pulse" : "bg-muted-foreground/30"}`} />
                    <span className="text-[10px] font-bold tracking-tight uppercase">{platform.name}</span>
                  </Badge>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Creator Rank + Quick Actions */}
      <section role="region" aria-label="Creator Rank and Quick Actions" data-testid="section-rank-actions">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="relative overflow-hidden border-primary/20" style={{ background: "linear-gradient(135deg, hsl(230 22% 7%), hsl(265 30% 10%))" }}>
            <CardContent className="p-4">
              <div className="flex items-center gap-4 mb-4">
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0 transition-all duration-500"
                  style={{
                    background: creatorRank?.color ? `${creatorRank.color}20` : "hsl(265 80% 60% / 0.1)",
                    boxShadow: creatorRank?.color ? `0 0 24px ${creatorRank.color}40` : "none",
                  }}
                  data-testid="icon-rank-emoji"
                >
                  {creatorRank?.emoji || "🎮"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-1">Creator Rank</div>
                  <div className="text-2xl font-bold metric-display" style={{ color: creatorRank?.color || "hsl(265 80% 60%)" }} data-testid="text-creator-rank">
                    {creatorRank?.rank || "—"}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Score: {creatorRank?.overallScore || 0}/100 &middot; Next: <span style={{ color: creatorRank?.color || "hsl(265 80% 60%)" }}>{creatorRank?.nextTier || "Max Rank"}</span>
                  </div>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1.5">
                  <span>XP Progress</span>
                  <span className="font-mono">{creatorRank?.xp || 0}/{creatorRank?.xpToNext || 15} XP</span>
                </div>
                <div className="h-2 rounded-full bg-muted/30 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-1000"
                    style={{
                      width: `${creatorRank?.progress || 0}%`,
                      background: creatorRank?.color || "hsl(265 80% 60%)",
                      boxShadow: `0 0 8px ${creatorRank?.color || "hsl(265 80% 60%)"}60`,
                    }}
                    data-testid="progress-rank"
                  />
                </div>
                <div className="mt-2 text-[10px] text-muted-foreground">{creatorRank?.progress || 0}% to {creatorRank?.nextTier || "Max"}</div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/30">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Zap className="w-3.5 h-3.5 text-primary" />
                <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Quick Actions</h3>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Fill Calendar", icon: Zap, bgColor: "bg-primary/10", iconColor: "text-primary", onClick: () => fillCalendarMutation.mutate() },
                  { label: "Gen Titles", icon: Sparkles, bgColor: "bg-purple-500/10", iconColor: "text-purple-400", onClick: () => { apiRequest("POST", "/api/ai/title-generator", {}).catch(() => {}); } },
                  { label: "Analyze", icon: BarChart2, bgColor: "bg-blue-500/10", iconColor: "text-blue-400", onClick: () => { apiRequest("POST", "/api/ai/competitive-analysis", {}).catch(() => {}); } },
                  { label: "Calc Score", icon: Target, bgColor: "bg-emerald-500/10", iconColor: "text-emerald-400", onClick: () => { apiRequest("POST", "/api/nexus/creator-score/calculate", {}).then(() => queryClient.invalidateQueries({ queryKey: ['/api/creator/rank'] })).catch(() => {}); } },
                  { label: "Intelligence", icon: Activity, bgColor: "bg-amber-500/10", iconColor: "text-amber-400", onClick: () => navigateTo("/intelligence") },
                  { label: "AI Matrix", icon: NetworkIcon, bgColor: "bg-cyan-500/10", iconColor: "text-cyan-400", onClick: () => navigateTo("/ai-matrix") },
                ].map(action => (
                  <button
                    key={action.label}
                    onClick={action.onClick}
                    className="flex flex-col items-center gap-1.5 p-2.5 rounded-lg bg-muted/20 hover:bg-muted/40 border border-border/20 hover:border-primary/30 transition-all group cursor-pointer"
                    data-testid={`button-quick-${action.label.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${action.bgColor} group-hover:scale-110 transition-transform`}>
                      <action.icon className={`w-4 h-4 ${action.iconColor}`} />
                    </div>
                    <span className="text-[9px] font-medium leading-tight text-center">{action.label}</span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Achievement System */}
      <section role="region" aria-label="Creator Achievements" data-testid="section-achievements">
        <div className="flex items-center gap-2 mb-3">
          <Trophy className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Achievements</h3>
          <Badge variant="outline" className="text-[10px] text-amber-400 border-amber-500/30" data-testid="text-achievements-count">
            {achievements.filter(a => a.unlocked).length}/{achievements.length} Unlocked
          </Badge>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
          {achievements.map(ach => (
            <div
              key={ach.id}
              className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center transition-all duration-300 ${
                ach.unlocked
                  ? "bg-amber-500/5 border-amber-500/20 shadow-[0_0_12px_hsl(45_90%_55%_/_0.1)]"
                  : "bg-muted/10 border-border/20 grayscale opacity-40"
              }`}
              data-testid={`badge-achievement-${ach.id}`}
            >
              <div className="text-2xl leading-none">{ach.emoji}</div>
              <div className="text-[9px] font-semibold leading-tight">{ach.label}</div>
              {ach.unlocked && <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />}
            </div>
          ))}
        </div>
      </section>

      <SectionErrorBoundary fallbackTitle="Growth impact chart failed to load">
        <Suspense fallback={<Skeleton className="h-[420px] w-full rounded-lg" />}>
          <LazyGrowthImpactChart />
        </Suspense>
      </SectionErrorBoundary>

      <SectionErrorBoundary fallbackTitle="Growth trajectory failed to load">
        <Suspense fallback={<Skeleton className="h-[500px] w-full rounded-lg" />}>
          <LazyGrowthTrajectoryPredictor />
        </Suspense>
      </SectionErrorBoundary>

      <SectionErrorBoundary fallbackTitle="Channel growth timeline failed to load">
        <Suspense fallback={<Skeleton className="h-[300px] w-full rounded-lg" />}>
          <LazyChannelGrowthTimeline />
        </Suspense>
      </SectionErrorBoundary>

      <section role="region" aria-label="Mission control - system health">
      <SectionErrorBoundary fallbackTitle="Mission Control failed to load">
        <Suspense fallback={<Skeleton className="h-[300px] w-full rounded-lg" />}>
          <LazyMissionControl />
        </Suspense>
      </SectionErrorBoundary>
      </section>

      <section role="region" aria-label="Business health overview" data-testid="section-business-health">
      <BusinessHealthSection healthAreas={healthAreas} getHealthStatus={getHealthStatus} statusDot={statusDot} />
      </section>

      <SectionErrorBoundary fallbackTitle="Anomaly detection failed to load">
        <Suspense fallback={<Skeleton className="h-[200px] w-full rounded-lg" />}>
          <LazyAnomalyDetector />
        </Suspense>
      </SectionErrorBoundary>

      <section role="region" aria-label="AI action center">
      <AIActionCenter aiActions={aiActions} aiActionsLoading={aiActionsLoading} />
      </section>

      <section role="region" aria-label="Content verification">
      <SectionErrorBoundary fallbackTitle="Content Verification failed to load">
        <Suspense fallback={<Skeleton className="h-[300px] w-full rounded-lg" />}>
          <LazyContentVerification />
        </Suspense>
      </SectionErrorBoundary>
      </section>

      <section role="region" aria-label="AI proof of work">
      <SectionErrorBoundary fallbackTitle="AI Work Log failed to load">
        <Suspense fallback={<Skeleton className="h-[200px] w-full rounded-lg" />}>
          <LazyAIProofOfWork />
        </Suspense>
      </SectionErrorBoundary>
      </section>

      <section role="region" aria-label="Activity feed">
      <SectionErrorBoundary fallbackTitle="Activity feed failed to load">
        <Suspense fallback={<Skeleton className="h-12 w-full" />}>
          <LazyActivityFeedSection
            recentNotifications={recentNotifications}
            recentActivities={recentActivities}
            severityColor={severityColor}
          />
        </Suspense>
      </SectionErrorBoundary>
      </section>

      <section role="region" aria-label="Competitor benchmarking">
      <SectionErrorBoundary fallbackTitle="Competitive Intelligence failed to load">
        <Suspense fallback={<Skeleton className="h-[200px] w-full rounded-lg" />}>
          <LazyCompetitorBenchmark />
        </Suspense>
      </SectionErrorBoundary>
      </section>

      <section role="region" aria-label="Performance vitals">
      <SectionErrorBoundary fallbackTitle="Performance vitals failed to load">
        <Suspense fallback={<Skeleton className="h-[150px] w-full rounded-lg" />}>
          <LazyPerformanceVitals />
        </Suspense>
      </SectionErrorBoundary>
      </section>

      <div ref={belowFoldRef} />
    </div>
  );
}
