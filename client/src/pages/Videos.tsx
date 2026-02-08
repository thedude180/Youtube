import { useVideos } from "@/hooks/use-videos";
import { Link } from "wouter";
import { StatusBadge } from "@/components/StatusBadge";
import { format } from "date-fns";
import { Search, PlayCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
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
    <div className="p-6 lg:p-8 space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 data-testid="text-page-title" className="text-2xl font-display font-bold">Library</h1>
          <p className="text-sm text-muted-foreground mt-1">{videos?.length || 0} videos</p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            data-testid="input-search-videos"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 w-56"
          />
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {statuses.map((status) => (
          <Badge
            key={status}
            data-testid={`filter-status-${status || "all"}`}
            variant="outline"
            className={cn(
              "cursor-pointer capitalize toggle-elevate",
              filterStatus === status ? "toggle-elevated" : "text-muted-foreground"
            )}
            onClick={() => setFilterStatus(status)}
          >
            {status || "All"}
          </Badge>
        ))}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-56 rounded-xl" />
          ))}
        </div>
      ) : filteredVideos.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <PlayCircle className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">
              {searchQuery ? `No results for "${searchQuery}"` : "No videos yet"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredVideos.map((video) => (
            <Link key={video.id} href={`/videos/${video.id}`} className="group block h-full">
              <Card data-testid={`card-video-${video.id}`} className="overflow-hidden hover-elevate h-full flex flex-col">
                <div className="aspect-video bg-secondary relative overflow-hidden">
                  {video.thumbnailUrl ? (
                    <img src={video.thumbnailUrl} alt={video.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <PlayCircle className="h-10 w-10 text-muted-foreground/20" />
                    </div>
                  )}
                  <div className="absolute top-2 right-2">
                    <StatusBadge status={video.status} />
                  </div>
                </div>
                <CardContent className="p-3 flex-1 flex flex-col">
                  <h3 data-testid={`text-video-title-${video.id}`} className="text-sm font-medium line-clamp-2 mb-1 group-hover:text-primary transition-colors">
                    {video.title}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-auto">
                    {format(new Date(video.createdAt || Date.now()), "MMM d, yyyy")}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
