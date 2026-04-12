import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign, TrendingUp, Eye, Video } from "lucide-react";

interface AttributedVideo {
  videoId: number;
  title: string;
  type: string;
  views: number;
  attributedRevenue: number;
  revenuePerView: number;
  publishedAt: string | null;
}

interface RevenueData {
  totalRevenue: number;
  attributedVideos: AttributedVideo[];
  unattributed: number;
}

function formatCurrency(n: number | null | undefined) {
  return `$${(n ?? 0).toFixed(2)}`;
}

function formatViews(n: number | null | undefined) {
  const v = n ?? 0;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toString();
}

export default function ContentRevenueTab() {
  const { data, isLoading } = useQuery<RevenueData>({
    queryKey: ["/api/content/revenue-attribution"],
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  if (isLoading) return <div className="space-y-3"><Skeleton className="h-24 w-full" /><Skeleton className="h-64 w-full" /></div>;

  if (!data || (data.attributedVideos.length === 0 && data.totalRevenue === 0)) {
    return (
      <Card data-testid="card-revenue-empty">
        <CardContent className="py-12 text-center">
          <DollarSign className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">No revenue data yet. Revenue will appear here as your videos generate income.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4" data-testid="section-revenue-attribution">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <DollarSign className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Revenue</p>
              <p className="text-lg font-bold font-display" data-testid="text-total-revenue">{formatCurrency(data.totalRevenue)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Video className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Videos w/ Revenue</p>
              <p className="text-lg font-bold font-display" data-testid="text-attributed-count">{data.attributedVideos.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Unattributed</p>
              <p className="text-lg font-bold font-display" data-testid="text-unattributed">{formatCurrency(data.unattributed)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-emerald-400" />
            Content-to-Revenue Attribution
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {data.attributedVideos.map((v) => (
              <div key={v.videoId} className="flex items-center justify-between gap-3 p-2 rounded-lg bg-muted/30" data-testid={`row-revenue-video-${v.videoId}`}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate" data-testid={`text-video-title-${v.videoId}`}>{v.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge variant="outline" className="text-[10px]">{v.type}</Badge>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Eye className="h-3 w-3" />{formatViews(v.views)}
                    </span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-emerald-400" data-testid={`text-video-revenue-${v.videoId}`}>{formatCurrency(v.attributedRevenue)}</p>
                  <p className="text-[10px] text-muted-foreground">${(v.revenuePerView ?? 0).toFixed(4)}/view</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
