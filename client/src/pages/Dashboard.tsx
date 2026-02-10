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
  Calendar,
  Bot,
  Video,
  MonitorPlay,
  MessageSquare,
  Radio,
  CheckCircle2,
  Zap,
  Share2,
  Briefcase,
  Heart,
  Shield,
  Target,
  TrendingUp,
  Sparkles,
  Activity,
  Bell,
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
  { key: "agents", label: "AI Team", icon: Bot, link: "/ai" },
  { key: "brand", label: "Brand", icon: Briefcase, link: "/business/brand" },
  { key: "wellness", label: "Wellness", icon: Heart, link: "/business/wellness" },
  { key: "legal", label: "Legal", icon: Shield, link: "/business/legal" },
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
      case "agents":
        return activeAgents > 5
          ? { status: "good", label: `${activeAgents} Active` }
          : activeAgents > 0
          ? { status: "warning", label: `${activeAgents} Active` }
          : { status: "action", label: "Setup Needed" };
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
    { label: "Scheduled", value: stats?.scheduledItems || 0, icon: Calendar },
    { label: "Active Agents", value: `${activeAgents}/11`, icon: Bot },
    { label: "Platforms", value: platformCount, icon: Share2 },
    { label: "AI Tasks Today", value: tasksToday, icon: Zap },
  ];

  const quickLinks = [
    { href: "/content", label: "Library", desc: "Manage videos", icon: Video },
    { href: "/content/channels", label: "Channels", desc: "Connected accounts", icon: Radio },
    { href: "/stream", label: "Go Live", desc: "Stream center", icon: MonitorPlay },
    { href: "/ai", label: "AI Team", desc: "11 agents", icon: Bot },
    { href: "/content/calendar", label: "Calendar", desc: "Content schedule", icon: Calendar },
    { href: "/ai/chat", label: "Advisor", desc: "Ask anything", icon: MessageSquare },
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

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
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
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
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

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {quickLinks.map((link) => {
          const Icon = link.icon;
          return (
            <Link key={link.href} href={link.href}>
              <Card data-testid={`card-quicklink-${link.label.toLowerCase()}`} className="hover-elevate cursor-pointer h-full">
                <CardContent className="p-4 flex items-center gap-3">
                  <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{link.label}</p>
                    <p className="text-xs text-muted-foreground">{link.desc}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {advancedMode && (activeGoals.length > 0 || activeVentures.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {activeGoals.length > 0 && (
            <Card data-testid="card-active-goals">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <CardTitle className="text-base">Active Goals</CardTitle>
                  <Link href="/business/goals">
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
                  <Link href="/business">
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
            <h2 className="text-base font-display font-bold flex items-center gap-2">
              <Bell className="w-4 h-4" />
              Notifications
            </h2>
            <Link href="/notifications">
              <Button variant="ghost" size="sm" data-testid="link-view-all-notifications">View All</Button>
            </Link>
          </div>
          <Card>
            <CardContent className="p-4">
              {recentNotifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 gap-2">
                  <CheckCircle2 className="h-8 w-8 text-muted-foreground" />
                  <p data-testid="text-all-caught-up" className="text-sm text-muted-foreground">All caught up</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentNotifications.map((n) => (
                    <div key={n.id} data-testid={`row-notification-${n.id}`} className="flex items-start gap-3">
                      <div
                        className={`h-2 w-2 rounded-full mt-1.5 shrink-0 ${severityColor(n.severity)}`}
                      />
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

        <div>
          <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
            <h2 className="text-base font-display font-bold flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              AI Activity
            </h2>
            <Link href="/ai">
              <Button variant="ghost" size="sm" data-testid="link-view-ai-team">View Team</Button>
            </Link>
          </div>
          <Card>
            <CardContent className="p-4">
              {recentActivities.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 gap-2">
                  <Bot className="h-8 w-8 text-muted-foreground" />
                  <p data-testid="text-no-ai-activity" className="text-sm text-muted-foreground">No recent AI activity</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentActivities.map((activity: any) => (
                    <div key={activity.id} data-testid={`row-activity-${activity.id}`} className="flex items-start gap-3">
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
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-5xl mx-auto">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-20 rounded-xl" />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-32 rounded-xl" />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
