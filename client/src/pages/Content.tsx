import { useState, useMemo, Suspense } from "react";
import { useParams, useLocation } from "wouter";
import { useTabMemory } from "@/hooks/use-tab-memory";
import { useVideos } from "@/hooks/use-videos";
import { usePageTitle } from "@/hooks/use-page-title";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/EmptyState";
import { QueryErrorReset } from "@/components/QueryErrorReset";
import { useTranslation } from "react-i18next";
import {
  Search, Video, Radio, CheckCircle2, ExternalLink,
  Calendar as CalendarIcon, Eye, Loader2,
  TrendingUp, Film, Zap, BarChart2, CheckSquare, X,
  Sparkles, Shield, Monitor, RefreshCw, Download, Globe, Layers,
  MessageCircle, Pin, Kanban,
} from "lucide-react";
import { format } from "date-fns";
import { CopyButton } from "@/components/CopyButton";
import { LiveTimestamp } from "@/components/LiveTimestamp";
import { lazyRetry } from "@/lib/lazyRetry";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useChannels } from "@/hooks/use-channels";
import { SiYoutube } from "react-icons/si";

type ContentTab = "library" | "catalogs" | "updated" | "channels" | "calendar" | "intelligence" | "revenue" | "cta" | "pipeline";

const UpdatedVideosTab = lazyRetry(() => import("./content/UpdatedVideosTab"));
const ChannelsTab = lazyRetry(() => import("./content/ChannelsTab"));
const CalendarTab = lazyRetry(() => import("./content/CalendarTab"));
const ContentIntelligenceTab = lazyRetry(() => import("./content/ContentIntelligenceTab"));
const ContentRevenueTab = lazyRetry(() => import("./content/ContentRevenueTab"));
const CTAPlannerTab = lazyRetry(() => import("./content/CTAPlannerTab"));
const ProductionPipelineTab = lazyRetry(() => import("./content/PipelineTab"));

function VideoThumbnail({ url, className }: { url: string | null | undefined; className: string }) {
  const [broken, setBroken] = useState(false);
  const iconSize = className.includes("h-10") ? "h-4 w-4" : "h-3.5 w-3.5";
  if (!url || broken) {
    return (
      <div className={`${className} bg-muted flex items-center justify-center shrink-0`}>
        <Video className={`${iconSize} text-muted-foreground`} />
      </div>
    );
  }
  return (
    <img
      src={url}
      alt=""
      className={`${className} object-cover shrink-0`}
      onError={() => setBroken(true)}
    />
  );
}

function ContentStatsStrip() {
  const { data: videos, isLoading } = useVideos();
  const stats = useMemo(() => {
    if (!videos) return null;
    const vods = videos.filter(v => v.type === "vod" || v.type === "video" || v.type === "long" || v.type === "stream_vod" || v.type === "live_replay" || v.type === "regular_upload").length;
    const shorts = videos.filter(v => v.type === "short").length;
    const published = videos.filter(v => v.status === "published").length;
    const totalViews = videos.reduce((sum, v) => sum + (Number(v.metadata?.viewCount) || 0), 0);
    return { total: videos.length, vods, shorts, published, totalViews };
  }, [videos]);

  if (isLoading) return <Skeleton className="h-12 w-full rounded-xl mb-4" />;
  if (!stats) return null;
  const items = [
    { icon: Film, label: "Total Videos", value: stats.total.toLocaleString(), color: "text-primary" },
    { icon: Video, label: "VODs", value: stats.vods.toLocaleString(), color: "text-blue-400" },
    { icon: Zap, label: "Shorts", value: stats.shorts.toLocaleString(), color: "text-purple-400" },
    { icon: CheckCircle2, label: "Published", value: stats.published.toLocaleString(), color: "text-emerald-400" },
    { icon: Eye, label: "Est. Views", value: stats.totalViews > 1000 ? `${(stats.totalViews/1000).toFixed(1)}K` : stats.totalViews.toLocaleString(), color: "text-amber-400" },
  ];
  return (
    <div className="card-empire rounded-xl px-4 py-3 flex flex-wrap gap-4 items-center relative overflow-hidden mb-4" data-testid="content-stats-strip">
      <div className="data-grid-bg absolute inset-0 opacity-5 pointer-events-none" />
      <div className="flex items-center gap-2 shrink-0 relative">
        <BarChart2 className="h-4 w-4 text-primary" />
        <span className="holographic-text text-xs font-bold uppercase tracking-wider">Content Vault</span>
      </div>
      <div className="w-px h-6 bg-border/30 hidden sm:block" />
      <div className="flex flex-wrap gap-4 relative">
        {items.map(({ icon: Icon, label, value, color }) => (
          <div key={label} className="flex items-center gap-2" data-testid={`stat-content-${label.toLowerCase().replace(/\s+/g, '-')}`}>
            <Icon className={`h-3.5 w-3.5 ${color}`} />
            <div>
              <div className={`text-sm font-bold metric-display ${color}`}>{value}</div>
              <div className="text-[10px] text-muted-foreground leading-none">{label}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="ml-auto shrink-0 relative flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
        <span className="text-[10px] text-emerald-400 font-mono uppercase tracking-tighter">AI Organizing</span>
      </div>
    </div>
  );
}

export default function Content() {
  usePageTitle("Content");
  const params = useParams<{ tab?: string }>();
  const tabParam = params?.tab;
  const validTabs: ContentTab[] = ["library", "catalogs", "updated", "channels", "calendar", "intelligence", "revenue", "cta", "pipeline"];
  const initialTab = validTabs.includes(tabParam as ContentTab) ? (tabParam as ContentTab) : "library";
  const [activeTab, setActiveTab] = useTabMemory("content", initialTab, validTabs);
  const { t } = useTranslation();

  return (
    <div className="p-3 lg:p-4 space-y-3 max-w-6xl mx-auto page-enter">
      <div>
        <h1 data-testid="text-page-title" className="text-xl font-display font-bold">{t("content.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("content.subtitle", "Manage your videos and channels")}</p>
      </div>

      <ContentStatsStrip />

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ContentTab)}>
        <div className="scrollable-tabs">
          <TabsList data-testid="tabs-content" className="w-auto inline-flex">
            <TabsTrigger value="library" data-testid="tab-library" aria-label="Video library tab">
              <Video className="h-3.5 w-3.5 mr-1.5" />{t("content.library")}
            </TabsTrigger>
            <TabsTrigger value="catalogs" data-testid="tab-catalogs" aria-label="Platform catalogs tab">
              <Layers className="h-3.5 w-3.5 mr-1.5" />Catalogs
            </TabsTrigger>
            <TabsTrigger value="updated" data-testid="tab-updated" aria-label="Updated videos tab">
              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />Updated
            </TabsTrigger>
            <TabsTrigger value="channels" data-testid="tab-channels" aria-label="Channels tab">
              <Radio className="h-3.5 w-3.5 mr-1.5" />{t("content.channels")}
            </TabsTrigger>
            <TabsTrigger value="calendar" data-testid="tab-calendar" aria-label="Content calendar tab">
              <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />Calendar
            </TabsTrigger>
            <TabsTrigger value="intelligence" data-testid="tab-intelligence" aria-label="Content intelligence tab">
              <Shield className="h-3.5 w-3.5 mr-1.5" />Intelligence
            </TabsTrigger>
            <TabsTrigger value="revenue" data-testid="tab-revenue" aria-label="Revenue attribution tab">
              <BarChart2 className="h-3.5 w-3.5 mr-1.5" />Revenue
            </TabsTrigger>
            <TabsTrigger value="cta" data-testid="tab-cta" aria-label="CTA planner tab">
              <Sparkles className="h-3.5 w-3.5 mr-1.5" />CTAs
            </TabsTrigger>
            <TabsTrigger value="pipeline" data-testid="tab-pipeline" aria-label="Production pipeline tab">
              <Kanban className="h-3.5 w-3.5 mr-1.5" />Pipeline
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="library" className="mt-2">
          <LibraryTab />
        </TabsContent>
        <TabsContent value="catalogs" className="mt-2">
          <PlatformCatalogsTab />
        </TabsContent>
        <TabsContent value="updated" className="mt-2">
          <Suspense fallback={<Skeleton className="h-64 w-full" />}>
            <UpdatedVideosTab />
          </Suspense>
        </TabsContent>
        <TabsContent value="channels" className="mt-2">
          <Suspense fallback={<Skeleton className="h-64 w-full" />}>
            <ChannelsTab />
          </Suspense>
        </TabsContent>
        <TabsContent value="calendar" className="mt-2">
          <Suspense fallback={<Skeleton className="h-64 w-full" />}>
            <CalendarTab />
          </Suspense>
        </TabsContent>
        <TabsContent value="intelligence" className="mt-2">
          <Suspense fallback={<Skeleton className="h-64 w-full" />}>
            <ContentIntelligenceTab />
          </Suspense>
        </TabsContent>
        <TabsContent value="revenue" className="mt-2">
          <Suspense fallback={<Skeleton className="h-64 w-full" />}>
            <ContentRevenueTab />
          </Suspense>
        </TabsContent>
        <TabsContent value="cta" className="mt-2">
          <Suspense fallback={<Skeleton className="h-64 w-full" />}>
            <CTAPlannerTab />
          </Suspense>
        </TabsContent>
        <TabsContent value="pipeline" className="mt-2">
          <Suspense fallback={<Skeleton className="h-64 w-full" />}>
            <ProductionPipelineTab />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}

const TYPE_LABEL: Record<string, string> = { vod: "VOD", video: "VOD", long: "VOD", stream_vod: "VOD", live_replay: "VOD", regular_upload: "VOD", short: "Short" };
const isVodType = (t: string) => t === "vod" || t === "video" || t === "long" || t === "stream_vod" || t === "live_replay" || t === "regular_upload";

function BeatMapButton({ videoId }: { videoId: number }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/content", videoId, "beat-map"],
    queryFn: () => fetch(`/api/content/${videoId}/beat-map`).then(r => r.json()),
    enabled: open,
  });

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        aria-label="View retention beat map"
        data-testid={`button-beatmap-${videoId}`}
      >
        <BarChart2 className="h-3.5 w-3.5" />
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setOpen(false)}>
          <div className="bg-card border rounded-xl p-5 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()} data-testid={`dialog-beatmap-${videoId}`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <BarChart2 className="h-4 w-4 text-primary" />
                Retention Beat Map
              </h3>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setOpen(false)} data-testid="button-close-beatmap">
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            {isLoading ? <Skeleton className="h-32 w-full" /> : data?.analysis ? (
              <div className="space-y-3">
                {data.title && <p className="text-xs text-muted-foreground">{data.title}</p>}
                <div className="flex items-center gap-2 text-xs">
                  <Badge variant="outline">{data.videoType}</Badge>
                  <span className="text-muted-foreground">{Math.round((data.durationSec || 0) / 60)}min</span>
                </div>
                {data.analysis.retentionCurve && (
                  <div className="flex items-end gap-0.5 h-16" data-testid="chart-retention-curve">
                    {data.analysis.retentionCurve.map((val: number, i: number) => (
                      <div key={i} className="flex-1 rounded-t-sm bg-primary/60 min-h-[2px]" style={{ height: `${Math.max(5, val * 100)}%` }} title={`Segment ${i + 1}: ${Math.round(val * 100)}%`} />
                    ))}
                  </div>
                )}
                {data.analysis.insights?.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium">Insights</p>
                    {data.analysis.insights.map((insight: string, i: number) => (
                      <p key={i} className="text-xs text-muted-foreground" data-testid={`text-insight-${i}`}>{insight}</p>
                    ))}
                  </div>
                )}
                {data.analysis.recommendations?.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium">Recommendations</p>
                    {data.analysis.recommendations.map((rec: string, i: number) => (
                      <p key={i} className="text-xs text-muted-foreground" data-testid={`text-recommendation-${i}`}>{rec}</p>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">No beat map data available for this video.</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function OfferRecButton({ videoId }: { videoId: number }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery<{ recommendations: any[] }>({
    queryKey: ["/api/content", videoId, "offer-recommendations"],
    queryFn: () => fetch(`/api/content/${videoId}/offer-recommendations`).then(r => r.json()),
    enabled: open,
  });
  const { toast } = useToast();
  const genMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/content/${videoId}/offer-recommendation`, { signals: {} });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Offer recommendation generated" });
      queryClient.invalidateQueries({ queryKey: ["/api/content", videoId, "offer-recommendations"] });
    },
  });

  return (
    <>
      <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setOpen(true); }} aria-label="Offer recommendations" data-testid={`button-offers-${videoId}`}>
        <Sparkles className="h-3.5 w-3.5" />
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setOpen(false)}>
          <div className="bg-card border rounded-xl p-5 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()} data-testid={`dialog-offers-${videoId}`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-400" />
                Offer Recommendations
              </h3>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setOpen(false)} data-testid="button-close-offers">
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            <Button variant="outline" size="sm" className="mb-3" onClick={() => genMutation.mutate()} disabled={genMutation.isPending} data-testid="button-generate-offer">
              {genMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
              Generate Recommendation
            </Button>
            {isLoading ? <Skeleton className="h-20 w-full" /> : data?.recommendations?.length ? (
              <div className="space-y-2">
                {data.recommendations.map((r: any, i: number) => (
                  <div key={r.id || i} className="p-2.5 rounded-lg bg-muted/30" data-testid={`offer-rec-${i}`}>
                    <p className="text-sm font-medium">{r.offerType || "Offer"}</p>
                    <p className="text-xs text-muted-foreground mt-1">{r.rationale || r.description || "AI-generated recommendation"}</p>
                    {r.suggestedPrice && <p className="text-xs text-emerald-400 mt-1">${r.suggestedPrice}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">No recommendations yet. Click generate above.</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function StudioButton({ videoId }: { videoId: number }) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const importMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/studio/videos/import", { videoId });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Imported to Studio" });
      navigate("/studio");
    },
    onError: (err: Error) => {
      toast({ title: "Import Failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={(e) => { e.stopPropagation(); importMutation.mutate(); }}
      disabled={importMutation.isPending}
      aria-label="Open in Studio"
      data-testid={`button-studio-${videoId}`}
    >
      {importMutation.isPending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Film className="h-3.5 w-3.5" />
      )}
    </Button>
  );
}

function YouTubeImportSection() {
  const { data: channels } = useChannels();
  const { toast } = useToast();

  const ytChannels = (channels || []).filter((c: any) => c.platform === "youtube" && c.accessToken);

  const syncMutation = useMutation({
    mutationFn: async (channelId: number) => {
      const res = await apiRequest("POST", `/api/youtube/sync/${channelId}`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/videos"] });
      queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
      toast({ title: "YouTube Import Complete", description: `${data.synced || 0} videos imported from YouTube.` });
    },
    onError: (error: any) => {
      const msg = error.message || "";
      if (msg.includes("quota") || msg.includes("429")) {
        toast({ title: "YouTube API quota reached", description: "Your quota resets daily. Try again in a few hours.", variant: "destructive" });
      } else {
        toast({ title: "Import failed", description: msg, variant: "destructive" });
      }
    },
  });

  const connectYouTube = () => {
    window.location.href = "/api/youtube/reconnect";
  };

  if (ytChannels.length === 0) {
    return (
      <Card className="border-dashed" data-testid="card-youtube-connect">
        <CardContent className="py-8 text-center space-y-4">
          <div className="mx-auto h-12 w-12 rounded-full bg-red-500/10 flex items-center justify-center">
            <SiYoutube className="h-6 w-6 text-red-500" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">Connect Your YouTube Channel</h3>
            <p className="text-xs text-muted-foreground mt-1">Sign in with Google to import all your videos, stats, and metadata automatically.</p>
          </div>
          <Button onClick={connectYouTube} className="bg-red-600 hover:bg-red-700 text-white" data-testid="button-connect-youtube">
            <SiYoutube className="h-4 w-4 mr-2" />
            Connect YouTube
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-dashed" data-testid="card-youtube-import">
      <CardContent className="py-6 text-center space-y-3">
        <div className="mx-auto h-10 w-10 rounded-full bg-red-500/10 flex items-center justify-center">
          <SiYoutube className="h-5 w-5 text-red-500" />
        </div>
        <div>
          <h3 className="text-sm font-semibold">Import YouTube Videos</h3>
          <p className="text-xs text-muted-foreground mt-1">Pull your latest videos, shorts, and VODs into CreatorOS.</p>
        </div>
        <div className="flex items-center justify-center gap-2 flex-wrap">
          {ytChannels.map((ch: any) => (
            <Button
              key={ch.id}
              onClick={() => syncMutation.mutate(ch.id)}
              disabled={syncMutation.isPending}
              variant="default"
              data-testid={`button-import-youtube-${ch.id}`}
            >
              {syncMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              {syncMutation.isPending ? "Importing..." : `Import from ${ch.channelName || "YouTube"}`}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

const PLATFORM_ICONS: Record<string, any> = {
  youtube: SiYoutube,
};
const PLATFORM_COLORS: Record<string, string> = {
  youtube: "text-red-500",
};
const PLATFORM_NAMES: Record<string, string> = {
  youtube: "YouTube",
};

function PlatformCatalogsTab() {
  const [activePlatform, setActivePlatform] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const { toast } = useToast();

  const { data: summary, isLoading: summaryLoading } = useQuery<any>({
    queryKey: ["/api/catalog/summary"],
    staleTime: 2 * 60_000,
  });

  const { data: catalogVideos, isLoading: videosLoading } = useQuery<any[]>({
    queryKey: ["/api/catalog/videos", activePlatform === "all" ? undefined : activePlatform],
    queryFn: () => {
      const url = activePlatform === "all" ? "/api/catalog/videos" : `/api/catalog/videos?platform=${activePlatform}`;
      return fetch(url, { credentials: "include" }).then(r => r.json());
    },
    staleTime: 2 * 60_000,
  });

  const syncMutation = useMutation({
    mutationFn: async (platform?: string) => {
      const url = platform ? "/api/catalog/sync" : "/api/catalog/sync-all";
      const body = platform ? { platform } : {};
      const res = await apiRequest("POST", url, body);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/catalog/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/catalog/videos"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
      if (data.results) {
        const results = data.results as Record<string, any>;
        const totalNew = Object.values(results).reduce((s: number, r: any) => s + (r.newLinks || 0), 0);
        const totalUpdated = Object.values(results).reduce((s: number, r: any) => s + (r.updated || 0), 0);
        const totalErrors = Object.values(results).reduce((s: number, r: any) => s + (r.errors || 0), 0);
        const totalFound = Object.values(results).reduce((s: number, r: any) => s + (r.total || 0), 0);
        const platformResults = Object.entries(results).filter(([, r]) => (r as any).total > 0).map(([p, r]) => `${p}: ${(r as any).total}`).join(", ");
        const desc = totalFound > 0
          ? `Found ${totalFound} videos (${totalNew} new, ${totalUpdated} updated).${platformResults ? ` ${platformResults}` : ""}${totalErrors > 0 ? ` ${totalErrors} errors.` : ""}`
          : `No new videos found. This may be due to API quota limits — try again later.`;
        toast({ title: totalFound > 0 ? "Catalog Synced" : "Sync Complete", description: desc, variant: totalFound > 0 ? "default" : undefined });
      } else {
        toast({ title: "Sync Complete", description: `${data.newLinks || 0} new videos discovered.` });
      }
    },
    onError: (err: Error) => {
      toast({ title: "Sync Failed", description: err.message, variant: "destructive" });
    },
  });

  const filtered = useMemo(() => {
    if (!catalogVideos || !Array.isArray(catalogVideos)) return [];
    if (!searchQuery.trim()) return catalogVideos;
    const q = searchQuery.toLowerCase();
    return catalogVideos.filter((v: any) => v.title?.toLowerCase().includes(q));
  }, [catalogVideos, searchQuery]);

  const platforms = summary?.platforms || [];

  return (
    <div className="space-y-4 pb-20">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2" data-testid="text-catalogs-title">
            <Layers className="h-4 w-4 text-primary" />
            Platform Catalogs
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Real video data synced from each connected platform
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => syncMutation.mutate(undefined)}
          disabled={syncMutation.isPending}
          data-testid="button-sync-all-catalogs"
        >
          {syncMutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          )}
          {syncMutation.isPending ? "Syncing..." : "Sync All Platforms"}
        </Button>
      </div>

      {summaryLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card
            className={`cursor-pointer transition-colors ${activePlatform === "all" ? "border-primary/50 bg-primary/5" : "hover:border-border/80"}`}
            onClick={() => setActivePlatform("all")}
            data-testid="card-platform-all"
          >
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-2">
                <Globe className="h-4 w-4 text-primary" />
                <span className="text-xs font-semibold">All Platforms</span>
              </div>
              <div className="text-lg font-bold metric-display">{summary?.totalVideos || 0}</div>
              <div className="text-[10px] text-muted-foreground">
                {(summary?.totalViews || 0).toLocaleString()} total views
              </div>
            </CardContent>
          </Card>
          {(["youtube"] as const).map(p => {
            const pData = platforms.find((pl: any) => pl.platform === p);
            const Icon = PLATFORM_ICONS[p] || Globe;
            const color = PLATFORM_COLORS[p] || "text-muted-foreground";
            return (
              <Card
                key={p}
                className={`cursor-pointer transition-colors ${activePlatform === p ? "border-primary/50 bg-primary/5" : "hover:border-border/80"}`}
                onClick={() => setActivePlatform(p)}
                data-testid={`card-platform-${p}`}
              >
                <CardContent className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Icon className={`h-4 w-4 ${color}`} />
                      <span className="text-xs font-semibold">{PLATFORM_NAMES[p]}</span>
                    </div>
                    {pData?.lastSynced && (
                      <span className="text-[9px] text-muted-foreground">
                        {new Date(pData.lastSynced).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <div className="text-lg font-bold metric-display">{pData?.videoCount || 0}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {(pData?.totalViews || 0).toLocaleString()} views
                  </div>
                  {pData?.types && Object.keys(pData.types).length > 0 && (
                    <div className="flex gap-1 mt-1.5 flex-wrap">
                      {Object.entries(pData.types).map(([type, count]) => (
                        <Badge key={type} variant="secondary" className="text-[9px] h-4 px-1">
                          {type}: {String(count)}
                        </Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder={`Search ${activePlatform === "all" ? "all" : PLATFORM_NAMES[activePlatform]} videos...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8"
            data-testid="input-search-catalog"
          />
        </div>
        {activePlatform !== "all" && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => syncMutation.mutate(activePlatform)}
            disabled={syncMutation.isPending}
            data-testid={`button-sync-${activePlatform}`}
          >
            {syncMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
            Sync {PLATFORM_NAMES[activePlatform]}
          </Button>
        )}
      </div>

      {videosLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Layers}
          type="content"
          title={activePlatform === "all" ? "No catalog data yet" : `No ${PLATFORM_NAMES[activePlatform]} videos found`}
          description="Click 'Sync All Platforms' to pull your video catalog from each connected platform."
        />
      ) : (
        <div className="space-y-1.5">
          {filtered.map((video: any) => {
            const PIcon = PLATFORM_ICONS[video.platform] || Globe;
            const pColor = PLATFORM_COLORS[video.platform] || "text-muted-foreground";
            return (
              <Card key={video.id} data-testid={`card-catalog-${video.id}`}>
                <CardContent className="p-2.5">
                  <div className="flex items-center gap-3">
                    <VideoThumbnail url={video.thumbnailUrl} className="h-9 w-16 rounded" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate" data-testid={`text-catalog-title-${video.id}`}>
                        {video.title}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <PIcon className={`h-3 w-3 ${pColor}`} />
                        <span className="text-[10px] text-muted-foreground">{PLATFORM_NAMES[video.platform] || video.platform}</span>
                        <Badge variant="secondary" className="text-[9px] h-4 px-1">
                          {video.videoType || "video"}
                        </Badge>
                        {(video.viewCount || 0) > 0 && (
                          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                            <Eye className="h-2.5 w-2.5" />{Number(video.viewCount).toLocaleString()}
                          </span>
                        )}
                        {video.durationSec > 0 && (
                          <span className="text-[10px] text-muted-foreground">
                            {Math.floor(video.durationSec / 60)}:{String(video.durationSec % 60).padStart(2, "0")}
                          </span>
                        )}
                        {video.publishedAt && (
                          <LiveTimestamp date={video.publishedAt} />
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {video.fullUrl && (
                        <a href={video.fullUrl} target="_blank" rel="noopener noreferrer" data-testid={`link-catalog-${video.id}`}>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                        </a>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LibraryTab() {
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedVideoIds, setSelectedVideoIds] = useState<number[]>([]);
  const [ytBannerDismissed, setYtBannerDismissed] = useState(() => sessionStorage.getItem("yt_connect_banner_dismissed") === "1");
  const { toast } = useToast();
  const { data: videos, isLoading, error } = useVideos();
  const [, setLocation] = useLocation();
  const { data: linkedChannels } = useQuery<any[]>({ queryKey: ["/api/linked-channels"], staleTime: 60_000 });
  const hasYtOauth = (linkedChannels || []).some((c: any) => c.platform === "youtube" && c.accessToken);

  const dismissYtBanner = () => {
    sessionStorage.setItem("yt_connect_banner_dismissed", "1");
    setYtBannerDismissed(true);
  };

  const handleYtBannerConnect = () => {
    window.location.href = "/api/youtube/reconnect";
  };

  const filtered = useMemo(() => {
    if (!videos) return [];
    let list = videos;
    if (typeFilter === "vod") list = list.filter(v => isVodType(v.type));
    else if (typeFilter === "short") list = list.filter(v => v.type === "short");
    else if (typeFilter !== "all") list = list.filter(v => v.type === typeFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(v => v.title?.toLowerCase().includes(q));
    }
    return list;
  }, [videos, typeFilter, searchQuery]);

  const [pinJobId, setPinJobId] = useState<string | null>(null);
  const { data: pinJobStatus } = useQuery<any>({
    queryKey: ["/api/youtube-manager/pin-all-videos/status", pinJobId],
    queryFn: () => fetch(`/api/youtube-manager/pin-all-videos/status/${pinJobId}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!pinJobId,
    refetchInterval: (data) => (data?.state?.data?.done ? false : 5000),
  });

  const pinAllMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/youtube-manager/pin-all-videos");
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        setPinJobId(data.jobId);
        toast({
          title: "Pinned Comment Job Started",
          description: `Generating AI-written pinned comments for ${data.total} videos. This runs in the background — check back in a few minutes.`,
        });
      } else {
        toast({ title: "Cannot pin comments", description: data.error || "Connect your YouTube channel first.", variant: "destructive" });
      }
    },
    onError: () => {
      toast({ title: "Failed to start pin job", description: "Please try again.", variant: "destructive" });
    },
  });

  const bulkSeoMutation = useMutation({
    mutationFn: async (videoIds: number[]) => {
      const res = await apiRequest("POST", "/api/content/bulk-seo-optimize", { videoIds });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Bulk SEO Optimization Queued",
        description: `Successfully queued optimization for ${data.count} videos.`,
      });
      setSelectedVideoIds([]);
      setIsSelectMode(false);
      queryClient.invalidateQueries({ queryKey: ["/api/agents/tasks"] });
    },
    onError: (err) => {
      toast({
        title: "Bulk SEO Failed",
        description: "Failed to queue optimization tasks. Please try again.",
        variant: "destructive",
      });
    },
  });

  const resetSeoMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/content/reset-seo", {});
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "SEO Re-run Started",
        description: `Reset ${data.cleared} videos — regenerating descriptions with the improved format.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/videos"] });
    },
    onError: () => {
      toast({ title: "SEO Reset Failed", description: "Please try again.", variant: "destructive" });
    },
  });

  const toggleSelectVideo = (id: number) => {
    setSelectedVideoIds(prev =>
      prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id]
    );
  };

  if (error) {
    return <QueryErrorReset error={error} queryKey={["/api/videos"]} />;
  }

  return (
    <div className="space-y-3 pb-20">
      {!hasYtOauth && !ytBannerDismissed && (
        <div className="flex items-center gap-3 rounded-lg border border-yellow-400/30 bg-yellow-400/10 px-3 py-2.5 text-sm" data-testid="banner-yt-connect">
          <Zap className="h-4 w-4 text-yellow-500 shrink-0" />
          <span className="flex-1 text-yellow-700 dark:text-yellow-300">
            Connect YouTube to unlock auto-sync, AI optimization, and upload detection.
          </span>
          <Button size="sm" variant="outline" className="shrink-0 h-7 text-xs border-yellow-500/40 text-yellow-700 dark:text-yellow-300 hover:bg-yellow-400/20" onClick={handleYtBannerConnect} data-testid="button-yt-connect-banner">
            Connect
          </Button>
          <button onClick={dismissYtBanner} className="shrink-0 text-yellow-600 dark:text-yellow-400 hover:opacity-70" aria-label="Dismiss" data-testid="button-yt-banner-dismiss">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search videos..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8"
            data-testid="input-search-videos"
            aria-label="Search videos"
          />
        </div>
        <div className="flex items-center gap-1">
          {["all", "vod", "short"].map((t) => (
            <Button
              key={t}
              variant={typeFilter === t ? "default" : "outline"}
              size="sm"
              onClick={() => setTypeFilter(t)}
              data-testid={`button-filter-${t}`}
              aria-label={`Filter by ${t === "all" ? "all types" : TYPE_LABEL[t] || t}`}
              aria-pressed={typeFilter === t}
            >
              {t === "all" ? "All" : TYPE_LABEL[t] || t}
            </Button>
          ))}
          <Button
            variant={isSelectMode ? "secondary" : "outline"}
            size="sm"
            onClick={() => {
              setIsSelectMode(!isSelectMode);
              if (isSelectMode) setSelectedVideoIds([]);
            }}
            data-testid="button-toggle-select-mode"
            aria-label="Toggle bulk select mode"
          >
            <CheckSquare className="h-3.5 w-3.5 mr-1.5" />
            {isSelectMode ? "Cancel" : "Select"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={pinAllMutation.isPending || (!!pinJobId && !pinJobStatus?.done)}
            onClick={() => pinAllMutation.mutate()}
            data-testid="button-pin-all-videos"
            aria-label="Pin AI-written comment on all videos"
            title="Generate and pin an AI-written comment on every video, optimized for its content type (live VOD, clip, short, or regular)"
          >
            {pinAllMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Pin className="h-3.5 w-3.5 mr-1.5" />
            )}
            Pin All
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={resetSeoMutation.isPending}
            onClick={() => resetSeoMutation.mutate()}
            data-testid="button-reset-seo"
            aria-label="Re-run SEO optimization on all videos with the improved description format"
            title="Clears existing AI-generated descriptions and re-runs SEO optimization using the improved structured format with proper line breaks."
          >
            {resetSeoMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            )}
            Re-run SEO
          </Button>
        </div>
      </div>

      {pinJobId && pinJobStatus && (
        <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5 text-sm" data-testid="banner-pin-job-status">
          {pinJobStatus.done ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
          ) : (
            <Loader2 className="h-4 w-4 text-primary shrink-0 animate-spin" />
          )}
          <span className="flex-1 text-foreground/80">
            {pinJobStatus.done
              ? `Pinned comments complete — ${pinJobStatus.pinned ?? 0} pinned, ${pinJobStatus.failed ?? 0} failed`
              : `Pinning comments… ${pinJobStatus.processed ?? 0} / ${pinJobStatus.total ?? "?"} videos`}
          </span>
          {pinJobStatus.done && (
            <button onClick={() => setPinJobId(null)} className="text-muted-foreground hover:opacity-70" aria-label="Dismiss" data-testid="button-pin-status-dismiss">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2" role="status" aria-label="Loading videos">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        searchQuery ? (
          <EmptyState
            icon={Video}
            type="content"
            title="No matching videos"
            description="Try a different search term."
          />
        ) : (
          <YouTubeImportSection />
        )
      ) : (
        <div className="space-y-2">
          {filtered.map((video: any) => {
            const youtubeId = video.metadata?.youtubeId;
            const viewCount = video.metadata?.viewCount;
            const publishedAt = video.metadata?.publishedAt || video.createdAt;
            const isSelected = selectedVideoIds.includes(video.id);

            return (
              <Card 
                key={video.id} 
                data-testid={`card-video-${video.id}`}
                className={isSelected ? "border-primary/50 bg-primary/5" : ""}
                onClick={() => isSelectMode && toggleSelectVideo(video.id)}
              >
                <CardContent className="p-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {isSelectMode && (
                        <Checkbox 
                          checked={isSelected}
                          onCheckedChange={() => toggleSelectVideo(video.id)}
                          data-testid={`checkbox-video-${video.id}`}
                        />
                      )}
                      <VideoThumbnail url={video.thumbnailUrl} className="h-10 w-16 rounded-md" />
                      <div className="min-w-0 flex-1 group">
                        <div className="flex items-center gap-1">
                          <p className="font-medium text-sm truncate flex-1" data-testid={`text-video-title-${video.id}`}>
                            {video.title || "Untitled"}
                          </p>
                          <CopyButton
                            value={video.title || ""}
                            className="invisible group-hover:visible shrink-0"
                            data-testid={`button-copy-title-${video.id}`}
                          />
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <Badge variant="secondary" className="text-xs">
                            {TYPE_LABEL[video.type] || video.type}
                          </Badge>
                          <StatusBadge status={video.status} data-testid={`status-video-${video.id}`} />
                          {viewCount != null && (
                            <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                              <Eye className="h-3 w-3" />{Number(viewCount).toLocaleString()}
                            </span>
                          )}
                          {publishedAt && (
                            <LiveTimestamp date={publishedAt} data-testid={`timestamp-video-${video.id}`} />
                          )}
                          {video.metadata?.resolution && (
                            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5" data-testid={`quality-info-${video.id}`}>
                              <Monitor className="h-2.5 w-2.5" />
                              {video.metadata.resolution}
                              {video.metadata.nativeOrEnhanced === "enhanced" && (
                                <Badge variant="outline" className="text-[9px] h-3.5 px-1 ml-0.5">Enhanced</Badge>
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <OfferRecButton videoId={video.id} />
                      <BeatMapButton videoId={video.id} />
                      <StudioButton videoId={video.id} />
                      {youtubeId && (
                        <a
                          href={`https://www.youtube.com/watch?v=${youtubeId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          data-testid={`link-youtube-${video.id}`}
                        >
                          <Button variant="ghost" size="icon" aria-label="Open on YouTube">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                        </a>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {selectedVideoIds.length > 0 && (
        <div 
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4"
          data-testid="bulk-action-bar"
        >
          <Card className="flex items-center gap-4 px-4 py-2 border-primary/30 shadow-2xl bg-card/95 backdrop-blur">
            <div className="flex items-center gap-2 pr-4 border-r border-border/50">
              <Badge variant="secondary" className="h-6 px-2 min-w-[24px] flex items-center justify-center">
                {selectedVideoIds.length}
              </Badge>
              <span className="text-xs font-medium text-muted-foreground">selected</span>
            </div>
            
            <div className="flex items-center gap-2">
              <Button 
                size="sm" 
                variant="default"
                className="h-8 gap-1.5"
                disabled={bulkSeoMutation.isPending}
                onClick={() => bulkSeoMutation.mutate(selectedVideoIds)}
                data-testid="button-bulk-seo-optimize"
              >
                {bulkSeoMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                Optimize SEO
              </Button>
              
              <Button 
                size="icon" 
                variant="ghost" 
                className="h-8 w-8 text-muted-foreground"
                onClick={() => {
                  setSelectedVideoIds([]);
                  setIsSelectMode(false);
                }}
                data-testid="button-clear-selection"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
