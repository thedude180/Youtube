import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp, TrendingDown, Eye, Users, Video,
  Calendar, Shield, Wifi, WifiOff, Zap, Trophy,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { safeArray } from "@/lib/safe-data";

const PLATFORM_COLORS: Record<string, string> = {
  youtube: "#FF0000",
  twitch: "#9146FF",
  kick: "#53FC18",
  tiktok: "#EE1D52",
  x: "#1DA1F2",
  discord: "#5865F2",
};

const PLATFORM_LABELS: Record<string, string> = {
  youtube: "YouTube",
  twitch: "Twitch",
  kick: "Kick",
  tiktok: "TikTok",
  x: "X",
  discord: "Discord",
};

interface ChannelData {
  channelId: number;
  channelName: string;
  platform: string;
  connectedDate: string;
  current: { views: number; subscribers: number; videoCount: number };
  baseline: { views: number; subscribers: number; videoCount: number } | null;
  delta: { views: number; subscribers: number; viewsPct: number; subsPct: number };
  milestones: string[];
  timeline: Array<{
    date: string;
    rawDate: string;
    type: string;
    views: number;
    subscribers: number;
    videoCount: number;
    avgViewsPerVideo: number;
    optimizations: number;
  }>;
  totalSnapshots: number;
  lastOptimizations: number;
}

function formatNum(v: number): string {
  if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}K`;
  return String(v);
}

function formatDelta(v: number, pct: number): string {
  const sign = v >= 0 ? "+" : "";
  return `${sign}${formatNum(v)} (${sign}${pct}%)`;
}

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

function ChannelTimelineTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border rounded-md p-3 shadow-lg text-sm">
      <p className="font-medium text-foreground mb-2">{label}</p>
      {safeArray(payload).map((entry: any, i: number) => (
        <div key={i} className="flex items-center gap-2 py-0.5">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-medium text-foreground">{formatNum(entry.value || 0)}</span>
        </div>
      ))}
    </div>
  );
}

function ChannelCard({ channel }: { channel: ChannelData }) {
  const platformColor = PLATFORM_COLORS[channel.platform] || "hsl(258, 90%, 66%)";
  const platformLabel = PLATFORM_LABELS[channel.platform] || channel.platform;
  const daysConnected = daysSince(channel.connectedDate);
  const hasBaseline = !!channel.baseline;
  const hasTimeline = channel.timeline.length > 1;

  const timelineData = useMemo(() => {
    if (channel.timeline.length <= 1) return [];
    return channel.timeline;
  }, [channel.timeline]);

  return (
    <Card data-testid={`card-channel-${channel.channelId}`}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap pb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: platformColor }} />
          <CardTitle className="text-sm font-semibold truncate" data-testid={`text-channel-name-${channel.channelId}`}>
            {channel.channelName}
          </CardTitle>
          <Badge variant="secondary" className="text-[10px] shrink-0">
            {platformLabel}
          </Badge>
        </div>
        <div className="flex items-center gap-1.5">
          <Badge variant="secondary" className="text-[10px]" data-testid={`badge-connected-${channel.channelId}`}>
            <Wifi className="w-3 h-3 mr-0.5" />
            {daysConnected}d connected
          </Badge>
          <Badge variant="secondary" className="text-[10px]" data-testid={`badge-optimizations-${channel.channelId}`}>
            <Zap className="w-3 h-3 mr-0.5" />
            {channel.lastOptimizations} optimized
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Eye className="w-3 h-3" /> Views
            </div>
            <div className="flex items-baseline gap-2" data-testid={`stat-views-${channel.channelId}`}>
              <span className="text-sm font-semibold text-foreground">{formatNum(channel.current.views)}</span>
              {hasBaseline && channel.delta.views !== 0 && (
                <span className={`text-[10px] font-medium ${channel.delta.views > 0 ? "text-green-400" : "text-red-400"}`}>
                  {channel.delta.views > 0 ? <TrendingUp className="w-3 h-3 inline mr-0.5" /> : <TrendingDown className="w-3 h-3 inline mr-0.5" />}
                  {formatDelta(channel.delta.views, channel.delta.viewsPct)}
                </span>
              )}
            </div>
            {hasBaseline && (
              <p className="text-[10px] text-muted-foreground/70">
                Was {formatNum(channel.baseline!.views)} at connect
              </p>
            )}
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Users className="w-3 h-3" /> Subscribers
            </div>
            <div className="flex items-baseline gap-2" data-testid={`stat-subs-${channel.channelId}`}>
              <span className="text-sm font-semibold text-foreground">{formatNum(channel.current.subscribers)}</span>
              {hasBaseline && channel.delta.subscribers !== 0 && (
                <span className={`text-[10px] font-medium ${channel.delta.subscribers > 0 ? "text-green-400" : "text-red-400"}`}>
                  {channel.delta.subscribers > 0 ? <TrendingUp className="w-3 h-3 inline mr-0.5" /> : <TrendingDown className="w-3 h-3 inline mr-0.5" />}
                  {formatDelta(channel.delta.subscribers, channel.delta.subsPct)}
                </span>
              )}
            </div>
            {hasBaseline && (
              <p className="text-[10px] text-muted-foreground/70">
                Was {formatNum(channel.baseline!.subscribers)} at connect
              </p>
            )}
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Video className="w-3 h-3" /> Videos
            </div>
            <div className="flex items-baseline gap-2" data-testid={`stat-videos-${channel.channelId}`}>
              <span className="text-sm font-semibold text-foreground">{channel.current.videoCount}</span>
              {hasBaseline && channel.current.videoCount - channel.baseline!.videoCount > 0 && (
                <span className="text-[10px] font-medium text-green-400">
                  +{channel.current.videoCount - channel.baseline!.videoCount} since AI
                </span>
              )}
            </div>
          </div>
        </div>

        {channel.milestones.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap" data-testid={`milestones-${channel.channelId}`}>
            <Trophy className="w-3 h-3 text-yellow-500 shrink-0" />
            {channel.milestones.map((m, i) => (
              <Badge key={i} variant="secondary" className="text-[10px]">{m}</Badge>
            ))}
          </div>
        )}

        {hasTimeline && (
          <div className="rounded-md border border-border p-2 sm:p-3" data-testid={`chart-channel-${channel.channelId}`}>
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <div className="flex items-center gap-1 text-[10px]">
                <div className="w-2.5 h-0.5 rounded" style={{ backgroundColor: platformColor }} />
                <span className="text-muted-foreground">Views</span>
              </div>
              <div className="flex items-center gap-1 text-[10px]">
                <div className="w-2.5 h-0.5 rounded bg-green-500" />
                <span className="text-muted-foreground">Subscribers</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={140}>
              <AreaChart data={timelineData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={`grad-views-${channel.channelId}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={platformColor} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={platformColor} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id={`grad-subs-${channel.channelId}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(150, 80%, 50%)" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="hsl(150, 80%, 50%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.3} />
                <XAxis dataKey="date" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} tickFormatter={formatNum} width={45} />
                <Tooltip content={<ChannelTimelineTooltip />} />
                {timelineData.findIndex(d => d.type === "baseline") >= 0 && (
                  <ReferenceLine
                    x={timelineData.find(d => d.type === "baseline")?.date}
                    stroke="hsl(var(--muted-foreground))"
                    strokeDasharray="4 4"
                    strokeOpacity={0.5}
                    label={{ value: "AI Connected", position: "top", fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                  />
                )}
                <Area type="monotone" dataKey="views" name="Views" stroke={platformColor} strokeWidth={1.5} fill={`url(#grad-views-${channel.channelId})`} dot={false} />
                <Area type="monotone" dataKey="subscribers" name="Subscribers" stroke="hsl(150, 80%, 50%)" strokeWidth={1.5} fill={`url(#grad-subs-${channel.channelId})`} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {!hasTimeline && (
          <div className="rounded-md border border-border p-4 text-center" data-testid={`no-timeline-${channel.channelId}`}>
            <Calendar className="h-6 w-6 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">Tracking started. Growth data will appear as snapshots are recorded over time.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ChannelGrowthTimeline() {
  const { data, isLoading } = useQuery<{ channels: ChannelData[] }>({
    queryKey: ["/api/growth/channels"],
  });

  const channelsList = useMemo(() => safeArray(data?.channels) as ChannelData[], [data]);

  if (isLoading) {
    return (
      <Card data-testid="card-channel-timeline-loading">
        <CardHeader>
          <Skeleton className="h-6 w-56" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2].map(i => <Skeleton key={i} className="h-48" />)}
        </CardContent>
      </Card>
    );
  }

  if (channelsList.length === 0) {
    return (
      <Card data-testid="card-channel-timeline-empty">
        <CardHeader className="flex flex-row items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <CardTitle className="text-base font-semibold" data-testid="text-channel-timeline-title">
            Channel Performance Tracker
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <WifiOff className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No channels connected yet</p>
            <p className="text-xs text-muted-foreground/70 mt-1 max-w-xs">
              Connect your first platform to start tracking performance changes before and after AI optimization.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const totalViewsDelta = channelsList.reduce((s, c) => s + c.delta.views, 0);
  const totalSubsDelta = channelsList.reduce((s, c) => s + c.delta.subscribers, 0);
  const totalOptimizations = channelsList.reduce((s, c) => s + c.lastOptimizations, 0);

  return (
    <Card data-testid="card-channel-timeline">
      <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <CardTitle className="text-base font-semibold" data-testid="text-channel-timeline-title">
            Channel Performance Tracker
          </CardTitle>
          <Badge variant="secondary" className="text-[10px]">
            {channelsList.length} channel{channelsList.length !== 1 ? "s" : ""}
          </Badge>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {totalViewsDelta !== 0 && (
            <Badge variant="secondary" className="text-[10px]" data-testid="badge-total-views-delta">
              {totalViewsDelta > 0 ? <TrendingUp className="w-3 h-3 mr-0.5" /> : <TrendingDown className="w-3 h-3 mr-0.5" />}
              {totalViewsDelta > 0 ? "+" : ""}{formatNum(totalViewsDelta)} views since AI
            </Badge>
          )}
          {totalSubsDelta !== 0 && (
            <Badge variant="secondary" className="text-[10px]" data-testid="badge-total-subs-delta">
              {totalSubsDelta > 0 ? <TrendingUp className="w-3 h-3 mr-0.5" /> : <TrendingDown className="w-3 h-3 mr-0.5" />}
              {totalSubsDelta > 0 ? "+" : ""}{formatNum(totalSubsDelta)} subs since AI
            </Badge>
          )}
          {totalOptimizations > 0 && (
            <Badge variant="secondary" className="text-[10px]" data-testid="badge-total-optimizations">
              <Zap className="w-3 h-3 mr-0.5" />
              {totalOptimizations} optimizations
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex items-center gap-2 p-2 rounded-md bg-primary/5 border border-primary/10" data-testid="always-on-status">
          <Wifi className="w-4 h-4 text-green-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-foreground">Always-On Connection Guardian Active</p>
            <p className="text-[10px] text-muted-foreground">Tokens auto-refresh every 5 min. Autopilot runs 24/7. Disconnections self-heal automatically.</p>
          </div>
          <Badge variant="secondary" className="text-[10px] bg-green-500/10 text-green-400 shrink-0">
            Protected
          </Badge>
        </div>

        {channelsList.map(channel => (
          <ChannelCard key={channel.channelId} channel={channel} />
        ))}
      </CardContent>
    </Card>
  );
}
