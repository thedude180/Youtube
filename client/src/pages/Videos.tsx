import { useVideos } from "@/hooks/use-videos";
import { Link } from "wouter";
import { StatusBadge } from "@/components/StatusBadge";
import { format } from "date-fns";
import { Search, Filter, PlayCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useState, useMemo } from "react";

const statuses = ["", "ingested", "processing", "ready", "scheduled", "uploaded"];

export default function Videos() {
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const { data: videos, isLoading } = useVideos({ status: filterStatus || undefined });

  const filteredVideos = useMemo(() => {
    if (!videos) return [];
    if (!searchQuery.trim()) return videos;
    const q = searchQuery.toLowerCase();
    return videos.filter(
      (v) =>
        v.title.toLowerCase().includes(q) ||
        (v.description && v.description.toLowerCase().includes(q))
    );
  }, [videos, searchQuery]);

  return (
    <div className="p-8 space-y-6 max-w-[1600px] mx-auto animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 data-testid="text-page-title" className="text-3xl font-display font-bold text-foreground">Video Library</h1>
          <p className="text-muted-foreground mt-1">Manage VODs, Shorts, and Clips.</p>
        </div>

        <div className="flex items-center gap-3">
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
          <Button data-testid="button-filter" variant="outline" size="icon">
            <Filter className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex gap-2 pb-2 overflow-x-auto flex-wrap">
        {statuses.map((status) => (
          <Badge
            key={status}
            data-testid={`filter-status-${status || "all"}`}
            variant="outline"
            className={cn(
              "cursor-pointer capitalize",
              filterStatus === status
                ? "bg-primary/10 border-primary text-primary"
                : "text-muted-foreground"
            )}
            onClick={() => setFilterStatus(status)}
          >
            {status || "All Videos"}
          </Badge>
        ))}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-72 rounded-xl" />
          ))}
        </div>
      ) : filteredVideos.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <PlayCircle className="w-12 h-12 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">
              {searchQuery ? "No matching videos" : "No videos yet"}
            </h3>
            <p className="text-muted-foreground text-sm max-w-md">
              {searchQuery
                ? `No videos found matching "${searchQuery}". Try a different search term.`
                : "Your video library is empty. Add videos to get started."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredVideos.map((video) => (
            <Link key={video.id} href={`/videos/${video.id}`} className="group block h-full">
              <Card data-testid={`card-video-${video.id}`} className="overflow-hidden hover-elevate h-full flex flex-col">
                <div className="aspect-video bg-secondary relative overflow-hidden">
                  {video.thumbnailUrl ? (
                    <img src={video.thumbnailUrl} alt={video.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-secondary to-background">
                      <PlayCircle className="h-12 w-12 text-muted-foreground/20" />
                    </div>
                  )}
                  <div className="absolute top-3 right-3">
                    <StatusBadge status={video.status} />
                  </div>
                  <div className="absolute bottom-3 right-3 bg-black/80 text-white text-[10px] font-mono px-1.5 py-0.5 rounded">
                    {video.type === "short" ? "SHORT" : "VOD"}
                  </div>
                </div>
                <CardContent className="p-4 flex-1 flex flex-col">
                  <h3 data-testid={`text-video-title-${video.id}`} className="font-bold text-lg line-clamp-2 mb-2 group-hover:text-primary transition-colors">
                    {video.title}
                  </h3>
                  <p className="text-xs text-muted-foreground line-clamp-2 mb-4 flex-1">
                    {video.description || "No description generated yet."}
                  </p>
                  <div className="pt-4 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground mt-auto">
                    <span>{format(new Date(video.createdAt || Date.now()), "MMM d, yyyy")}</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
