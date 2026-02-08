import { useDashboardStats } from "@/hooks/use-dashboard";
import { useAuth } from "@/hooks/use-auth";
import { MetricCard } from "@/components/MetricCard";
import { StatusBadge } from "@/components/StatusBadge";
import { Link } from "wouter";
import {
  Activity,
  AlertTriangle,
  Film,
  ArrowRight,
  Shield,
  Rocket,
  Lightbulb,
  MessageSquare,
} from "lucide-react";
import { useJobs } from "@/hooks/use-jobs";
import { useAuditLogs } from "@/hooks/use-audit-logs";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { format } from "date-fns";

export default function Dashboard() {
  const { user } = useAuth();
  const { data: stats, isLoading: statsLoading } = useDashboardStats();
  const { data: jobs, isLoading: jobsLoading } = useJobs();
  const { data: auditLogs } = useAuditLogs();

  const activeJobs =
    jobs?.filter((j) => ["processing", "pending"].includes(j.status)).slice(0, 5) || [];
  const recentLogs = auditLogs?.slice(0, 6) || [];

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

  return (
    <div className="p-8 space-y-8 max-w-[1600px] mx-auto animate-in fade-in duration-500">
      <div className="flex justify-between items-end gap-4 flex-wrap">
        <div>
          <h1 data-testid="text-page-title" className="text-3xl font-display font-bold text-foreground">
            {greeting()}, {userName}
          </h1>
          <p className="text-muted-foreground mt-2">Here's your operational overview and system health.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Videos"
          value={stats?.totalVideos || 0}
          icon={Film}
          description="In your content library"
          data-testid="metric-total-videos"
        />
        <MetricCard
          title="Risk Score"
          value={stats?.riskScore || 0}
          icon={AlertTriangle}
          className={
            stats?.riskScore && stats.riskScore > 50 ? "border-amber-500/50 bg-amber-500/5" : ""
          }
          description={`${
            stats?.riskScore && stats.riskScore <= 25
              ? "Safe"
              : stats?.riskScore && stats.riskScore <= 50
                ? "Moderate"
                : "High"
          } risk level`}
          data-testid="metric-risk-score"
        />
        <MetricCard
          title="Compliance"
          value={`${stats?.complianceScore || 100}%`}
          icon={Shield}
          description="Platform rule adherence"
          data-testid="metric-compliance"
        />
        <MetricCard
          title="Active Strategies"
          value={stats?.activeStrategies || 0}
          icon={Rocket}
          description="Growth plans in progress"
          data-testid="metric-strategies"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Link href="/insights">
          <Card data-testid="card-quicklink-insights" className="hover-elevate cursor-pointer">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Lightbulb className="w-5 h-5 text-blue-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">Content Insights</p>
                <p className="text-xs text-muted-foreground">AI pattern analysis</p>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
        <Link href="/strategy">
          <Card data-testid="card-quicklink-strategy" className="hover-elevate cursor-pointer">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10">
                <Rocket className="w-5 h-5 text-purple-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">Growth Strategy</p>
                <p className="text-xs text-muted-foreground">AI growth plans</p>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
        <Link href="/compliance">
          <Card data-testid="card-quicklink-compliance" className="hover-elevate cursor-pointer">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <Shield className="w-5 h-5 text-green-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">Compliance</p>
                <p className="text-xs text-muted-foreground">Platform rules check</p>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
        <Link href="/advisor">
          <Card data-testid="card-quicklink-advisor" className="hover-elevate cursor-pointer">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <MessageSquare className="w-5 h-5 text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">AI Advisor</p>
                <p className="text-xs text-muted-foreground">Ask anything</p>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xl font-bold font-display">Active Operations</h2>
            <Link
              href="/jobs"
              className="text-sm text-primary hover:text-primary/80 flex items-center gap-1 font-medium"
            >
              View All <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <Card>
            {jobsLoading ? (
              <CardContent className="p-8 space-y-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </CardContent>
            ) : activeJobs.length === 0 ? (
              <CardContent className="p-12 text-center text-muted-foreground flex flex-col items-center">
                <Activity className="h-12 w-12 opacity-20 mb-4" />
                <p>No active jobs processing.</p>
                <p className="text-sm opacity-60">System is idle and ready.</p>
              </CardContent>
            ) : (
              <div className="divide-y divide-border/50">
                {activeJobs.map((job) => (
                  <div
                    key={job.id}
                    data-testid={`row-job-${job.id}`}
                    className="p-4 flex items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="h-10 w-10 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                        <Activity className="h-5 w-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm capitalize">{job.type.replace("_", " ")}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="h-1.5 w-24 bg-secondary rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary transition-all duration-500"
                              style={{ width: `${job.progress || 0}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground">{job.progress}%</span>
                        </div>
                      </div>
                    </div>
                    <StatusBadge status={job.status} />
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <h2 className="text-xl font-bold font-display">Recent Activity</h2>
          <Card>
            <CardContent className="p-4 space-y-3">
              {recentLogs.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No recent activity</p>
              ) : (
                recentLogs.map((log) => (
                  <div key={log.id} data-testid={`row-audit-${log.id}`} className="flex items-start gap-3">
                    <div
                      className={`h-2 w-2 rounded-full mt-1.5 shrink-0 ${
                        log.riskLevel === "high"
                          ? "bg-red-400"
                          : log.riskLevel === "medium"
                            ? "bg-amber-400"
                            : "bg-green-400"
                      }`}
                    />
                    <div className="min-w-0">
                      <p className="text-sm text-foreground truncate">
                        {log.action
                          .replace(/_/g, " ")
                          .replace(/\b\w/g, (l: string) => l.toUpperCase())}
                      </p>
                      {log.target && (
                        <p className="text-xs text-muted-foreground truncate">{log.target}</p>
                      )}
                      <p className="text-xs text-muted-foreground/60">
                        {log.createdAt ? format(new Date(log.createdAt), "MMM d, h:mm a") : ""}
                      </p>
                    </div>
                  </div>
                ))
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
    <div className="p-8 space-y-8">
      <div className="flex justify-between">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-10 w-32" />
      </div>
      <div className="grid grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
