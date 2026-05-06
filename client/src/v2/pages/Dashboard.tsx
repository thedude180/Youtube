import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Users, Eye, Clock, TrendingUp, Film, Radio, Loader2, Lightbulb, AlertCircle, Link2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSSE } from "../hooks/use-sse";
import { useAuth } from "../hooks/use-auth";
import { useNavigate } from "react-router-dom";

function MetricCard({ icon: Icon, label, value, sub, color = "text-primary" }: {
  icon: any; label: string; value: string; sub?: string; color?: string;
}) {
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

const STATUS_COLOR: Record<string, string> = {
  published: "bg-green-600 text-white border-0",
  draft: "bg-zinc-600 text-white border-0",
  processing: "bg-blue-600 text-white border-0 animate-pulse",
};

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: channels = [] } = useQuery<any[]>({ queryKey: ["/api/channels"] });
  const { data: analytics } = useQuery<any>({ queryKey: ["/api/growth/analytics"] });
  const { data: videos = [] } = useQuery<any[]>({ queryKey: ["/api/content/videos"] });
  const { data: ideas = [] } = useQuery<any[]>({ queryKey: ["/api/content/ideas"] });
  const { data: active } = useQuery<any>({ queryKey: ["/api/stream/active"] });

  useSSE({
    "stream:live": () => qc.invalidateQueries({ queryKey: ["/api/stream/active"] }),
    "stream:ended": () => qc.invalidateQueries({ queryKey: ["/api/stream/active"] }),
    "content:ideas-ready": () => qc.invalidateQueries({ queryKey: ["/api/content/ideas"] }),
  });

  const ytChannel = channels.find((c: any) => c.platform === "youtube");
  const recentVideos = (videos as any[]).slice(0, 6);
  const pendingIdeas = (ideas as any[]).filter((i: any) => i.status === "pending").slice(0, 4);
  const isLive = active?.status === "live";

  const subs = analytics?.subscriberCount ?? ytChannel?.subscriberCount;
  const views = analytics?.totalViews;
  const watchHours = analytics?.watchHoursTotal;
  const ctr = analytics?.averageCtr;

  return (
    <div className="space-y-6" data-testid="page-dashboard">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            {ytChannel?.displayName ?? user?.displayName ?? "Your channel"} · CreatorOS
          </p>
        </div>
        {isLive && (
          <Badge className="bg-red-600 text-white border-0 animate-pulse text-sm px-3 py-1" data-testid="badge-live">
            <Radio className="w-3.5 h-3.5 mr-1.5" />
            LIVE NOW
          </Badge>
        )}
      </div>

      {/* YouTube not connected */}
      {!ytChannel && (
        <Card className="border-amber-500/50 bg-amber-500/5" data-testid="card-connect-alert">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium">Connect your YouTube channel to get started</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Stats, videos, and AI features require a connected channel.</p>
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => navigate("/settings")} data-testid="btn-connect-yt">
                <Link2 className="w-3 h-3 mr-1.5" />
                Connect
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Live stream alert */}
      {isLive && (
        <Card className="border-red-500/50 bg-red-500/5" data-testid="card-live-alert">
          <CardContent className="pt-4 pb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{active.title ?? "Live stream in progress"}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Started {new Date(active.startedAt).toLocaleTimeString()}
              </p>
            </div>
            <Button size="sm" onClick={() => navigate("/stream")} data-testid="btn-go-stream">
              View Stream
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard icon={Users} label="Subscribers" value={subs != null ? Number(subs).toLocaleString() : "—"} color="text-red-500" />
        <MetricCard icon={Eye} label="Total Views" value={views != null ? Number(views).toLocaleString() : "—"} color="text-blue-500" />
        <MetricCard icon={Clock} label="Watch Hours" value={watchHours != null ? Number(watchHours).toLocaleString() : "—"} color="text-green-500" />
        <MetricCard icon={TrendingUp} label="Avg CTR" value={ctr != null ? `${Number(ctr).toFixed(1)}%` : "—"} color="text-purple-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent videos */}
        <div className="lg:col-span-2">
          <Card data-testid="card-recent-videos">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="flex items-center gap-2">
                <Film className="w-4 h-4" />
                Recent Videos
              </CardTitle>
              <Button size="sm" variant="ghost" onClick={() => navigate("/videos")} data-testid="btn-all-videos">
                View all →
              </Button>
            </CardHeader>
            <CardContent>
              {recentVideos.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No videos yet.</p>
              ) : (
                <div className="space-y-3">
                  {recentVideos.map((v: any) => (
                    <div key={v.id} className="flex items-center gap-3" data-testid={`item-video-${v.id}`}>
                      <div className="w-16 h-9 rounded bg-muted shrink-0 overflow-hidden">
                        {v.thumbnailUrl && (
                          <img src={v.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{v.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {v.viewCount != null ? `${Number(v.viewCount).toLocaleString()} views` : v.game ?? ""}
                        </p>
                      </div>
                      <Badge className={`text-xs shrink-0 ${STATUS_COLOR[v.status] ?? ""}`}>
                        {v.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Content ideas */}
        <div>
          <Card data-testid="card-content-ideas">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Lightbulb className="w-4 h-4 text-amber-500" />
                Content Ideas
              </CardTitle>
              <Button size="sm" variant="ghost" onClick={() => navigate("/videos")} data-testid="btn-all-ideas">
                More →
              </Button>
            </CardHeader>
            <CardContent>
              {pendingIdeas.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">No pending ideas.</p>
              ) : (
                <div className="space-y-3">
                  {pendingIdeas.map((idea: any) => (
                    <div key={idea.id} className="space-y-1" data-testid={`idea-${idea.id}`}>
                      <p className="text-sm font-medium leading-tight">{idea.title}</p>
                      {idea.concept && (
                        <p className="text-xs text-muted-foreground line-clamp-2">{idea.concept}</p>
                      )}
                      {idea.priority != null && (
                        <div className="flex items-center gap-1.5">
                          <div className="flex gap-0.5">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <div
                                key={i}
                                className={`w-2 h-2 rounded-full ${i < Math.round(idea.priority / 2) ? "bg-amber-500" : "bg-muted"}`}
                              />
                            ))}
                          </div>
                          <span className="text-xs text-muted-foreground">{idea.priority}/10</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Empty state */}
      {!ytChannel && videos.length === 0 && (
        <Card className="border-dashed" data-testid="card-empty-state">
          <CardContent className="pt-10 pb-10 text-center">
            <TrendingUp className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
            <h3 className="font-medium mb-1">Ready to launch</h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-4">
              Connect your YouTube channel in Settings to unlock analytics, AI metadata, Shorts generation, and more.
            </p>
            <Button size="sm" onClick={() => navigate("/settings")} data-testid="btn-setup-channel">
              <Link2 className="w-4 h-4 mr-2" />
              Connect YouTube
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
