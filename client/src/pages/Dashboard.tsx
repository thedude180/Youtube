import { useState, useEffect } from "react";
import { useDashboardStats } from "@/hooks/use-dashboard";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAdvancedMode } from "@/hooks/use-advanced-mode";
import {
  Film,
  ArrowRight,
  DollarSign,
  Bot,
  CheckCircle2,
  Zap,
  Briefcase,
  Heart,
  Shield,
  TrendingUp,
  Sparkles,
  Activity,
  Scissors,
  BarChart3,
  Lightbulb,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { formatDistanceToNow } from "date-fns";
import type { Notification } from "@shared/schema";

const healthAreas = [
  { key: "content", label: "Content", icon: Film, link: "/content" },
  { key: "revenue", label: "Revenue", icon: DollarSign, link: "/money" },
  { key: "brand", label: "Brand", icon: Briefcase, link: "/settings/brand" },
  { key: "wellness", label: "Wellness", icon: Heart, link: "/settings/wellness" },
  { key: "legal", label: "Legal", icon: Shield, link: "/settings/legal" },
];

export default function Dashboard() {
  const { user } = useAuth();
  const { advancedMode } = useAdvancedMode();
  const { data: stats, isLoading: statsLoading } = useDashboardStats();
  const { data: agentStatus } = useQuery<any[]>({ queryKey: ['/api/agents/status'] });
  const { data: agentActivities } = useQuery<any[]>({ queryKey: ['/api/agents/activities'] });
  const { data: notifications } = useQuery<Notification[]>({ queryKey: ['/api/notifications'] });
  const { data: channels } = useQuery<any[]>({ queryKey: ['/api/channels'] });
  const { data: goals } = useQuery<any[]>({ queryKey: ['/api/goals'] });
  const { data: wellness } = useQuery<any[]>({ queryKey: ['/api/wellness'] });
  const { data: ventures } = useQuery<any[]>({ queryKey: ['/api/ventures'] });
  const { data: briefing } = useQuery<any>({ queryKey: ['/api/learning/briefing'] });
  const { data: optHealth } = useQuery<any>({ queryKey: ['/api/optimization/health-score'] });
  const { data: shortsStatus } = useQuery<any>({ queryKey: ['/api/shorts/status'] });
  const { data: trendingTopics } = useQuery<any[]>({ queryKey: ['/api/optimization/trending-topics'] });

  const [humanReviewMode, setHumanReviewMode] = useState(() => {
    const stored = localStorage.getItem("humanReviewMode");
    return stored === null ? false : stored === "true";
  });

  useEffect(() => {
    localStorage.setItem("humanReviewMode", String(humanReviewMode));
  }, [humanReviewMode]);

  const activeAgents = agentStatus?.filter((a: any) => a.status === 'active')?.length || 0;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const tasksToday = agentActivities?.filter((a: any) => {
    const created = new Date(a.createdAt);
    return created >= todayStart;
  })?.length || 0;

  const recentNotifications = notifications?.slice(0, 5) || [];
  const platformCount = channels?.length || 0;
  const recentActivities = agentActivities?.slice(0, 5) || [];

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

  const activeGoals = goals?.filter((g: any) => g.status === "active") || [];
  const activeVentures = ventures?.filter((v: any) => v.status === "active") || [];

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
                Human Review Mode
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {metrics.map((m) => {
          const Icon = m.icon;
          return (
            <Card key={m.label} data-testid={`metric-${m.label.toLowerCase().replace(/\s+/g, '-')}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-1 mb-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">{m.label}</span>
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="text-xl font-bold font-display">{m.value}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card data-testid="card-business-health">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-base">Business Health</CardTitle>
            <Badge variant="secondary" className="text-xs">
              <Activity className="w-3 h-3 mr-1" />
              {healthAreas.filter(a => getHealthStatus(a.key).status === "good").length}/{healthAreas.length} healthy
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {healthAreas.map((area) => {
              const health = getHealthStatus(area.key);
              const Icon = area.icon;
              return (
                <Link key={area.key} href={area.link}>
                  <div className="flex flex-col items-center gap-2 p-3 rounded-md hover-elevate cursor-pointer" data-testid={`health-${area.key}`}>
                    <div className="relative">
                      <Icon className="h-5 w-5 text-muted-foreground" />
                      <span className={`absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full ${statusDot(health.status)}`} />
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-medium">{area.label}</p>
                      <p className={`text-xs ${health.status === "good" ? "text-emerald-400" : health.status === "warning" ? "text-amber-400" : "text-red-400"}`}>
                        {health.label}
                      </p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {briefing && (
        <Card data-testid="card-daily-briefing">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-base flex items-center gap-2">
                <Lightbulb className="w-4 h-4" />
                Daily Briefing
              </CardTitle>
              {briefing.date && (
                <span className="text-xs text-muted-foreground">{new Date(briefing.date).toLocaleDateString()}</span>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {briefing.summary && <p data-testid="text-briefing-summary" className="text-sm text-muted-foreground">{briefing.summary}</p>}
            {briefing.actionItems && briefing.actionItems.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium">Action Items</p>
                {briefing.actionItems.slice(0, 4).map((item: any, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-sm" data-testid={`briefing-action-${i}`}>
                    <span className={`h-2 w-2 rounded-full mt-1.5 shrink-0 ${item.priority === "high" ? "bg-red-400" : item.priority === "medium" ? "bg-amber-400" : "bg-emerald-400"}`} />
                    <span className="text-muted-foreground">{item.title || item.description || item}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {advancedMode && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card data-testid="card-optimization-health">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`h-10 w-10 rounded-full flex items-center justify-center ${(optHealth?.score || 0) >= 70 ? "bg-emerald-500/10" : (optHealth?.score || 0) >= 40 ? "bg-amber-500/10" : "bg-red-500/10"}`}>
                  <BarChart3 className={`h-5 w-5 ${(optHealth?.score || 0) >= 70 ? "text-emerald-400" : (optHealth?.score || 0) >= 40 ? "text-amber-400" : "text-red-400"}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold font-display">{optHealth?.score || 0}</p>
                  <p className="text-xs text-muted-foreground">Optimization Score</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-shorts-pipeline">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`h-10 w-10 rounded-full flex items-center justify-center ${shortsStatus?.status === "running" ? "bg-blue-500/10" : "bg-muted"}`}>
                  <Scissors className={`h-5 w-5 ${shortsStatus?.status === "running" ? "text-blue-400" : "text-muted-foreground"}`} />
                </div>
                <div>
                  <p className="text-sm font-medium">{shortsStatus?.status === "running" ? "Processing" : shortsStatus?.status || "Idle"}</p>
                  <p className="text-xs text-muted-foreground">Shorts Pipeline{shortsStatus?.totalClips ? ` (${shortsStatus.totalClips} clips)` : ""}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-trending">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full flex items-center justify-center bg-purple-500/10">
                  <TrendingUp className="h-5 w-5 text-purple-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">Trending</p>
                  <p className="text-xs text-muted-foreground truncate">{trendingTopics?.[0]?.topic || trendingTopics?.[0]?.name || "Scanning trends..."}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {advancedMode && (activeGoals.length > 0 || activeVentures.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {activeGoals.length > 0 && (
            <Card data-testid="card-active-goals">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <CardTitle className="text-base">Active Goals</CardTitle>
                  <Link href="/money/goals">
                    <Button variant="ghost" size="sm" data-testid="link-all-goals"><ArrowRight className="w-4 h-4" /></Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {activeGoals.slice(0, 3).map((goal: any) => {
                  const pct = Math.min(Math.round(((goal.currentValue || 0) / (goal.targetValue || 1)) * 100), 100);
                  return (
                    <div key={goal.id} className="space-y-1" data-testid={`dashboard-goal-${goal.id}`}>
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-medium truncate">{goal.title}</span>
                        <span className="text-muted-foreground shrink-0">{pct}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {activeVentures.length > 0 && (
            <Card data-testid="card-active-ventures">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <CardTitle className="text-base">Active Ventures</CardTitle>
                  <Link href="/money/ventures">
                    <Button variant="ghost" size="sm" data-testid="link-all-ventures"><ArrowRight className="w-4 h-4" /></Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {activeVentures.slice(0, 3).map((v: any) => {
                  const pnl = (v.revenue || 0) - (v.expenses || 0);
                  return (
                    <div key={v.id} className="flex items-center justify-between gap-2 flex-wrap" data-testid={`dashboard-venture-${v.id}`}>
                      <div className="flex items-center gap-2">
                        <Briefcase className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-sm font-medium">{v.name}</span>
                      </div>
                      <span className={`text-xs font-medium ${pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {pnl >= 0 ? "+" : ""}${pnl.toLocaleString()}
                      </span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <Card data-testid="card-activity-feed">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Activity Feed
            </CardTitle>
            <Link href="/notifications">
              <Button variant="ghost" size="sm" data-testid="link-view-all-notifications">View All</Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {recentNotifications.length === 0 && recentActivities.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <CheckCircle2 className="h-8 w-8 text-muted-foreground/30" />
              <p data-testid="text-all-caught-up" className="text-sm text-muted-foreground">All caught up - AI is handling everything</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentActivities.map((activity: any) => (
                <div key={`ai-${activity.id}`} data-testid={`row-activity-${activity.id}`} className="flex items-start gap-3">
                  <div className="h-6 w-6 rounded-full bg-purple-500/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="h-3 w-3 text-purple-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{activity.agentName || "AI Agent"}</p>
                    <p className="text-xs text-muted-foreground truncate">{activity.action || activity.description || "Completed task"}</p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {activity.createdAt
                      ? formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })
                      : ""}
                  </span>
                </div>
              ))}
              {recentNotifications.map((n) => (
                <div key={`notif-${n.id}`} data-testid={`row-notification-${n.id}`} className="flex items-start gap-3">
                  <div className={`h-2 w-2 rounded-full mt-2 shrink-0 ${severityColor(n.severity)}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{n.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{n.message}</p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {n.createdAt
                      ? formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })
                      : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-5xl mx-auto">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-20 rounded-xl" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-32 rounded-xl" />
      <Skeleton className="h-48 rounded-xl" />
    </div>
  );
}
