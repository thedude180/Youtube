import { useState, useEffect, useMemo } from "react";
import { useDashboardStats } from "@/hooks/use-dashboard";
import { useSSE } from "@/hooks/use-sse";
import { useAuth } from "@/hooks/use-auth";
import { usePageTitle } from "@/hooks/use-page-title";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Film,
  DollarSign,
  Bot,
  Zap,
  Briefcase,
  Heart,
  Shield,
  Activity,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { formatDistanceToNow } from "date-fns";
import type { Notification } from "@shared/schema";
import { QueryErrorReset } from "@/components/QueryErrorReset";
import DashboardSkeleton from "./dashboard/DashboardSkeleton";
import MetricsGrid from "./dashboard/MetricsGrid";
import BusinessHealthSection from "./dashboard/BusinessHealthSection";

type AIResponse = Record<string, unknown> | null;

interface AgentStatus {
  id: string;
  name: string;
  status: "active" | "idle" | "error";
  lastRun?: string;
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
  { key: "brand", label: "Brand", icon: Briefcase, link: "/settings/brand" },
  { key: "wellness", label: "Wellness", icon: Heart, link: "/settings/wellness" },
  { key: "legal", label: "Legal", icon: Shield, link: "/settings/legal" },
];

export default function Dashboard() {
  usePageTitle("Dashboard");
  useSSE();
  const { user } = useAuth();
  const { data: stats, isLoading: statsLoading, error: statsError } = useDashboardStats();
  const { data: agentStatus } = useQuery<AgentStatus[]>({ queryKey: ['/api/agents/status'] });
  const { data: agentActivities } = useQuery<AgentActivity[]>({ queryKey: ['/api/agents/activities'] });
  const { data: notifications } = useQuery<Notification[]>({ queryKey: ['/api/notifications'] });
  const { data: wellness } = useQuery<any[]>({ queryKey: ['/api/wellness'] });

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
    return agentActivities?.filter((a) => new Date(a.createdAt) >= todayStart)?.length || 0;
  }, [agentActivities]);

  const recentNotifications = useMemo(() =>
    (notifications || []).filter((n) => !n.read).slice(0, 4),
    [notifications]
  );

  const recentActivities = useMemo(() =>
    (agentActivities || []).slice(0, 4),
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
      case "wellness": {
        const lastCheck = wellness?.[0];
        if (!lastCheck) return { status: "action", label: "Check In" };
        const daysSince = Math.floor((Date.now() - new Date(lastCheck.createdAt).getTime()) / (1000 * 60 * 60 * 24));
        return daysSince < 1
          ? { status: "good", label: "Checked In" }
          : { status: "warning", label: `${daysSince}d ago` };
      }
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
      <div className="p-6 lg:p-8 space-y-6 max-w-5xl mx-auto">
        <QueryErrorReset error={statsError} queryKey={["/api/dashboard/stats"]} label="Failed to load dashboard" />
      </div>
    );
  }

  const metrics = [
    { label: "Videos", value: stats?.totalVideos || 0, icon: Film },
    { label: "Revenue", value: `$${(stats?.totalRevenue || 0).toLocaleString()}`, icon: DollarSign },
    { label: "AI Agents", value: `${activeAgents}/11`, icon: Bot },
    { label: "Tasks Today", value: tasksToday, icon: Zap },
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
    <div className="p-6 lg:p-8 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 data-testid="text-page-title" className="text-2xl font-display font-bold">
          {greeting()}, {userName}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Here's your command center overview.</p>
      </div>

      <Card
        data-testid="card-autonomy-banner"
        className={humanReviewMode
          ? "border-amber-500/30 bg-amber-500/5"
          : "border-emerald-500/30 bg-emerald-500/5"
        }
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

      {getHealthStatus("wellness").status !== "good" && (
        <Card data-testid="card-daily-checkin-prompt" className="border-primary/20">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Heart className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm font-medium">Daily Check-In</p>
                  <p className="text-xs text-muted-foreground">Track your wellness to prevent burnout.</p>
                </div>
              </div>
              <Link href="/settings/wellness">
                <Button size="sm" data-testid="button-dashboard-checkin">
                  Check In
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {recentNotifications.length > 0 && (
        <Card data-testid="card-notifications">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-sm font-medium">Recent Alerts</p>
              <Badge variant="secondary" className="text-xs">{recentNotifications.length} unread</Badge>
            </div>
            <div className="space-y-2">
              {recentNotifications.map((n) => (
                <div key={n.id} data-testid={`notification-${n.id}`} className="flex items-start gap-3">
                  <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${severityColor(n.severity || "info")}`} />
                  <div className="min-w-0">
                    <p className="text-sm">{n.title}</p>
                    <p className="text-xs text-muted-foreground">{n.createdAt ? formatDistanceToNow(new Date(n.createdAt), { addSuffix: true }) : ""}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {recentActivities.length > 0 && (
        <Card data-testid="card-activity-feed">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-medium">Recent AI Activity</p>
            </div>
            <div className="space-y-2">
              {recentActivities.map((a) => (
                <div key={a.id} data-testid={`activity-${a.id}`} className="flex items-start gap-3">
                  <Bot className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm">{a.action}{a.target ? ` - ${a.target}` : ""}</p>
                    <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}</p>
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
