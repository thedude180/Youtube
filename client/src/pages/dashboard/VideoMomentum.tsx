import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { Flame, TrendingUp, Minus, ExternalLink, Plus, RefreshCw, Zap } from "lucide-react";

interface MomentumVideo {
  youtubeVideoId:    string;
  contentType:       string;
  gameName:          string | null;
  title:             string | null;
  viewCount:         number;
  likeCount:         number;
  velocityPerHour:   number;
  momentumScore:     number;
  isGainingSteam:    boolean;
  hoursSincePublish: number | null;
  publishedAt:       string | null;
  snapshotAt:        string | null;
  youtubeUrl:        string;
  shortsUrl:         string | null;
}

function VelocityBadge({ velocity }: { velocity: number }) {
  if (velocity <= 0) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <span className="text-xs font-mono text-emerald-400">
      +{velocity >= 100 ? Math.round(velocity) : velocity.toFixed(1)}/hr
    </span>
  );
}

function MomentumIndicator({ video }: { video: MomentumVideo }) {
  if (video.isGainingSteam) {
    return (
      <span className="flex items-center gap-1 text-orange-400 text-xs font-semibold" data-testid="indicator-steam">
        <Flame className="w-3.5 h-3.5" /> Gaining steam
      </span>
    );
  }
  if (video.velocityPerHour > 0) {
    return (
      <span className="flex items-center gap-1 text-emerald-400 text-xs" data-testid="indicator-growing">
        <TrendingUp className="w-3.5 h-3.5" /> Growing
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-muted-foreground text-xs" data-testid="indicator-stable">
      <Minus className="w-3.5 h-3.5" /> Stable
    </span>
  );
}

function formatAge(hoursSincePublish: number | null): string {
  if (hoursSincePublish === null) return "—";
  if (hoursSincePublish < 24) return `${Math.round(hoursSincePublish)}h ago`;
  const days = Math.floor(hoursSincePublish / 24);
  return `${days}d ago`;
}

function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function VideoMomentum() {
  const qc = useQueryClient();
  const [addId, setAddId] = useState("");
  const [addType, setAddType] = useState<"short" | "vod">("short");
  const [showAdd, setShowAdd] = useState(false);

  const { data, isLoading, refetch } = useQuery<{ videos: MomentumVideo[]; count: number }>({
    queryKey: ["/api/youtube/momentum"],
    refetchInterval: 10 * 60_000, // refresh display every 10min
  });

  const trackMutation = useMutation({
    mutationFn: (body: { youtubeVideoId: string; contentType: string }) =>
      apiRequest("POST", "/api/youtube/momentum/track", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/youtube/momentum"] });
      setAddId("");
      setShowAdd(false);
    },
  });

  const videos = data?.videos ?? [];
  const gainingSteam = videos.filter(v => v.isGainingSteam);

  return (
    <Card className="bg-card border-border" data-testid="card-video-momentum">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base font-semibold text-foreground">
              View Momentum
            </CardTitle>
            <Badge variant="outline" className="text-xs text-muted-foreground">
              No API needed
            </Badge>
            {gainingSteam.length > 0 && (
              <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30 text-xs">
                <Flame className="w-3 h-3 mr-1" />
                {gainingSteam.length} gaining steam
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setShowAdd(v => !v)}
              data-testid="button-add-video"
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> Track video
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => refetch()}
              data-testid="button-refresh-momentum"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          Snapshots view velocity every 2h via InnerTube. Gaining steam → 
          Analytics API deep-dive fires automatically when quota is available.
        </p>

        {showAdd && (
          <div className="flex items-center gap-2 mt-3 flex-wrap" data-testid="form-add-video">
            <Input
              placeholder="YouTube video ID (e.g. dQw4w9WgXcQ)"
              className="h-8 text-xs flex-1 min-w-48"
              value={addId}
              onChange={e => setAddId(e.target.value.trim())}
              data-testid="input-video-id"
            />
            <Select value={addType} onValueChange={v => setAddType(v as "short" | "vod")}>
              <SelectTrigger className="h-8 w-24 text-xs" data-testid="select-content-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="short">Short</SelectItem>
                <SelectItem value="vod">VOD</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="sm"
              className="h-8 text-xs"
              disabled={!addId || trackMutation.isPending}
              onClick={() => trackMutation.mutate({ youtubeVideoId: addId, contentType: addType })}
              data-testid="button-submit-track"
            >
              {trackMutation.isPending ? "Adding…" : "Add"}
            </Button>
          </div>
        )}
      </CardHeader>

      <CardContent className="pt-0">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-14 rounded-lg bg-muted/30 animate-pulse" />
            ))}
          </div>
        ) : videos.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground" data-testid="state-no-videos">
            <Zap className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No tracked videos yet.</p>
            <p className="text-xs mt-1">
              Videos are auto-added when they publish through the system. <br />
              You can also add any YouTube video ID manually above.
            </p>
          </div>
        ) : (
          <div className="space-y-2" data-testid="list-momentum-videos">
            {videos.map((v, i) => (
              <div
                key={v.youtubeVideoId}
                className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                  v.isGainingSteam
                    ? "border-orange-500/30 bg-orange-500/5"
                    : "border-border/50 bg-muted/10 hover:bg-muted/20"
                }`}
                data-testid={`row-video-${v.youtubeVideoId}`}
              >
                {/* Rank */}
                <span className="text-xs text-muted-foreground w-5 text-right shrink-0">
                  {i + 1}
                </span>

                {/* Thumbnail placeholder */}
                <div className="w-10 h-7 rounded bg-muted/40 shrink-0 overflow-hidden">
                  <img
                    src={`https://i.ytimg.com/vi/${v.youtubeVideoId}/default.jpg`}
                    alt=""
                    className="w-full h-full object-cover"
                    loading="lazy"
                    onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                </div>

                {/* Title + metadata */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate text-foreground" data-testid={`text-title-${v.youtubeVideoId}`}>
                    {v.title ?? v.youtubeVideoId}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                      {v.contentType === "short" ? "Short" : "VOD"}
                    </Badge>
                    {v.gameName && (
                      <span className="text-[10px] text-muted-foreground">{v.gameName}</span>
                    )}
                    <span className="text-[10px] text-muted-foreground">{formatAge(v.hoursSincePublish)}</span>
                    <MomentumIndicator video={v} />
                  </div>
                </div>

                {/* Stats */}
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold tabular-nums" data-testid={`text-views-${v.youtubeVideoId}`}>
                    {formatViews(v.viewCount)}
                  </p>
                  <VelocityBadge velocity={v.velocityPerHour} />
                </div>

                {/* Open */}
                <a
                  href={v.shortsUrl ?? v.youtubeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground shrink-0"
                  data-testid={`link-open-${v.youtubeVideoId}`}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            ))}
          </div>
        )}

        {videos.length > 0 && data?.count !== undefined && (
          <p className="text-xs text-muted-foreground text-center mt-3">
            Tracking {data.count} video{data.count !== 1 ? "s" : ""} · snapshots every 2h via InnerTube
          </p>
        )}
      </CardContent>
    </Card>
  );
}
