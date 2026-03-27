import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Building2, TrendingUp, Shield, Activity,
  DollarSign, Users, Video, Zap, AlertTriangle, CheckCircle,
} from "lucide-react";

function MetricCard({ title, value, subtitle, icon: Icon, color }: {
  title: string; value: string; subtitle?: string; icon: any; color: string;
}) {
  return (
    <Card data-testid={`metric-card-${title.toLowerCase().replace(/\s+/g, "-")}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
          </div>
          <div className={`p-2 rounded-lg ${color}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function FounderConsole() {
  const { data: stats } = useQuery<any>({ queryKey: ["/api/dashboard/stats"] });
  const { data: health } = useQuery<any>({ queryKey: ["/api/ops/health"] });
  const { data: agents } = useQuery<any[]>({ queryKey: ["/api/agents/status"] });
  const { data: fabric } = useQuery<any>({ queryKey: ["/api/kernel/connection-fabric/health"] });
  const { data: runningJobs } = useQuery<any>({ queryKey: ["/api/kernel/running-now"] });
  const { data: reconciliation } = useQuery<any>({ queryKey: ["/api/kernel/reconciliation"] });

  const activeAgents = agents?.filter((a: any) => a.status === "active").length ?? 0;
  const totalAgents = agents?.length ?? 0;
  const systemHealth = health?.overall?.status || "unknown";

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto" data-testid="page-founder-console">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20">
          <Building2 className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold" data-testid="text-founder-console-title">Founder Console</h1>
          <p className="text-sm text-muted-foreground">Your business at a glance</p>
        </div>
        <Badge
          variant="outline"
          className={`ml-auto ${
            systemHealth === "healthy" ? "border-emerald-500/30 text-emerald-400" :
            systemHealth === "degraded" ? "border-yellow-500/30 text-yellow-400" :
            "border-red-500/30 text-red-400"
          }`}
          data-testid="badge-system-health"
        >
          {systemHealth === "healthy" ? <CheckCircle className="h-3 w-3 mr-1" /> :
           <AlertTriangle className="h-3 w-3 mr-1" />}
          System: {systemHealth}
        </Badge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          title="Subscribers"
          value={stats?.subscriberCount?.toLocaleString() ?? "—"}
          icon={Users}
          color="bg-blue-500/10 text-blue-400"
        />
        <MetricCard
          title="Monthly Revenue"
          value={`$${stats?.monthlyRevenue != null ? Number(stats.monthlyRevenue).toFixed(0) : "—"}`}
          icon={DollarSign}
          color="bg-emerald-500/10 text-emerald-400"
        />
        <MetricCard
          title="Active Agents"
          value={`${activeAgents}/${totalAgents}`}
          subtitle="AI team members"
          icon={Zap}
          color="bg-purple-500/10 text-purple-400"
        />
        <MetricCard
          title="Total Videos"
          value={stats?.totalVideos?.toLocaleString() ?? "—"}
          icon={Video}
          color="bg-orange-500/10 text-orange-400"
        />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card data-testid="card-connection-fabric">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Connection Fabric
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {fabric ? (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Connections</span>
                  <span className="font-medium">{fabric.totalConnections}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Overall Health</span>
                  <Badge variant="outline" className={
                    fabric.overallHealth === "healthy" ? "border-emerald-500/30 text-emerald-400" :
                    fabric.overallHealth === "degraded" ? "border-yellow-500/30 text-yellow-400" :
                    "border-red-500/30 text-red-400"
                  }>
                    {fabric.overallHealth}
                  </Badge>
                </div>
                {fabric.byStatus && Object.entries(fabric.byStatus).map(([status, count]) => (
                  count as number > 0 && (
                    <div key={status} className="flex justify-between text-xs text-muted-foreground">
                      <span className="capitalize">{status}</span>
                      <span>{count as number}</span>
                    </div>
                  )
                ))}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">Loading...</p>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-whats-running">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Zap className="h-4 w-4" />
              What's Running Right Now
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {runningJobs?.activeJobs?.length > 0 ? (
              runningJobs.activeJobs.slice(0, 8).map((job: any, i: number) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
                  <span className="text-foreground truncate flex-1">{job.name || job.jobType}</span>
                  <span className="text-muted-foreground">{job.status}</span>
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground">
                {runningJobs ? "No active jobs right now" : "Loading..."}
              </p>
            )}
            {runningJobs?.summary && (
              <div className="mt-3 pt-2 border-t border-border/30 flex justify-between text-xs text-muted-foreground">
                <span>Active: {runningJobs.summary.active}</span>
                <span>Queued: {runningJobs.summary.queued}</span>
                <span>Completed: {runningJobs.summary.completed}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card data-testid="card-reconciliation">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Shield className="h-4 w-4" />
              State Reconciliation
            </CardTitle>
          </CardHeader>
          <CardContent>
            {reconciliation?.reports?.length > 0 ? (
              <div className="space-y-2">
                {reconciliation.reports.map((report: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="font-medium">{report.domain}</span>
                    <Badge variant="outline" className={
                      report.overallStatus === "consistent" ? "border-emerald-500/30 text-emerald-400" :
                      report.overallStatus === "inconsistent" ? "border-yellow-500/30 text-yellow-400" :
                      "border-red-500/30 text-red-400"
                    }>
                      {report.overallStatus}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                {reconciliation ? "All systems consistent" : "Loading..."}
              </p>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-system-pulse">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              System Pulse Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            {health?.categories ? (
              <div className="space-y-2">
                {Object.entries(health.categories).slice(0, 6).map(([key, val]: [string, any]) => (
                  <div key={key} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground capitalize">{key.replace(/_/g, " ")}</span>
                    <Badge variant="outline" className={
                      val?.status === "healthy" ? "border-emerald-500/30 text-emerald-400" :
                      val?.status === "degraded" ? "border-yellow-500/30 text-yellow-400" :
                      "border-red-500/30 text-red-400"
                    }>
                      {val?.status || "unknown"}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Loading system pulse...</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
