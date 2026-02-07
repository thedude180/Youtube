import { useDashboardStats } from "@/hooks/use-dashboard";
import { MetricCard } from "@/components/MetricCard";
import { StatusBadge } from "@/components/StatusBadge";
import { Link } from "wouter";
import {
  Upload,
  Activity,
  AlertTriangle,
  CalendarClock,
  Youtube,
  Film,
  ArrowRight
} from "lucide-react";
import { useJobs } from "@/hooks/use-jobs";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useDashboardStats();
  const { data: jobs, isLoading: jobsLoading } = useJobs();

  // Filter for active jobs only for the dashboard widget
  const activeJobs = jobs?.filter(j => ["processing", "pending"].includes(j.status)).slice(0, 5) || [];

  if (statsLoading) return <DashboardSkeleton />;

  return (
    <div className="p-8 space-y-8 max-w-[1600px] mx-auto animate-in fade-in duration-500">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground mt-2">Operational overview and system health.</p>
        </div>
        <div className="flex gap-3">
            {/* Quick Actions Placeholder */}
            <button className="bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-lg shadow-primary/25 flex items-center gap-2">
                <Upload className="h-4 w-4" />
                Manual Upload
            </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Videos"
          value={stats?.totalVideos || 0}
          icon={Film}
          trend={{ value: 12, isPositive: true }}
          description="vs last week"
        />
        <MetricCard
          title="Uploaded Today"
          value={stats?.uploadedToday || 0}
          icon={Youtube}
          description="Daily quota usage"
        />
        <MetricCard
          title="Risk Score"
          value={stats?.riskScore || 0}
          icon={AlertTriangle}
          className={stats?.riskScore && stats.riskScore > 50 ? "border-amber-500/50 bg-amber-500/5" : ""}
          description="Out of 100 (Safe)"
        />
        <MetricCard
          title="Next Schedule"
          value={stats?.nextScheduled ? format(new Date(stats.nextScheduled), "HH:mm") : "--:--"}
          icon={CalendarClock}
          description={stats?.nextScheduled ? "Scheduled for today" : "Queue empty"}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Active Operations Queue */}
        <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold font-display">Active Operations</h2>
                <Link href="/jobs" className="text-sm text-primary hover:text-primary/80 flex items-center gap-1 font-medium">
                    View All <ArrowRight className="h-4 w-4" />
                </Link>
            </div>
            
            <div className="bg-card border border-border/50 rounded-2xl overflow-hidden shadow-sm">
                {jobsLoading ? (
                    <div className="p-8 space-y-4">
                        <Skeleton className="h-12 w-full" />
                        <Skeleton className="h-12 w-full" />
                        <Skeleton className="h-12 w-full" />
                    </div>
                ) : activeJobs.length === 0 ? (
                    <div className="p-12 text-center text-muted-foreground flex flex-col items-center">
                        <Activity className="h-12 w-12 opacity-20 mb-4" />
                        <p>No active jobs processing.</p>
                        <p className="text-sm opacity-60">System is idle and ready.</p>
                    </div>
                ) : (
                    <div className="divide-y divide-border/50">
                        {activeJobs.map((job) => (
                            <div key={job.id} className="p-4 flex items-center justify-between hover:bg-secondary/30 transition-colors">
                                <div className="flex items-center gap-4">
                                    <div className="h-10 w-10 rounded-lg bg-secondary flex items-center justify-center">
                                        <Activity className="h-5 w-5 text-primary" />
                                    </div>
                                    <div>
                                        <p className="font-medium text-sm capitalize">{job.type.replace('_', ' ')}</p>
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
            </div>
        </div>

        {/* System Health / Quick Status */}
        <div className="space-y-4">
             <h2 className="text-xl font-bold font-display">System Status</h2>
             <div className="bg-card border border-border/50 rounded-2xl p-6 space-y-6 shadow-sm">
                <div className="space-y-2">
                    <div className="flex justify-between text-sm font-medium">
                        <span>API Rate Limits</span>
                        <span className="text-green-500">Good</span>
                    </div>
                    <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                        <div className="h-full bg-green-500 w-[20%]" />
                    </div>
                    <p className="text-xs text-muted-foreground">Used 2,045 / 10,000 quota units</p>
                </div>

                <div className="space-y-2">
                    <div className="flex justify-between text-sm font-medium">
                        <span>Storage</span>
                        <span className="text-amber-500">Warning</span>
                    </div>
                    <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                        <div className="h-full bg-amber-500 w-[78%]" />
                    </div>
                    <p className="text-xs text-muted-foreground">Local cache 78% full</p>
                </div>
                
                <div className="pt-4 border-t border-border/50">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                        Worker loop active
                    </div>
                </div>
             </div>
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
                {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32 rounded-2xl" />)}
            </div>
        </div>
    );
}
