import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3, Youtube, Tv2, Gamepad2, Music2, MessageCircle, Globe } from "lucide-react";

const platformConfig: Record<string, { label: string; icon: typeof Youtube }> = {
  youtube: { label: "YouTube", icon: Youtube },
  youtubeshorts: { label: "YouTube Shorts", icon: Youtube },
};

function formatNumber(n: number | undefined): string {
  if (n == null) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatRevenue(n: number | undefined): string {
  if (n == null) return "$0";
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export default function CrossPlatformAnalytics() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/analytics/cross-platform"], refetchInterval: 5 * 60_000, staleTime: 3 * 60_000 });

  if (isLoading) {
    return (
      <div data-testid="cross-platform-loading" className="space-y-4">
        <Skeleton className="h-24 rounded-md" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-md" />
          ))}
        </div>
      </div>
    );
  }

  const platforms = data?.platforms ?? [];
  const totals = data?.totals ?? {
    videos: 0,
    streams: 0,
    views: 0,
    revenue: 0,
  };

  if (!platforms.length && !data) {
    return (
      <Card data-testid="cross-platform-empty">
        <CardContent className="p-6">
          <div className="flex flex-col items-center gap-2 py-6">
            <BarChart3 className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No cross-platform analytics available yet.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div data-testid="cross-platform-analytics" className="space-y-4">
      <Card data-testid="card-cross-platform-totals">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Cross-Platform Totals
            </CardTitle>
            <Badge variant="secondary" className="text-xs no-default-hover-elevate">
              {platforms.length} platforms
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3 rounded-md bg-muted/30" data-testid="total-videos">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Videos</p>
              <p className="text-xl font-bold mt-1">{formatNumber(totals.videos)}</p>
            </div>
            <div className="p-3 rounded-md bg-muted/30" data-testid="total-streams">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Streams</p>
              <p className="text-xl font-bold mt-1">{formatNumber(totals.streams)}</p>
            </div>
            <div className="p-3 rounded-md bg-muted/30" data-testid="total-views">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Views</p>
              <p className="text-xl font-bold mt-1">{formatNumber(totals.views)}</p>
            </div>
            <div className="p-3 rounded-md bg-muted/30" data-testid="total-revenue">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Revenue</p>
              <p className="text-xl font-bold mt-1 text-purple-400">{formatRevenue(totals.revenue)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {platforms.map((platform: any) => {
          const config = platformConfig[platform.id] ?? { label: platform.name ?? platform.id, icon: Globe };
          const Icon = config.icon;
          return (
            <Card key={platform.id} data-testid={`card-platform-${platform.id}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <span className="text-sm font-semibold">{platform.name ?? config.label}</span>
                  </div>
                  <Badge
                    variant="secondary"
                    className={`text-xs no-default-hover-elevate ${
                      platform.connected ? "bg-emerald-500/10 text-emerald-500" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {platform.connected ? "Connected" : "Offline"}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div data-testid={`platform-videos-${platform.id}`}>
                    <p className="text-xs text-muted-foreground">Videos</p>
                    <p className="text-sm font-bold">{formatNumber(platform.videos)}</p>
                  </div>
                  <div data-testid={`platform-streams-${platform.id}`}>
                    <p className="text-xs text-muted-foreground">Streams</p>
                    <p className="text-sm font-bold">{formatNumber(platform.streams)}</p>
                  </div>
                  <div data-testid={`platform-views-${platform.id}`}>
                    <p className="text-xs text-muted-foreground">Views</p>
                    <p className="text-sm font-bold">{formatNumber(platform.views)}</p>
                  </div>
                  <div data-testid={`platform-revenue-${platform.id}`}>
                    <p className="text-xs text-muted-foreground">Revenue</p>
                    <p className="text-sm font-bold text-purple-400">{formatRevenue(platform.revenue)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
