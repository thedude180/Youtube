import { useState, useEffect, useMemo, lazy, Suspense } from "react";
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
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { Notification } from "@shared/schema";
import { QueryErrorReset } from "@/components/QueryErrorReset";
import DashboardSkeleton from "./dashboard/DashboardSkeleton";
import MetricsGrid from "./dashboard/MetricsGrid";
import BusinessHealthSection from "./dashboard/BusinessHealthSection";
import AIActionCenter from "./dashboard/AIActionCenter";

const LazyActivityFeedSection = lazy(() => import("./dashboard/ActivityFeedSection"));

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

export default function Dashboard() {
  usePageTitle("Dashboard", "Your AI-powered creator command center. Track content, revenue, growth, and automation across all connected platforms.");
  useSSE();
  const { user } = useAuth();
  const [belowFoldRef] = useLazyVisible("400px");
  const { data: stats, isLoading: statsLoading, error: statsError } = useDashboardStats();
  const { data: agentStatus } = useQuery<AgentStatus[]>({ queryKey: ['/api/agents/status'] });
  const { data: agentActivities } = useQuery<AgentActivity[]>({ queryKey: ['/api/agents/activities'] });
  const { data: notifications } = useQuery<Notification[]>({ queryKey: ['/api/notifications'] });

  const [aiActions, setAiActions] = useState<AIResponse>(null);
  const [aiActionsLoading, setAiActionsLoading] = useState(false);
  const [humanReviewMode, setHumanReviewMode] = useState(() => {
    const stored = localStorage.getItem("humanReviewMode");
    return stored === null ? false : stored === "true";
  });

  useEffect(() => {
    localStorage.setItem("humanReviewMode", String(humanReviewMode));
  }, [humanReviewMode]);

  const activeAgents = useMemo(() =>
    agentStatus?.filter((a) => a.status === "active")?.length || 0,
    [agentStatus]
  );

  const tasksToday = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    return agentActivities?.filter((a) => {
      const created = new Date(a.createdAt);
      return created >= todayStart;
    })?.length || 0;
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
        .catch(() => {})
        .finally(() => setAiActionsLoading(false));
    }
  }, [user]);

  const recentNotifications = useMemo(() =>
    notifications?.slice(0, 5) || [],
    [notifications]
  );

  const unreadNotifications = useMemo(() =>
    (notifications || []).filter((n) => !n.read),
    [notifications]
  );

  const recentActivities = useMemo(() =>
    (agentActivities || []).slice(0, 5),
    [agentActivities]
  );

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  const userName = user
    ? [user.firstName, user.lastName].filter(Boolean).join(" ") || "Creator"
    : "Creator";

  const getHealthStatus = (area: string): { status: "good" | "warning" | "action"; label: string } => {
    switch (area) {
      case "content":
        return (stats?.totalVideos || 0) > 0
          ? { status: "good", label: "Active" }
          : { status: "action", label: "Get Started" };
      case "revenue":
        return (stats?.totalRevenue || 0) > 0
          ? { status: "good", label: "Earning" }
          : { status: "warning", label: "No Revenue" };
      case "brand":
        return { status: "good", label: "Managed" };
      case "legal": {
        const steps = localStorage.getItem("legalFormationSteps");
        const completed = steps ? JSON.parse(steps).length : 0;
        return completed >= 6
          ? { status: "good", label: "Complete" }
          : completed > 0
          ? { status: "warning", label: `${completed}/6 Steps` }
          : { status: "action", label: "Not Started" };
      }
      default:
        return { status: "good", label: "OK" };
    }
  };

  const statusDot = (status: string) => {
    if (status === "good") return "bg-emerald-400";
    if (status === "warning") return "bg-amber-400";
    return "bg-red-400";
  };

  if (statsLoading) return <DashboardSkeleton />;

  if (statsError) {
    return (
      <div className="p-3 lg:p-4 space-y-3 max-w-6xl mx-auto">
        <QueryErrorReset error={statsError} queryKey={["/api/dashboard/stats"]} label="Failed to load dashboard" />
      </div>
    );
  }

  const metrics = [
    { label: "Videos", value: stats?.totalVideos || 0, icon: Film },
    { label: "Revenue", value: `$${(stats?.totalRevenue || 0).toLocaleString()}`, icon: DollarSign },
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
          <p className="text-sm text-muted-foreground mt-1">Your command center overview</p>
        </div>
      </div>

      <Card
        data-testid="card-autonomy-banner"
        className={`shine ${humanReviewMode
          ? "border-amber-500/20"
          : "border-emerald-500/20"
        }`}
      >
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span
                data-testid="status-ai-pulse"
                className="relative flex h-3 w-3 shrink-0"
              >
                {!humanReviewMode && activeAgents > 0 && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                )}
                <span className={`relative inline-flex h-3 w-3 rounded-full ${
                  humanReviewMode ? "bg-amber-400" : "bg-emerald-400"
                }`} />
              </span>
              <div>
                <p data-testid="text-ai-status" className="text-sm font-medium">
                  {humanReviewMode ? "Human review required before publishing" : "AI is running everything"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {tasksToday} task{tasksToday !== 1 ? "s" : ""} completed today
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
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <MetricsGrid metrics={metrics} />

      <BusinessHealthSection healthAreas={healthAreas} getHealthStatus={getHealthStatus} statusDot={statusDot} />

      <AIActionCenter aiActions={aiActions} aiActionsLoading={aiActionsLoading} />

      <Suspense fallback={<Skeleton className="h-12 w-full" />}>
        <LazyActivityFeedSection
          recentNotifications={recentNotifications}
          recentActivities={recentActivities}
          severityColor={severityColor}
        />
      </Suspense>

      <div ref={belowFoldRef} />
    </div>
  );
}
