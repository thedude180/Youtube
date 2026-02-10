import { useState, useEffect } from "react";
import { useDashboardStats } from "@/hooks/use-dashboard";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
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
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { formatDistanceToNow } from "date-fns";
import type { Notification } from "@shared/schema";

export default function Dashboard() {
  const { user } = useAuth();
  const { data: stats, isLoading: statsLoading } = useDashboardStats();
  const { data: agentStatus } = useQuery<any[]>({ queryKey: ['/api/agents/status'] });
  const { data: agentActivities } = useQuery<any[]>({ queryKey: ['/api/agents/activities'] });
  const { data: notifications } = useQuery<Notification[]>({ queryKey: ['/api/notifications'] });
  const { data: channels } = useQuery<any[]>({ queryKey: ['/api/channels'] });

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

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  const userName = user
    ? [user.firstName, user.lastName].filter(Boolean).join(" ") || "Creator"
    : "Creator";

  if (statsLoading) return <DashboardSkeleton />;

  const metrics = [
    { label: "Videos", value: stats?.totalVideos || 0, icon: Film },
    { label: "Revenue", value: `$${(stats?.totalRevenue || 0).toLocaleString()}`, icon: DollarSign },
    { label: "Scheduled", value: stats?.scheduledItems || 0, icon: Calendar },
    { label: "Active Agents", value: `${activeAgents}/10`, icon: Bot },
    { label: "Platforms", value: platformCount, icon: Share2 },
    { label: "AI Tasks Today", value: tasksToday, icon: Zap },
  ];

  const quickLinks = [
    { href: "/videos", label: "Library", desc: "Manage videos", icon: Video },
    { href: "/channels", label: "Channels", desc: "Connected accounts", icon: Radio },
    { href: "/stream", label: "Stream", desc: "Go live", icon: MonitorPlay },
    { href: "/team", label: "AI Team", desc: "10 agents", icon: Bot },
    { href: "/schedule", label: "Calendar", desc: "Content schedule", icon: Calendar },
    { href: "/advisor", label: "Advisor", desc: "Ask anything", icon: MessageSquare },
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
        <p className="text-sm text-muted-foreground mt-1">Here's your overview.</p>
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

      <div>
        <h2 className="text-lg font-display font-bold mb-3">Notifications</h2>
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
                <div className="pt-2 border-t border-border">
                  <span
                    data-testid="link-view-all-notifications"
                    className="text-xs text-muted-foreground cursor-default"
                  >
                    View All
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
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
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
