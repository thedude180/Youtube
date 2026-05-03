import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";
import { Users, Eye, DollarSign, Film, Radio, TrendingUp, Loader2, Bell } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSSE } from "../hooks/use-sse";
import { apiRequest } from "../lib/queryClient";
import { useAuth } from "../hooks/use-auth";

interface DashboardData {
  analytics?: { subscriberCount: number; totalViews: number; watchHoursTotal: number };
  revenue?: { totalCents: number; adCents: number; sponsorCents: number };
  recentVideos?: Array<{ id: number; title: string; status: string; viewCount: number }>;
  trends?: Array<{ signal: string; score: number; category: string }>;
}

function MetricCard({
  icon: Icon, label, value, sub, color = "text-primary",
}: { icon: any; label: string; value: string; sub?: string; color?: string }) {
  return (
    <Card data-testid={`card-metric-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <CardContent className="pt-6">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg bg-muted ${color}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-sm text-muted-foreground">{label}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["/api/growth/dashboard"],
  });

  const { data: notifications = [] } = useQuery<any[]>({
    queryKey: ["/api/notifications"],
  });

  useSSE({
    "notification:new": () => qc.invalidateQueries({ queryKey: ["/api/notifications"] }),
    "growth:trends-updated": () => qc.invalidateQueries({ queryKey: ["/api/growth/dashboard"] }),
    "stream:live": () => qc.invalidateQueries({ queryKey: ["/api/stream/active"] }),
  });

  const analytics = data?.analytics;
  const revenue = data?.revenue;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="page-dashboard">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Welcome back{user?.displayName ? `, ${user.displayName}` : ""}.</p>
        </div>
        <div className="flex items-center gap-2">
          {notifications.length > 0 && (
            <Button variant="outline" size="sm" data-testid="btn-notifications">
              <Bell className="w-4 h-4 mr-2" />
              {notifications.filter((n: any) => !n.readAt).length} new
            </Button>
          )}
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          icon={Users}
          label="Subscribers"
          value={analytics?.subscriberCount?.toLocaleString() ?? "—"}
          color="text-blue-500"
        />
        <MetricCard
          icon={Eye}
          label="Total Views"
          value={analytics?.totalViews?.toLocaleString() ?? "—"}
          color="text-green-500"
        />
        <MetricCard
          icon={DollarSign}
          label="Revenue"
          value={revenue ? `$${(revenue.totalCents / 100).toFixed(0)}` : "—"}
          color="text-amber-500"
        />
        <MetricCard
          icon={Film}
          label="Videos"
          value={data?.recentVideos?.length?.toString() ?? "—"}
          sub="recent"
          color="text-purple-500"
        />
      </div>

      {/* Trend signals */}
      {data?.trends && data.trends.length > 0 && (
        <Card data-testid="card-trends">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Trending Signals
            </CardTitle>
            <CardDescription>Current content opportunities detected by AI</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {data.trends.slice(0, 8).map((t, i) => (
                <Badge key={i} variant="secondary" data-testid={`badge-trend-${i}`} className="gap-1">
                  <span className="font-bold">{t.score}</span>
                  {t.signal}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent videos */}
      {data?.recentVideos && data.recentVideos.length > 0 && (
        <Card data-testid="card-recent-videos">
          <CardHeader>
            <CardTitle>Recent Videos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.recentVideos.map((v) => (
                <div key={v.id} className="flex items-center gap-3" data-testid={`item-video-${v.id}`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{v.title}</p>
                    <p className="text-xs text-muted-foreground">{v.viewCount?.toLocaleString() ?? 0} views</p>
                  </div>
                  <Badge variant={v.status === "published" ? "default" : "secondary"} className="capitalize shrink-0">
                    {v.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!analytics && !revenue && (
        <Card className="border-dashed" data-testid="card-empty-dashboard">
          <CardContent className="pt-10 pb-10 text-center">
            <TrendingUp className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
            <h3 className="font-medium mb-1">No data yet</h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              Connect your YouTube channel in Settings to start seeing analytics here.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
