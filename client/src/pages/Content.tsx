import { useState, useMemo, Suspense } from "react";
import { useParams } from "wouter";
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
  Calendar as CalendarIcon, Eye, Loader2, Brain,
  TrendingUp, Film, Zap, BarChart2, CheckSquare, X,
  Sparkles,
} from "lucide-react";
import { format } from "date-fns";
import { CopyButton } from "@/components/CopyButton";
import { LiveTimestamp } from "@/components/LiveTimestamp";
import { lazyRetry } from "@/lib/lazyRetry";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useMutation } from "@tanstack/react-query";

type ContentTab = "library" | "updated" | "channels" | "calendar" | "retention";

const UpdatedVideosTab = lazyRetry(() => import("./content/UpdatedVideosTab"));
const ChannelsTab = lazyRetry(() => import("./content/ChannelsTab"));
const CalendarTab = lazyRetry(() => import("./content/CalendarTab"));
const RetentionBeatsTab = lazyRetry(() => import("./content/RetentionBeatsTab"));

function ContentStatsStrip() {
  const { data: videos } = useVideos();
  const stats = useMemo(() => {
    if (!videos) return null;
    const vods = videos.filter(v => v.type === "vod").length;
    const shorts = videos.filter(v => v.type === "short").length;
    const published = videos.filter(v => v.status === "published").length;
    const totalViews = videos.reduce((sum, v) => sum + (Number(v.metadata?.viewCount) || 0), 0);
    return { total: videos.length, vods, shorts, published, totalViews };
  }, [videos]);

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
  const validTabs: ContentTab[] = ["library", "updated", "channels", "calendar", "retention"];
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
            <TabsTrigger value="updated" data-testid="tab-updated" aria-label="Updated videos tab">
              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />Updated
            </TabsTrigger>
            <TabsTrigger value="channels" data-testid="tab-channels" aria-label="Channels tab">
              <Radio className="h-3.5 w-3.5 mr-1.5" />{t("content.channels")}
            </TabsTrigger>
            <TabsTrigger value="calendar" data-testid="tab-calendar" aria-label="Content calendar tab">
              <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />Calendar
            </TabsTrigger>
            <TabsTrigger value="retention" data-testid="tab-retention" aria-label="Retention beats tab">
              <Brain className="h-3.5 w-3.5 mr-1.5" />Retention
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="library" className="mt-2">
          <LibraryTab />
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
        <TabsContent value="retention" className="mt-2">
          <Suspense fallback={<Skeleton className="h-64 w-full" />}>
            <RetentionBeatsTab />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}

const TYPE_LABEL: Record<string, string> = { vod: "VOD", short: "Short" };

function LibraryTab() {
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedVideoIds, setSelectedVideoIds] = useState<number[]>([]);
  const { toast } = useToast();
  const { data: videos, isLoading, error } = useVideos();

  const filtered = useMemo(() => {
    if (!videos) return [];
    let list = videos;
    if (typeFilter !== "all") list = list.filter(v => v.type === typeFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(v => v.title?.toLowerCase().includes(q));
    }
    return list;
  }, [videos, typeFilter, searchQuery]);

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
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2" role="status" aria-label="Loading videos">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Video}
          type="content"
          title={searchQuery ? "No matching videos" : "No Content Yet"}
          description={searchQuery ? "Try a different search term." : "Your videos and content will appear here once you connect a platform and start creating."}
        />
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
                      {video.thumbnailUrl ? (
                        <img
                          src={video.thumbnailUrl}
                          alt=""
                          className="h-10 w-16 rounded-md object-cover shrink-0"
                        />
                      ) : (
                        <div className="h-10 w-16 rounded-md bg-muted flex items-center justify-center shrink-0">
                          <Video className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
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
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
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
