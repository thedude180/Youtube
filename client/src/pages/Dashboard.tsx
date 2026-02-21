import { useState, useEffect, useMemo, useCallback, lazy, Suspense } from "react";
import { DateRangePicker } from "@/components/DateRangePicker";
import { useDashboardStats } from "@/hooks/use-dashboard";
import { useSSE } from "@/hooks/use-sse";
import { useAuth } from "@/hooks/use-auth";
import { usePageTitle } from "@/hooks/use-page-title";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
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
  usePageTitle("Dashboard", "Your AI-powered creator command center. Track content, revenue, growth, and automation across all connected platforms.");
  useSSE();
  const { user } = useAuth();
  const [belowFoldRef] = useLazyVisible("400px");
  const { data: stats, isLoading: statsLoading, error: statsError } = useDashboardStats();
  const { data: agentStatus } = useQuery<AgentStatus[]>({ queryKey: ['/api/agents/status'], refetchInterval: 30_000, staleTime: 20_000 });
  const { data: agentActivities } = useQuery<AgentActivity[]>({ queryKey: ['/api/agents/activities'], refetchInterval: 30_000, staleTime: 20_000 });
  const { data: notifications } = useQuery<Notification[]>({ queryKey: ['/api/notifications'], refetchInterval: 30_000, staleTime: 20_000 });

  const [dateRange, setDateRange] = useState(30);
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
    { label: "Revenue", value: `$${totalRevenue.toLocaleString()}`, icon: DollarSign },
    { label: "AI Agents", value: `${activeAgents}/11`, icon: Bot },
    { label: "AI Tasks Today", value: tasksToday, icon: Zap },
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
    <div className="p-4 lg:p-6 space-y-4 max-w-5xl mx-auto fade-in">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 data-testid="text-page-title" className="text-2xl font-display font-bold">
            {greeting()}, {userName}
          </h1>
          <p className="text-sm text-muted-foreground mt-1" data-testid="text-page-subtitle">Your command center overview</p>
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
        className={`shine gradient-border ${humanReviewMode
          ? "border-amber-500/20"
          : "border-emerald-500/20"
        }`}
      >
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <PulseOrb
                status={humanReviewMode ? "warning" : "active"}
                size="md"
                data-testid="status-ai-pulse"
              />
              <div aria-live="polite">
                <div className="flex items-center gap-2">
                  <p data-testid="text-ai-status" className="text-sm font-medium">
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

      <SectionErrorBoundary fallbackTitle="Priority center failed to load">
        <PriorityCommandCenter />
      </SectionErrorBoundary>

      <section role="region" aria-label="Key metrics">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
        <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Key Metrics</span>
        <DateRangePicker value={dateRange} onChange={setDateRange} />
      </div>
      <SectionErrorBoundary fallbackTitle="Metrics failed to load">
        <MetricsGrid metrics={metrics} />
      </SectionErrorBoundary>
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

      <section role="region" aria-label="Business health overview">
      <BusinessHealthSection healthAreas={healthAreas} getHealthStatus={getHealthStatus} statusDot={statusDot} />
      </section>

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

      <div ref={belowFoldRef} />
    </div>
  );
}
