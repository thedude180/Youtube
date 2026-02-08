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
} from "lucide-react";
import { useAuditLogs } from "@/hooks/use-audit-logs";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { format } from "date-fns";

export default function Dashboard() {
  const { user } = useAuth();
  const { data: stats, isLoading: statsLoading } = useDashboardStats();
  const { data: auditLogs } = useAuditLogs();
  const { data: agentStatus } = useQuery<any[]>({ queryKey: ['/api/agents/status'] });

  const recentLogs = auditLogs?.slice(0, 5) || [];
  const activeAgents = agentStatus?.filter((a: any) => a.status === 'active')?.length || 0;

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
  ];

  const quickLinks = [
    { href: "/videos", label: "Library", desc: "Manage videos", icon: Video },
    { href: "/channels", label: "Channels", desc: "Connected accounts", icon: Radio },
    { href: "/stream", label: "Stream", desc: "Go live", icon: MonitorPlay },
    { href: "/team", label: "AI Team", desc: "10 agents", icon: Bot },
    { href: "/schedule", label: "Calendar", desc: "Content schedule", icon: Calendar },
    { href: "/advisor", label: "Advisor", desc: "Ask anything", icon: MessageSquare },
  ];

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 data-testid="text-page-title" className="text-2xl font-display font-bold">
          {greeting()}, {userName}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Here's your overview.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((m) => {
          const Icon = m.icon;
          return (
            <Card key={m.label} data-testid={`metric-${m.label.toLowerCase().replace(/\s+/g, '-')}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
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
        <h2 className="text-lg font-display font-bold mb-3">Recent Activity</h2>
        <Card>
          <CardContent className="p-4">
            {recentLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No recent activity</p>
            ) : (
              <div className="space-y-3">
                {recentLogs.map((log) => (
                  <div key={log.id} data-testid={`row-audit-${log.id}`} className="flex items-start gap-3">
                    <div
                      className={`h-2 w-2 rounded-full mt-1.5 shrink-0 ${
                        log.riskLevel === "high"
                          ? "bg-red-400"
                          : log.riskLevel === "medium"
                            ? "bg-amber-400"
                            : "bg-emerald-400"
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm truncate">
                        {log.action.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase())}
                      </p>
                      {log.target && (
                        <p className="text-xs text-muted-foreground truncate">{log.target}</p>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {log.createdAt ? format(new Date(log.createdAt), "MMM d") : ""}
                    </span>
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

function DashboardSkeleton() {
  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-5xl mx-auto">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
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
