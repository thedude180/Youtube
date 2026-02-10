import { useVideos } from "@/hooks/use-videos";
import { Link } from "wouter";
import { StatusBadge } from "@/components/StatusBadge";
import { Search, PlayCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useState, useMemo } from "react";

const TYPE_TABS = [
  { value: "all", label: "All" },
  { value: "vod", label: "VOD" },
  { value: "short", label: "Shorts" },
  { value: "live_replay", label: "Live Replay" },
] as const;

const TYPE_BADGE_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  vod: "default",
  short: "secondary",
  live_replay: "outline",
};

const TYPE_LABEL: Record<string, string> = {
  vod: "VOD",
  short: "Short",
  live_replay: "Live Replay",
};

function StatusStatBadge({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="capitalize">{label}</span>
      <span className="font-semibold text-foreground">{count}</span>
    </div>
  );
}

export default function Videos() {
  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const { data: videos, isLoading } = useVideos();

  const filteredVideos = useMemo(() => {
    if (!videos) return [];
    let result = videos;
    if (activeTab !== "all") {
      result = result.filter((v) => v.type === activeTab);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((v) => v.title.toLowerCase().includes(q));
    }
    return result;
  }, [videos, activeTab, searchQuery]);

  const statusCounts = useMemo(() => {
    if (!videos) return {};
    const counts: Record<string, number> = {};
    for (const v of videos) {
      counts[v.status] = (counts[v.status] || 0) + 1;
    }
    return counts;
  }, [videos]);

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 data-testid="text-page-title" className="text-2xl font-display font-bold">Library</h1>
          <p data-testid="text-video-count" className="text-sm text-muted-foreground mt-1">
            {videos?.length || 0} videos
          </p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            data-testid="input-search-videos"
            placeholder="Search videos..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 w-64"
          />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList data-testid="tabs-video-type">
          {TYPE_TABS.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              data-testid={`tab-${tab.value}`}
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="mt-4 space-y-4">
          <Card>
            <CardContent className="py-3 px-4">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-muted-foreground">Total</span>
                  <span data-testid="stat-total" className="font-semibold text-foreground">
                    {filteredVideos.length}
                  </span>
                </div>
                <div className="w-px h-4 bg-border" />
                {Object.entries(statusCounts).map(([status, count]) => (
                  <StatusStatBadge key={status} label={status} count={count} />
                ))}
              </div>
            </CardContent>
          </Card>

          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-64 rounded-xl" />
              ))}
            </div>
          ) : filteredVideos.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <PlayCircle className="w-10 h-10 text-muted-foreground/30 mb-3" />
                <p data-testid="text-empty-state" className="text-sm text-muted-foreground">
                  {searchQuery ? `No results for "${searchQuery}"` : "No videos yet"}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredVideos.map((video) => (
                <Link key={video.id} href={`/videos/${video.id}`} className="group block h-full">
                  <Card
                    data-testid={`card-video-${video.id}`}
                    className="overflow-visible hover-elevate h-full flex flex-col"
                  >
                    <CardContent className="p-4 flex-1 flex flex-col gap-2">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <h3
                          data-testid={`text-video-title-${video.id}`}
                          className="text-sm font-medium line-clamp-2 flex-1 min-w-0"
                        >
                          {video.title}
                        </h3>
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge
                          data-testid={`badge-type-${video.id}`}
                          variant={TYPE_BADGE_VARIANT[video.type] || "default"}
                          className="text-[10px]"
                        >
                          {TYPE_LABEL[video.type] || video.type}
                        </Badge>
                        <StatusBadge status={video.status} />
                      </div>

                      {video.description && (
                        <p
                          data-testid={`text-video-desc-${video.id}`}
                          className="text-xs text-muted-foreground line-clamp-2"
                        >
                          {video.description}
                        </p>
                      )}

                      <div className="mt-auto flex items-center justify-between gap-2 flex-wrap pt-2">
                        {video.platform && (
                          <span
                            data-testid={`text-video-platform-${video.id}`}
                            className="text-[11px] text-muted-foreground capitalize"
                          >
                            {video.platform}
                          </span>
                        )}
                        {video.metadata?.seoScore != null && (
                          <span
                            data-testid={`text-seo-score-${video.id}`}
                            className="text-[11px] text-muted-foreground"
                          >
                            SEO {video.metadata.seoScore}/100
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      </Tabs>
    </div>
  );
}
