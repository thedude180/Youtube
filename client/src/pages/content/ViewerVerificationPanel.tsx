import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  RefreshCw, ExternalLink, CheckCircle2, AlertCircle,
  Clock, XCircle, Eye, Rss, Youtube, Video,
} from "lucide-react";
import { SiYoutube } from "react-icons/si";
import { formatDistanceToNow } from "date-fns";

interface RssVideo {
  youtubeId: string;
  title: string;
  thumbnailUrl: string;
  publishedAt: string;
  viewCount: number;
}

interface PublishedItem {
  queueId: number;
  youtubeId: string;
  title: string;
  contentType: string;
  gameName: string;
  publishedAt: string;
  rssConfirmed: boolean;
  apiStatus: "public" | "private" | "unlisted" | "processing" | "missing" | "unknown" | null;
  youtubeUrl: string;
}

interface VerificationResult {
  channelId: string;
  channelUrl: string;
  scannedAt: string;
  rssVideos: RssVideo[];
  recentPublished: PublishedItem[];
  stats: {
    totalPublished: number;
    confirmedVisible: number;
    processing: number;
    missing: number;
    unconfirmed: number;
  };
}

function ItemStatusBadge({ item }: { item: PublishedItem }) {
  if (item.rssConfirmed) {
    return (
      <Badge className="bg-emerald-500/15 text-emerald-400 border-0 gap-1 text-xs">
        <CheckCircle2 className="h-3 w-3" />
        Viewer-Visible
      </Badge>
    );
  }
  if (item.apiStatus === "public") {
    return (
      <Badge className="bg-emerald-500/15 text-emerald-400 border-0 gap-1 text-xs">
        <CheckCircle2 className="h-3 w-3" />
        Live
      </Badge>
    );
  }
  if (item.apiStatus === "processing") {
    return (
      <Badge className="bg-amber-500/15 text-amber-400 border-0 gap-1 text-xs">
        <Clock className="h-3 w-3 animate-pulse" />
        Processing
      </Badge>
    );
  }
  if (item.apiStatus === "missing") {
    return (
      <Badge className="bg-red-500/15 text-red-400 border-0 gap-1 text-xs">
        <XCircle className="h-3 w-3" />
        Not Found
      </Badge>
    );
  }
  if (item.apiStatus === "private") {
    return (
      <Badge className="bg-slate-500/15 text-slate-400 border-0 gap-1 text-xs">
        <AlertCircle className="h-3 w-3" />
        Private
      </Badge>
    );
  }
  if (item.apiStatus === "unlisted") {
    return (
      <Badge className="bg-slate-500/15 text-slate-400 border-0 gap-1 text-xs">
        <AlertCircle className="h-3 w-3" />
        Unlisted
      </Badge>
    );
  }
  return (
    <Badge className="bg-blue-500/15 text-blue-400 border-0 gap-1 text-xs">
      <Clock className="h-3 w-3" />
      Unconfirmed
    </Badge>
  );
}

function RssThumb({ video }: { video: RssVideo }) {
  const [broken, setBroken] = useState(false);
  return (
    <a
      href={`https://www.youtube.com/watch?v=${video.youtubeId}`}
      target="_blank"
      rel="noopener noreferrer"
      data-testid={`rss-video-${video.youtubeId}`}
      className="group block rounded-lg overflow-hidden border border-border/40 hover:border-red-500/40 transition-colors bg-card"
    >
      <div className="relative aspect-video bg-muted">
        {!broken ? (
          <img
            src={video.thumbnailUrl}
            alt={video.title}
            className="w-full h-full object-cover"
            onError={() => setBroken(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Video className="h-6 w-6 text-muted-foreground" />
          </div>
        )}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
          <ExternalLink className="h-4 w-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
        {video.viewCount > 0 && (
          <div className="absolute bottom-1 right-1 bg-black/70 text-white text-[10px] px-1 rounded">
            {video.viewCount >= 1000
              ? `${(video.viewCount / 1000).toFixed(1)}K`
              : video.viewCount}{" "}
            views
          </div>
        )}
      </div>
      <div className="p-2">
        <p className="text-xs font-medium line-clamp-2 leading-tight group-hover:text-red-400 transition-colors">
          {video.title}
        </p>
        <p className="text-[10px] text-muted-foreground mt-1">
          {formatDistanceToNow(new Date(video.publishedAt), { addSuffix: true })}
        </p>
      </div>
    </a>
  );
}

export default function ViewerVerificationPanel() {
  const { toast } = useToast();

  const { data, isLoading, error } = useQuery<VerificationResult>({
    queryKey: ["/api/youtube/viewer-verification"],
    staleTime: 5 * 60 * 1000,
  });

  const refresh = useMutation({
    mutationFn: () => apiRequest("POST", "/api/youtube/viewer-verification/refresh"),
    onSuccess: (result: any) => {
      queryClient.setQueryData(["/api/youtube/viewer-verification"], result);
      toast({ title: "Scan complete", description: `${result.rssVideos?.length ?? 0} videos confirmed visible to viewers.` });
    },
    onError: () => {
      toast({ title: "Scan failed", description: "Could not reach YouTube. Try again shortly.", variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <Card className="border-red-500/20">
        <CardContent className="p-6 text-center space-y-3">
          <XCircle className="h-8 w-8 text-red-400 mx-auto" />
          <p className="text-sm text-muted-foreground">Could not load viewer verification. Connect your YouTube channel first.</p>
          <Button size="sm" variant="outline" onClick={() => refresh.mutate()} disabled={refresh.isPending}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${refresh.isPending ? "animate-spin" : ""}`} />
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  const stats = data?.stats;

  return (
    <div className="space-y-4" data-testid="viewer-verification-panel">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-red-400" />
            <h2 className="text-sm font-semibold">Viewer Verification</h2>
            <Badge className="bg-red-500/10 text-red-400 border-0 text-[10px]">
              <SiYoutube className="h-2.5 w-2.5 mr-1" />
              Live channel check
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            What subscribers actually see on your channel right now
            {data?.scannedAt && (
              <span className="ml-2 opacity-70">
                · scanned {formatDistanceToNow(new Date(data.scannedAt), { addSuffix: true })}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {data?.channelUrl && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1.5"
              asChild
            >
              <a href={data.channelUrl} target="_blank" rel="noopener noreferrer" data-testid="link-channel-url">
                <ExternalLink className="h-3 w-3" />
                View Channel
              </a>
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1.5"
            onClick={() => refresh.mutate()}
            disabled={refresh.isPending}
            data-testid="button-refresh-verification"
          >
            <RefreshCw className={`h-3 w-3 ${refresh.isPending ? "animate-spin" : ""}`} />
            {refresh.isPending ? "Scanning…" : "Refresh Scan"}
          </Button>
        </div>
      </div>

      {/* Stats strip */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" data-testid="verification-stats">
          <Card className="border-border/40 bg-card/50">
            <CardContent className="p-3 text-center">
              <div className="text-xl font-bold metric-display text-foreground">
                {stats.totalPublished}
              </div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">
                Published (30d)
              </div>
            </CardContent>
          </Card>
          <Card className="border-emerald-500/20 bg-emerald-500/5">
            <CardContent className="p-3 text-center">
              <div className="text-xl font-bold metric-display text-emerald-400">
                {stats.confirmedVisible}
              </div>
              <div className="text-[10px] text-emerald-400/70 uppercase tracking-wide mt-0.5">
                Viewer-Visible
              </div>
            </CardContent>
          </Card>
          <Card className="border-amber-500/20 bg-amber-500/5">
            <CardContent className="p-3 text-center">
              <div className="text-xl font-bold metric-display text-amber-400">
                {stats.processing}
              </div>
              <div className="text-[10px] text-amber-400/70 uppercase tracking-wide mt-0.5">
                Processing
              </div>
            </CardContent>
          </Card>
          <Card className="border-red-500/20 bg-red-500/5">
            <CardContent className="p-3 text-center">
              <div className="text-xl font-bold metric-display text-red-400">
                {stats.missing}
              </div>
              <div className="text-[10px] text-red-400/70 uppercase tracking-wide mt-0.5">
                Not Found
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* RSS feed — true viewer perspective */}
      <Card className="border-border/40">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Rss className="h-3.5 w-3.5 text-orange-400" />
            <span className="text-sm font-medium">Live Channel Feed</span>
            <Badge variant="outline" className="text-[10px] border-orange-400/30 text-orange-400">
              What viewers see right now
            </Badge>
            {data?.rssVideos && data.rssVideos.length > 0 && (
              <span className="text-xs text-muted-foreground ml-auto">
                {data.rssVideos.length} most recent public videos
              </span>
            )}
          </div>

          {!data?.rssVideos || data.rssVideos.length === 0 ? (
            <div className="text-center py-8 space-y-2">
              <Youtube className="h-8 w-8 text-muted-foreground/40 mx-auto" />
              <p className="text-sm text-muted-foreground">
                No public videos found via RSS.
              </p>
              <p className="text-xs text-muted-foreground/70">
                Videos may still be processing, private, or the channel RSS may take a few minutes to update after upload.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
              {data.rssVideos.map((v) => (
                <RssThumb key={v.youtubeId} video={v} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* System-published vs viewer-confirmed table */}
      <Card className="border-border/40">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
            <span className="text-sm font-medium">Recent Publications</span>
            <Badge variant="outline" className="text-[10px]">Last 30 days</Badge>
          </div>

          {!data?.recentPublished || data.recentPublished.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No publications in the last 30 days. The autopilot system will start publishing once content is queued.
            </p>
          ) : (
            <div className="space-y-1.5">
              {data.recentPublished.map((item) => (
                <div
                  key={item.queueId}
                  data-testid={`published-item-${item.queueId}`}
                  className="flex items-center gap-3 py-2 px-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-xs font-medium truncate max-w-xs">{item.title}</p>
                      {item.gameName && (
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          · {item.gameName}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[10px] text-muted-foreground capitalize">
                        {item.contentType.replace(/_/g, " ")}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        · {formatDistanceToNow(new Date(item.publishedAt), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                  <ItemStatusBadge item={item} />
                  <a
                    href={item.youtubeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid={`link-video-${item.youtubeId}`}
                    className="text-muted-foreground hover:text-red-400 transition-colors shrink-0"
                    title="Open on YouTube"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Footer note */}
      <p className="text-[10px] text-muted-foreground text-center pb-1">
        RSS feed uses zero YouTube quota — it reflects what any subscriber sees when they visit your channel.
        API checks are quota-aware and run only for videos not yet confirmed in the feed.
      </p>
    </div>
  );
}
