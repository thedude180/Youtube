import { useState, useMemo, lazy, Suspense } from "react";
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
  Calendar as CalendarIcon, Eye, Loader2,
} from "lucide-react";
import { format } from "date-fns";
import { CopyButton } from "@/components/CopyButton";
import { LiveTimestamp } from "@/components/LiveTimestamp";

type ContentTab = "library" | "updated" | "channels" | "calendar";

const UpdatedVideosTab = lazy(() => import("./content/UpdatedVideosTab"));
const ChannelsTab = lazy(() => import("./content/ChannelsTab"));
const CalendarTab = lazy(() => import("./content/CalendarTab"));

export default function Content() {
  usePageTitle("Content");
  const params = useParams<{ tab?: string }>();
  const tabParam = params?.tab;
  const validTabs: ContentTab[] = ["library", "updated", "channels", "calendar"];
  const initialTab = validTabs.includes(tabParam as ContentTab) ? (tabParam as ContentTab) : "library";
  const [activeTab, setActiveTab] = useTabMemory("content", initialTab, validTabs);
  const { t } = useTranslation();

  return (
    <div className="p-3 lg:p-4 space-y-3 max-w-6xl mx-auto">
      <div>
        <h1 data-testid="text-page-title" className="text-xl font-display font-bold">{t("content.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("content.subtitle", "Manage your videos and channels")}</p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ContentTab)}>
        <div className="scrollable-tabs">
          <TabsList data-testid="tabs-content" className="w-auto inline-flex">
            <TabsTrigger value="library" data-testid="tab-library">
              <Video className="h-3.5 w-3.5 mr-1.5" />{t("content.library")}
            </TabsTrigger>
            <TabsTrigger value="updated" data-testid="tab-updated">
              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />Updated
            </TabsTrigger>
            <TabsTrigger value="channels" data-testid="tab-channels">
              <Radio className="h-3.5 w-3.5 mr-1.5" />{t("content.channels")}
            </TabsTrigger>
            <TabsTrigger value="calendar" data-testid="tab-calendar">
              <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />Calendar
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
      </Tabs>
    </div>
  );
}

const TYPE_LABEL: Record<string, string> = { vod: "VOD", short: "Short" };

function LibraryTab() {
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
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

  if (error) {
    return <QueryErrorReset error={error} queryKey={["/api/videos"]} />;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search videos..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8"
            data-testid="input-search-videos"
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
            >
              {t === "all" ? "All" : TYPE_LABEL[t] || t}
            </Button>
          ))}
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
          title={searchQuery ? "No matching videos" : "No videos yet"}
          description={searchQuery ? "Try a different search term." : "Your videos will appear here once CreatorOS starts creating and optimizing content for you."}
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((video: any) => {
            const youtubeId = video.metadata?.youtubeId;
            const viewCount = video.metadata?.viewCount;
            const publishedAt = video.metadata?.publishedAt || video.createdAt;
            return (
              <Card key={video.id} data-testid={`card-video-${video.id}`}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
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
    </div>
  );
}
