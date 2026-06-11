import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest } from "@/lib/queryClient";
import {
  Eye, Clock, MousePointerClick, TrendingUp, Users, DollarSign,
  BarChart3, RefreshCw, CheckCircle, AlertCircle, Radio, ExternalLink,
  Zap, Activity,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────
interface ShadowVideo {
  id: number;
  youtubeVideoId: string;
  contentType: string;
  gameName: string | null;
  title: string | null;
  publishedAt: string | null;
  // Tier 1
  views: number;
  likes: number;
  commentCount: number;
  velocity24h: number;
  velocity7d: number;
  velocity28d: number;
  velocityPerHour: number;
  engagementRate: number;
  // Tier 2
  watchTimeMinutes: number | null;
  averageViewDurationSec: number | null;
  averageViewPercent: number | null;
  impressions: number | null;
  impressionsCtr: number | null;
  subscribersGained: number | null;
  shares: number | null;
  estimatedRevenue: number | null;
  trafficSources: Record<string, number> | null;
  // Tier 3
  verifiedViews: number | null;
  verifiedWatchTime: number | null;
  verifiedCtr: number | null;
  discrepancyPct: number | null;
  // Timestamps / scores
  publicDataAt: string | null;
  studioDataAt: string | null;
  analyticsVerifiedAt: string | null;
  performanceScore: number | null;
  momentumScore: number | null;
  measuredAt: string;
}

interface ChannelDay {
  date: string;
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  subscriberCount: number | null;
  totalWatchTimeMinutes: number | null;
  totalImpressions: number | null;
  avgCtr: number | null;
  subscribersGainedToday: number | null;
  source: string;
}

interface SourceReport {
  totalVideos: number;
  withInnerTubeData: number;
  withStudioData: number;
  withVerifiedData: number;
  studioCoverage: number;
  lastStudioAt: number | null;
  lastVerifyAt: number | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmtN = (n: number | null | undefined, dec = 0): string => {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return dec > 0 ? n.toFixed(dec) : String(Math.round(n));
};
const fmtPct  = (n: number | null | undefined): string => n == null ? "—" : `${(n * 100).toFixed(1)}%`;
const fmtMins = (n: number | null | undefined): string => {
  if (n == null) return "—";
  if (n < 60) return `${Math.round(n)}m`;
  return `${Math.floor(n / 60)}h ${Math.round(n % 60)}m`;
};
const fmtDur  = (sec: number | null | undefined): string => {
  if (sec == null) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
};

function SourceBadge({ video }: { video: ShadowVideo }) {
  if (video.analyticsVerifiedAt) {
    return (
      <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-[10px] px-1.5 py-0 h-4 gap-0.5">
        <CheckCircle className="w-2.5 h-2.5" /> Verified
      </Badge>
    );
  }
  if (video.studioDataAt) {
    return (
      <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-[10px] px-1.5 py-0 h-4 gap-0.5">
        <Radio className="w-2.5 h-2.5" /> Studio
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 gap-0.5 text-muted-foreground">
      <Activity className="w-2.5 h-2.5" /> InnerTube
    </Badge>
  );
}

function MetricCell({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold tabular-nums">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function ShadowAnalytics() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"videos" | "channel" | "sources">("videos");

  const { data: videosData, isLoading: loadingVideos } = useQuery<{ videos: ShadowVideo[]; count: number }>({
    queryKey: ["/api/youtube/shadow-analytics/videos"],
    refetchInterval: 15 * 60_000,
  });

  const { data: channelData, isLoading: loadingChannel } = useQuery<{ days: ChannelDay[]; count: number }>({
    queryKey: ["/api/youtube/shadow-analytics/channel", { days: 30 }],
    refetchInterval: 15 * 60_000,
  });

  const { data: sourceData } = useQuery<SourceReport>({
    queryKey: ["/api/youtube/shadow-analytics/sources"],
    refetchInterval: 5 * 60_000,
  });

  const runSweep = useMutation({
    mutationFn: () => apiRequest("POST", "/api/youtube/shadow-analytics/run", {}),
    onSuccess: () => {
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ["/api/youtube/shadow-analytics/videos"] });
        qc.invalidateQueries({ queryKey: ["/api/youtube/shadow-analytics/channel"] });
        qc.invalidateQueries({ queryKey: ["/api/youtube/shadow-analytics/sources"] });
      }, 3000);
    },
  });

  const videos = videosData?.videos ?? [];
  const days   = channelData?.days ?? [];

  // Channel-level totals from most recent day
  const latestDay = days[0];
  const withStudio = videos.filter(v => v.studioDataAt).length;
  const verified   = videos.filter(v => v.analyticsVerifiedAt).length;

  return (
    <Card className="bg-card border-border" data-testid="card-shadow-analytics">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base font-semibold text-foreground">
              Shadow Analytics
            </CardTitle>
            <Badge variant="outline" className="text-xs text-muted-foreground">
              No quota used
            </Badge>
            {sourceData && (
              <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-xs">
                {sourceData.studioCoverage}% Studio coverage
              </Badge>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => runSweep.mutate()}
            disabled={runSweep.isPending}
            data-testid="button-run-sweep"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${runSweep.isPending ? "animate-spin" : ""}`} />
            {runSweep.isPending ? "Sweeping…" : "Sweep now"}
          </Button>
        </div>

        {/* Source legend */}
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Activity className="w-3 h-3" /> InnerTube — views, likes, velocity (no auth)
          </span>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Radio className="w-3 h-3 text-blue-400" /> Studio API — watch time, CTR, impressions (OAuth, zero quota)
          </span>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <CheckCircle className="w-3 h-3 text-green-400" /> Verified — confirmed by official Analytics API
          </span>
        </div>

        {/* Channel summary row */}
        {latestDay && (
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-3 mt-3 p-3 rounded-lg bg-muted/20 border border-border/40">
            <MetricCell label="Total views" value={fmtN(latestDay.totalViews)} />
            <MetricCell label="Subscribers" value={latestDay.subscriberCount ? fmtN(latestDay.subscriberCount) : "—"} />
            <MetricCell label="Watch time" value={fmtMins(latestDay.totalWatchTimeMinutes)} sub="all videos" />
            <MetricCell label="Impressions" value={fmtN(latestDay.totalImpressions)} />
            <MetricCell label="Avg CTR" value={fmtPct(latestDay.avgCtr)} />
            <MetricCell label="Subs gained" value={fmtN(latestDay.subscribersGainedToday)} sub="today" />
            <MetricCell
              label="Data source"
              value={latestDay.source === "studio_api" ? "Studio" : latestDay.source === "verified" ? "Verified" : "InnerTube"}
              sub={new Date(latestDay.date).toLocaleDateString()}
            />
          </div>
        )}
      </CardHeader>

      <CardContent className="pt-0">
        <Tabs value={tab} onValueChange={v => setTab(v as any)}>
          <TabsList className="h-8 mb-3">
            <TabsTrigger value="videos" className="text-xs h-7" data-testid="tab-videos">
              Videos ({videos.length})
            </TabsTrigger>
            <TabsTrigger value="channel" className="text-xs h-7" data-testid="tab-channel">
              Channel trend
            </TabsTrigger>
            <TabsTrigger value="sources" className="text-xs h-7" data-testid="tab-sources">
              Data sources
            </TabsTrigger>
          </TabsList>

          {/* ── Per-video leaderboard ─────────────────────────────────────── */}
          <TabsContent value="videos" className="mt-0">
            {loadingVideos ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="h-16 rounded-lg bg-muted/30 animate-pulse" />
                ))}
              </div>
            ) : videos.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground" data-testid="state-no-shadow-videos">
                <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No analytics data yet.</p>
                <p className="text-xs mt-1">
                  The engine collects data automatically from published videos.<br />
                  Click "Sweep now" to trigger an immediate scan.
                </p>
              </div>
            ) : (
              <div className="space-y-1.5" data-testid="list-shadow-videos">
                {/* Header */}
                <div className="grid grid-cols-[1.5rem_1fr_5rem_5rem_5rem_5rem_5rem_5rem_2.5rem] gap-2 px-2 pb-1 border-b border-border/30">
                  {["#", "Video", "Views", "24h Δ", "Watch time", "Avg dur.", "CTR", "Score", ""].map((h, i) => (
                    <span key={i} className="text-[10px] text-muted-foreground font-medium text-center first:text-left">
                      {h}
                    </span>
                  ))}
                </div>

                {videos.map((v, idx) => (
                  <div
                    key={v.youtubeVideoId}
                    className="grid grid-cols-[1.5rem_1fr_5rem_5rem_5rem_5rem_5rem_5rem_2.5rem] gap-2 items-center px-2 py-2 rounded-lg hover:bg-muted/20 transition-colors"
                    data-testid={`row-shadow-${v.youtubeVideoId}`}
                  >
                    {/* Rank */}
                    <span className="text-xs text-muted-foreground">{idx + 1}</span>

                    {/* Title + badges */}
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate" data-testid={`text-shadow-title-${v.youtubeVideoId}`}>
                        {v.title ?? v.youtubeVideoId}
                      </p>
                      <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                        <Badge variant="outline" className="text-[10px] px-1 py-0 h-3.5">
                          {v.contentType === "short" ? "Short" : "VOD"}
                        </Badge>
                        {v.gameName && (
                          <span className="text-[10px] text-muted-foreground">{v.gameName}</span>
                        )}
                        <SourceBadge video={v} />
                        {v.discrepancyPct != null && v.discrepancyPct > 5 && (
                          <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-[10px] px-1 py-0 h-3.5">
                            <AlertCircle className="w-2.5 h-2.5 mr-0.5" />
                            {v.discrepancyPct.toFixed(0)}% drift
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Views */}
                    <div className="text-center">
                      <p className="text-xs font-semibold tabular-nums" data-testid={`text-views-${v.youtubeVideoId}`}>
                        {fmtN(v.views)}
                      </p>
                      <p className="text-[10px] text-emerald-400 tabular-nums">
                        {v.engagementRate > 0 ? `${(v.engagementRate * 100).toFixed(1)}% eng.` : ""}
                      </p>
                    </div>

                    {/* 24h velocity */}
                    <div className="text-center">
                      <p className="text-xs tabular-nums font-medium">
                        {v.velocity24h > 0 ? `+${fmtN(v.velocity24h)}` : "—"}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {v.velocityPerHour >= 1 ? `${v.velocityPerHour.toFixed(1)}/hr` : ""}
                      </p>
                    </div>

                    {/* Watch time */}
                    <div className="text-center">
                      <p className="text-xs tabular-nums">{fmtMins(v.watchTimeMinutes)}</p>
                    </div>

                    {/* Avg duration */}
                    <div className="text-center">
                      <p className="text-xs tabular-nums">{fmtDur(v.averageViewDurationSec)}</p>
                      {v.averageViewPercent != null && (
                        <p className="text-[10px] text-muted-foreground">{v.averageViewPercent.toFixed(0)}%</p>
                      )}
                    </div>

                    {/* CTR */}
                    <div className="text-center">
                      <p className="text-xs tabular-nums">
                        {v.impressionsCtr != null ? fmtPct(v.impressionsCtr / 100) : "—"}
                      </p>
                      {v.impressions != null && (
                        <p className="text-[10px] text-muted-foreground">{fmtN(v.impressions)} impr.</p>
                      )}
                    </div>

                    {/* Performance score */}
                    <div className="text-center">
                      {v.performanceScore != null ? (
                        <div
                          className={`text-xs font-bold tabular-nums ${
                            v.performanceScore >= 70 ? "text-emerald-400"
                            : v.performanceScore >= 40 ? "text-yellow-400"
                            : "text-muted-foreground"
                          }`}
                          data-testid={`text-score-${v.youtubeVideoId}`}
                        >
                          {Math.round(v.performanceScore)}
                        </div>
                      ) : <span className="text-muted-foreground text-xs">—</span>}
                    </div>

                    {/* Open link */}
                    <div className="flex justify-center">
                      <a
                        href={v.contentType === "short"
                          ? `https://youtube.com/shorts/${v.youtubeVideoId}`
                          : `https://youtube.com/watch?v=${v.youtubeVideoId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground"
                        data-testid={`link-shadow-${v.youtubeVideoId}`}
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── Channel trend ────────────────────────────────────────────── */}
          <TabsContent value="channel" className="mt-0">
            {loadingChannel ? (
              <div className="h-40 bg-muted/30 rounded-lg animate-pulse" />
            ) : days.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground" data-testid="state-no-channel-data">
                <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No channel history yet.</p>
                <p className="text-xs mt-1">Data accumulates with each sweep.</p>
              </div>
            ) : (
              <div className="space-y-1" data-testid="list-channel-days">
                <div className="grid grid-cols-[4rem_1fr_1fr_1fr_1fr_1fr_4rem] gap-2 px-2 pb-1 border-b border-border/30 text-[10px] text-muted-foreground font-medium">
                  <span>Date</span>
                  <span className="text-center">Views</span>
                  <span className="text-center">Watch time</span>
                  <span className="text-center">Impressions</span>
                  <span className="text-center">CTR</span>
                  <span className="text-center">Subs ±</span>
                  <span className="text-center">Source</span>
                </div>
                {days.map(d => (
                  <div
                    key={d.date}
                    className="grid grid-cols-[4rem_1fr_1fr_1fr_1fr_1fr_4rem] gap-2 px-2 py-1.5 rounded hover:bg-muted/20 items-center"
                    data-testid={`row-channel-day-${d.date}`}
                  >
                    <span className="text-[10px] text-muted-foreground font-mono">{d.date.slice(5)}</span>
                    <span className="text-xs tabular-nums text-center font-medium">{fmtN(d.totalViews)}</span>
                    <span className="text-xs tabular-nums text-center">{fmtMins(d.totalWatchTimeMinutes)}</span>
                    <span className="text-xs tabular-nums text-center">{fmtN(d.totalImpressions)}</span>
                    <span className="text-xs tabular-nums text-center">{fmtPct(d.avgCtr)}</span>
                    <span className={`text-xs tabular-nums text-center ${(d.subscribersGainedToday ?? 0) > 0 ? "text-emerald-400" : ""}`}>
                      {d.subscribersGainedToday != null ? (d.subscribersGainedToday >= 0 ? `+${d.subscribersGainedToday}` : String(d.subscribersGainedToday)) : "—"}
                    </span>
                    <span className="text-[10px] text-muted-foreground text-center">
                      {d.source === "studio_api" ? "Studio" : d.source === "verified" ? "✓" : "IT"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── Data source report ────────────────────────────────────────── */}
          <TabsContent value="sources" className="mt-0">
            {sourceData ? (
              <div className="space-y-4" data-testid="panel-sources">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { icon: Eye, label: "Total tracked", value: sourceData.totalVideos, color: "" },
                    { icon: Activity, label: "InnerTube data", value: sourceData.withInnerTubeData, color: "text-foreground" },
                    { icon: Radio, label: "Studio data", value: sourceData.withStudioData, color: "text-blue-400" },
                    { icon: CheckCircle, label: "Verified", value: sourceData.withVerifiedData, color: "text-green-400" },
                  ].map(({ icon: Icon, label, value, color }) => (
                    <div key={label} className="text-center p-3 rounded-lg bg-muted/20 border border-border/30">
                      <Icon className={`w-5 h-5 mx-auto mb-1 ${color || "text-muted-foreground"}`} />
                      <p className={`text-xl font-bold ${color}`}>{value}</p>
                      <p className="text-xs text-muted-foreground">{label}</p>
                    </div>
                  ))}
                </div>

                {/* Studio coverage bar */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Studio API coverage</span>
                    <span className="font-semibold text-blue-400">{sourceData.studioCoverage}%</span>
                  </div>
                  <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all"
                      style={{ width: `${sourceData.studioCoverage}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Studio API provides watch time, impressions, CTR, avg view duration, subscribers gained, and revenue
                    — all without touching the 10K/day Data API quota.
                  </p>
                </div>

                {/* Tier explanations */}
                <div className="space-y-2">
                  {[
                    {
                      icon: Activity,
                      color:  "text-foreground",
                      bgColor:"bg-muted/20",
                      tier:   "Tier 1 — InnerTube (always available)",
                      desc:   "Views, likes, comment count, subscriber count. No authentication. Updates every 4h. Same data YouTube shows publicly.",
                    },
                    {
                      icon: Radio,
                      color:  "text-blue-400",
                      bgColor:"bg-blue-500/5",
                      tier:   "Tier 2 — YouTube Studio API (OAuth, zero Data API quota)",
                      desc:   "Watch time, average view duration, average view %, impressions, CTR, subscribers gained, shares, estimated revenue, traffic source breakdown. Uses your stored OAuth token but does NOT consume any of the 10,000 unit/day Data API quota. Updates every 6h.",
                    },
                    {
                      icon: CheckCircle,
                      color:  "text-green-400",
                      bgColor:"bg-green-500/5",
                      tier:   "Tier 3 — Official Analytics API (verification only)",
                      desc:   "Cross-checks Tier 1 & 2 numbers against the official YouTube Analytics API. Only fires for top 5 gaining-steam videos, maximum once per 12h, and only when the quota breaker is not tripped. Shows discrepancy % so you can see how accurate the shadow data is.",
                    },
                  ].map(({ icon: Icon, color, bgColor, tier, desc }) => (
                    <div key={tier} className={`p-3 rounded-lg border border-border/30 ${bgColor}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <Icon className={`w-3.5 h-3.5 ${color}`} />
                        <span className="text-xs font-semibold">{tier}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{desc}</p>
                    </div>
                  ))}
                </div>

                {/* Last run timestamps */}
                <div className="flex gap-4 flex-wrap text-xs text-muted-foreground">
                  {sourceData.lastStudioAt && (
                    <span>
                      Last Studio sweep: {new Date(sourceData.lastStudioAt).toLocaleTimeString()}
                    </span>
                  )}
                  {sourceData.lastVerifyAt && (
                    <span>
                      Last verified: {new Date(sourceData.lastVerifyAt).toLocaleTimeString()}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="h-20 bg-muted/30 rounded-lg animate-pulse" />
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
