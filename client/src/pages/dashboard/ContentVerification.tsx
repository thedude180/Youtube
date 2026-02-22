import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Radio,
  Eye,
  ExternalLink,
  RefreshCw,
  Shield,
  AlertTriangle,
  Video,
  Tv,
  Wifi,
  WifiOff,
  Activity,
  BarChart3,
} from "lucide-react";
import { SiYoutube, SiTiktok, SiDiscord } from "react-icons/si";
import { FaXTwitter } from "react-icons/fa6";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface VerificationDashboard {
  summary: {
    totalPublished: number;
    verified: number;
    failed: number;
    pending: number;
    verificationRate: number;
    liveStreamsActive: number;
    totalStreams: number;
    totalVideos: number;
  };
  platformStats: Record<string, { published: number; verified: number; failed: number; pending: number }>;
  liveStreams: {
    id: number;
    title: string;
    status: string;
    platforms: string[];
    startedAt?: string;
    stats?: any;
  }[];
  recentContent: {
    id: number;
    type: string;
    platform: string;
    title: string;
    status: string;
    publishedAt?: string;
    verifiedAt?: string;
    platformUrl?: string;
    platformStatus?: string;
    attempts: number;
    error?: string;
    isRecheck: boolean;
  }[];
  recentVideos: {
    id: number;
    type: string;
    platform: string;
    title: string;
    status: string;
    publishedAt?: string;
    platformUrl?: string;
    youtubeId?: string;
    viewCount?: number;
    duration?: string;
  }[];
  endedStreams: {
    id: number;
    title: string;
    startedAt?: string;
    endedAt?: string;
    platforms: string[];
    stats?: any;
  }[];
}

interface LiveHealth {
  streams: {
    streamId: number;
    platform: string;
    title: string;
    status: string;
    isActuallyBroadcasting: boolean;
    viewerCount?: number;
    bitrate?: string;
    uptime?: string;
    lastHealthCheck: string;
  }[];
}

const platformIcons: Record<string, any> = {
  youtube: SiYoutube,
  youtubeshorts: SiYoutube,
  tiktok: SiTiktok,
  x: FaXTwitter,
  discord: SiDiscord,
};

const platformColors: Record<string, string> = {
  youtube: "text-red-500",
  youtubeshorts: "text-red-400",
  tiktok: "text-pink-400",
  x: "text-white",
  discord: "text-indigo-400",
  twitch: "text-purple-400",
  kick: "text-green-400",
};

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; icon: any; label: string }> = {
    verified: { variant: "default", icon: CheckCircle2, label: "Verified" },
    on_platform: { variant: "default", icon: CheckCircle2, label: "On Platform" },
    failed: { variant: "destructive", icon: XCircle, label: "Failed" },
    pending: { variant: "secondary", icon: Clock, label: "Pending" },
    unverified: { variant: "outline", icon: Clock, label: "Unverified" },
    local_only: { variant: "outline", icon: AlertTriangle, label: "Local Only" },
  };
  const c = config[status] || config.unverified;
  const Icon = c.icon;
  return (
    <Badge variant={c.variant} className="gap-1 text-xs" data-testid={`badge-status-${status}`}>
      <Icon className="h-3 w-3" />
      {c.label}
    </Badge>
  );
}

function LiveStatusIndicator({ status, isActuallyBroadcasting }: { status: string; isActuallyBroadcasting: boolean }) {
  if (isActuallyBroadcasting && status === "healthy") {
    return (
      <div className="flex items-center gap-2" data-testid="live-status-healthy">
        <span className="relative flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
        </span>
        <span className="text-green-400 font-semibold text-sm">LIVE</span>
      </div>
    );
  }
  if (status === "degraded") {
    return (
      <div className="flex items-center gap-2" data-testid="live-status-degraded">
        <AlertTriangle className="h-4 w-4 text-amber-400" />
        <span className="text-amber-400 font-semibold text-sm">Degraded</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2" data-testid="live-status-offline">
      <WifiOff className="h-4 w-4 text-red-400" />
      <span className="text-red-400 font-semibold text-sm">Offline</span>
    </div>
  );
}

export default function ContentVerification() {
  const { toast } = useToast();

  const { data: dashboard, isLoading } = useQuery<VerificationDashboard>({
    queryKey: ["/api/verification/dashboard"],
    refetchInterval: 30000,
  });

  const { data: liveHealth } = useQuery<LiveHealth>({
    queryKey: ["/api/verification/live-health"],
    refetchInterval: 15000,
  });

  const verifyMutation = useMutation({
    mutationFn: async (contentId: number) => {
      const res = await apiRequest("POST", `/api/verification/check-content/${contentId}`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/verification/dashboard"] });
      toast({
        title: data.verified ? "Content Verified" : "Verification Pending",
        description: data.verified
          ? "Content confirmed live on platform"
          : data.error || "Will retry verification",
      });
    },
    onError: () => {
      toast({ title: "Verification Failed", description: "Could not verify content", variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!dashboard) return null;

  const { summary, platformStats, liveStreams, recentContent, recentVideos, endedStreams } = dashboard;
  const liveHealthStreams = liveHealth?.streams || [];

  return (
    <div className="space-y-6" data-testid="content-verification-dashboard">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield className="h-6 w-6 text-emerald-400" />
          <h2 className="text-xl font-bold">Content Verification</h2>
          <Badge variant="outline" className="text-xs" data-testid="badge-verification-rate">
            {summary.verificationRate}% verified
          </Badge>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            queryClient.invalidateQueries({ queryKey: ["/api/verification/dashboard"] });
            queryClient.invalidateQueries({ queryKey: ["/api/verification/live-health"] });
          }}
          data-testid="button-refresh-verification"
        >
          <RefreshCw className="h-4 w-4 mr-1" />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card/50 border-emerald-500/20">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span className="text-xs text-muted-foreground">Verified</span>
            </div>
            <div className="text-2xl font-bold text-emerald-400" data-testid="text-verified-count">{summary.verified}</div>
            <Progress value={summary.verificationRate} className="h-1 mt-2" />
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-amber-500/20">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-amber-400" />
              <span className="text-xs text-muted-foreground">Pending</span>
            </div>
            <div className="text-2xl font-bold text-amber-400" data-testid="text-pending-count">{summary.pending}</div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-red-500/20">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <XCircle className="h-4 w-4 text-red-400" />
              <span className="text-xs text-muted-foreground">Failed</span>
            </div>
            <div className="text-2xl font-bold text-red-400" data-testid="text-failed-count">{summary.failed}</div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-purple-500/20">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <Radio className="h-4 w-4 text-purple-400" />
              <span className="text-xs text-muted-foreground">Live Streams</span>
            </div>
            <div className="text-2xl font-bold text-purple-400" data-testid="text-live-count">{summary.liveStreamsActive}</div>
          </CardContent>
        </Card>
      </div>

      {(liveStreams.length > 0 || liveHealthStreams.length > 0) && (
        <Card className="bg-card/50 border-green-500/30" data-testid="card-live-stream-health">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Wifi className="h-5 w-5 text-green-400" />
              Live Stream Health
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {liveHealthStreams.length > 0 ? liveHealthStreams.map((stream, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-background/50 border border-border/50" data-testid={`live-stream-health-${i}`}>
                  <div className="flex items-center gap-3">
                    <LiveStatusIndicator status={stream.status} isActuallyBroadcasting={stream.isActuallyBroadcasting} />
                    <div>
                      <div className="font-medium text-sm">{stream.title || "Untitled Stream"}</div>
                      <div className="text-xs text-muted-foreground capitalize">{stream.platform}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    {stream.viewerCount !== undefined && (
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Eye className="h-3 w-3" />
                        {stream.viewerCount.toLocaleString()}
                      </div>
                    )}
                    {stream.uptime && (
                      <div className="text-xs text-muted-foreground">{stream.uptime}</div>
                    )}
                    <Badge variant={stream.isActuallyBroadcasting ? "default" : "destructive"} className="text-xs">
                      {stream.isActuallyBroadcasting ? "Broadcasting" : "Not Broadcasting"}
                    </Badge>
                  </div>
                </div>
              )) : liveStreams.map((stream) => (
                <div key={stream.id} className="flex items-center justify-between p-3 rounded-lg bg-background/50 border border-border/50" data-testid={`live-stream-${stream.id}`}>
                  <div className="flex items-center gap-3">
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
                    </span>
                    <div>
                      <div className="font-medium text-sm">{stream.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {(stream.platforms || []).join(", ")}
                      </div>
                    </div>
                  </div>
                  {stream.startedAt && (
                    <div className="text-xs text-muted-foreground">
                      Started {new Date(stream.startedAt).toLocaleTimeString()}
                    </div>
                  )}
                </div>
              ))}
              {liveStreams.length === 0 && liveHealthStreams.length === 0 && (
                <div className="text-center text-muted-foreground text-sm py-4">No active live streams</div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {Object.keys(platformStats).length > 0 && (
        <Card className="bg-card/50" data-testid="card-platform-breakdown">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-blue-400" />
              Platform Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {Object.entries(platformStats).map(([platform, stats]) => {
                const Icon = platformIcons[platform] || Video;
                const color = platformColors[platform] || "text-gray-400";
                const rate = stats.published > 0 ? Math.round((stats.verified / stats.published) * 100) : 0;
                return (
                  <div key={platform} className="p-3 rounded-lg bg-background/50 border border-border/50" data-testid={`platform-stats-${platform}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <Icon className={`h-4 w-4 ${color}`} />
                      <span className="text-sm font-medium capitalize">{platform}</span>
                    </div>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Published</span>
                        <span>{stats.published}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-emerald-400">Verified</span>
                        <span className="text-emerald-400">{stats.verified}</span>
                      </div>
                      {stats.failed > 0 && (
                        <div className="flex justify-between">
                          <span className="text-red-400">Failed</span>
                          <span className="text-red-400">{stats.failed}</span>
                        </div>
                      )}
                      <Progress value={rate} className="h-1 mt-1" />
                      <div className="text-center text-muted-foreground">{rate}%</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="content" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="content" data-testid="tab-content">Published Content</TabsTrigger>
          <TabsTrigger value="videos" data-testid="tab-videos">VODs & Videos</TabsTrigger>
          <TabsTrigger value="streams" data-testid="tab-streams">Stream History</TabsTrigger>
        </TabsList>

        <TabsContent value="content">
          <Card className="bg-card/50">
            <CardContent className="pt-4">
              {recentContent.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  <Shield className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>No published content yet</p>
                  <p className="text-xs mt-1">Content will appear here as it gets published and verified</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {recentContent.map((item) => {
                    const Icon = platformIcons[item.platform] || Video;
                    const color = platformColors[item.platform] || "text-gray-400";
                    return (
                      <div key={item.id} className="flex items-center justify-between p-3 rounded-lg bg-background/50 border border-border/50 hover:border-border transition-colors" data-testid={`content-item-${item.id}`}>
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <Icon className={`h-4 w-4 shrink-0 ${color}`} />
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate">{item.title}</div>
                            <div className="text-xs text-muted-foreground">
                              {item.type} · {item.publishedAt ? new Date(item.publishedAt).toLocaleDateString() : "—"}
                              {item.attempts > 0 && ` · ${item.attempts} checks`}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <StatusBadge status={item.status} />
                          {item.platformUrl && (
                            <a href={item.platformUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground" data-testid={`link-platform-${item.id}`}>
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          )}
                          {(item.status === "unverified" || item.status === "pending" || item.status === "failed") && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => verifyMutation.mutate(item.id)}
                              disabled={verifyMutation.isPending}
                              className="h-7 px-2"
                              data-testid={`button-verify-${item.id}`}
                            >
                              <RefreshCw className={`h-3 w-3 ${verifyMutation.isPending ? "animate-spin" : ""}`} />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="videos">
          <Card className="bg-card/50">
            <CardContent className="pt-4">
              {recentVideos.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  <Video className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>No videos uploaded yet</p>
                  <p className="text-xs mt-1">Videos and VODs will appear as they are processed</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {recentVideos.map((video) => {
                    const Icon = platformIcons[video.platform] || Video;
                    const color = platformColors[video.platform] || "text-gray-400";
                    return (
                      <div key={video.id} className="flex items-center justify-between p-3 rounded-lg bg-background/50 border border-border/50 hover:border-border transition-colors" data-testid={`video-item-${video.id}`}>
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <Icon className={`h-4 w-4 shrink-0 ${color}`} />
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate">{video.title}</div>
                            <div className="text-xs text-muted-foreground">
                              {video.type} · {video.platform}
                              {video.duration && ` · ${video.duration}`}
                              {video.viewCount !== undefined && ` · ${video.viewCount.toLocaleString()} views`}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <StatusBadge status={video.status} />
                          {video.platformUrl && (
                            <a href={video.platformUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground" data-testid={`link-video-${video.id}`}>
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="streams">
          <Card className="bg-card/50">
            <CardContent className="pt-4">
              {endedStreams.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  <Tv className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>No stream history</p>
                  <p className="text-xs mt-1">Past streams will appear here</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {endedStreams.map((stream) => (
                    <div key={stream.id} className="flex items-center justify-between p-3 rounded-lg bg-background/50 border border-border/50" data-testid={`stream-item-${stream.id}`}>
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <Tv className="h-4 w-4 shrink-0 text-purple-400" />
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{stream.title}</div>
                          <div className="text-xs text-muted-foreground">
                            {(stream.platforms || []).join(", ")}
                            {stream.startedAt && ` · ${new Date(stream.startedAt).toLocaleDateString()}`}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {stream.stats?.peakViewers && (
                          <span className="flex items-center gap-1">
                            <Eye className="h-3 w-3" />
                            {stream.stats.peakViewers} peak
                          </span>
                        )}
                        {stream.startedAt && stream.endedAt && (
                          <span>
                            {Math.round((new Date(stream.endedAt).getTime() - new Date(stream.startedAt).getTime()) / 60000)}m
                          </span>
                        )}
                        <Badge variant="secondary" className="text-xs" data-testid={`badge-stream-ended-${stream.id}`}>Ended</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
