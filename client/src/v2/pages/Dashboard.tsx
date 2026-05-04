import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Users, Eye, DollarSign, Film, Radio, TrendingUp, Loader2, Bell, Scissors, Link2, CheckCircle2, AlertCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSSE } from "../hooks/use-sse";
import { useAuth } from "../hooks/use-auth";
import { useNavigate } from "react-router-dom";

interface DashboardData {
  analytics?: { subscriberCount: number; totalViews: number; watchHoursTotal: number };
  revenue?: { totalCents: number; adCents: number; sponsorCents: number };
  recentVideos?: Array<{ id: number; title: string; status: string; viewCount: number }>;
  trends?: Array<{ signal: string; score: number; category: string }>;
}

const KEY_PLATFORMS = ["youtube", "tiktok", "twitter", "instagram", "discord", "reddit"];

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
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["/api/growth/dashboard"],
  });

  const { data: notifications = [] } = useQuery<any[]>({
    queryKey: ["/api/notifications"],
  });

  const { data: channels = [] } = useQuery<any[]>({
    queryKey: ["/api/channels"],
  });

  const { data: pipelineRuns = [] } = useQuery<any[]>({
    queryKey: ["/api/pipeline/runs"],
  });

  useSSE({
    "notification:new": () => qc.invalidateQueries({ queryKey: ["/api/notifications"] }),
    "growth:trends-updated": () => qc.invalidateQueries({ queryKey: ["/api/growth/dashboard"] }),
    "stream:live": () => qc.invalidateQueries({ queryKey: ["/api/stream/active"] }),
    "pipeline:done": () => qc.invalidateQueries({ queryKey: ["/api/pipeline/runs"] }),
    "pipeline:failed": () => qc.invalidateQueries({ queryKey: ["/api/pipeline/runs"] }),
  });

  const analytics = data?.analytics;
  const revenue = data?.revenue;
  const connectedPlatforms = new Set(channels.map((c: any) => c.platform));
  const missingKeyPlatforms = KEY_PLATFORMS.filter((p) => !connectedPlatforms.has(p));
  const activePipelines = pipelineRuns.filter((r: any) => !["done", "failed"].includes(r.currentStage));
  const recentDone = pipelineRuns.filter((r: any) => r.currentStage === "done").slice(0, 3);
  const unreadCount = notifications.filter((n: any) => !n.readAt).length;

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
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" data-testid="btn-notifications">
              <Bell className="w-4 h-4 mr-2" />
              {unreadCount} new
            </Button>
          )}
        </div>
      </div>

      {/* Platform connection status banner */}
      {missingKeyPlatforms.length > 0 && (
        <Card className="border-amber-500/50 bg-amber-500/5" data-testid="card-platform-alert">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium">Connect platforms to enable full cross-promotion</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Missing: {missingKeyPlatforms.join(", ")}
                  </p>
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => navigate("/settings")} data-testid="btn-go-settings">
                <Link2 className="w-3 h-3 mr-1.5" />
                Connect
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

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

      {/* Active pipelines */}
      {activePipelines.length > 0 && (
        <Card data-testid="card-active-pipelines">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Scissors className="w-4 h-4 text-blue-500" />
              Active Pipelines
              <Badge className="bg-blue-600 text-white border-0 text-xs animate-pulse ml-1">
                {activePipelines.length} running
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {activePipelines.map((r: any) => (
              <div key={r.id} className="flex items-center justify-between text-sm" data-testid={`pipeline-active-${r.id}`}>
                <div className="flex items-center gap-2">
                  {r.type === "livestream"
                    ? <Radio className="w-3.5 h-3.5 text-red-500" />
                    : <Scissors className="w-3.5 h-3.5 text-blue-500" />
                  }
                  <span className="truncate max-w-[200px]">{r.contentTitle ?? "Untitled"}</span>
                </div>
                <Badge className="bg-blue-600 text-white border-0 text-xs animate-pulse">{r.currentStage}</Badge>
              </div>
            ))}
            <Button size="sm" variant="ghost" className="w-full mt-1 text-xs" onClick={() => navigate("/pipeline")}>
              View all pipelines →
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Connected platforms */}
      {channels.length > 0 && (
        <Card data-testid="card-connected-platforms">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Connected Platforms</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {channels.map((c: any) => (
                <div key={c.id} className="flex items-center gap-1.5 bg-muted rounded-md px-2.5 py-1.5 text-xs" data-testid={`platform-chip-${c.platform}`}>
                  <CheckCircle2 className="w-3 h-3 text-green-500" />
                  <span className="font-medium capitalize">{c.platform}</span>
                  {(c.username || c.displayName) && (
                    <span className="text-muted-foreground">· {c.displayName ?? c.username}</span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

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

      {/* Recent completed pipelines */}
      {recentDone.length > 0 && (
        <Card data-testid="card-recent-pipelines">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Recently Completed</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentDone.map((r: any) => (
              <div key={r.id} className="flex items-center justify-between text-sm" data-testid={`pipeline-done-${r.id}`}>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                  <span className="truncate max-w-[200px]">{r.contentTitle ?? "Untitled"}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                  {r.clipCount > 0 && <span>{r.clipCount} clips</span>}
                  {r.postCount > 0 && <span>{r.postCount} posts</span>}
                </div>
              </div>
            ))}
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
      {!analytics && !revenue && channels.length === 0 && (
        <Card className="border-dashed" data-testid="card-empty-dashboard">
          <CardContent className="pt-10 pb-10 text-center">
            <TrendingUp className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
            <h3 className="font-medium mb-1">Ready to launch</h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-4">
              Connect your YouTube channel and social platforms in Settings to start the autonomous content machine.
            </p>
            <Button size="sm" onClick={() => navigate("/settings")} data-testid="btn-setup-platforms">
              <Link2 className="w-4 h-4 mr-2" />
              Connect Platforms
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
