import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Users, Eye, Clock, TrendingUp, BarChart2 } from "lucide-react";

const RANGES = [
  { label: "7 days", value: "7" },
  { label: "30 days", value: "30" },
  { label: "90 days", value: "90" },
] as const;

function StatCard({ icon: Icon, label, value, delta, color = "text-primary" }: {
  icon: any; label: string; value: string; delta?: string; color?: string;
}) {
  return (
    <Card data-testid={`card-stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <CardContent className="pt-6">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg bg-muted ${color}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-sm text-muted-foreground">{label}</p>
            {delta && (
              <p className={`text-xs mt-0.5 ${delta.startsWith("+") ? "text-green-500" : "text-red-500"}`}>
                {delta} vs prior period
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MiniBar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-32 truncate text-muted-foreground text-xs">{label}</span>
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div className="h-full bg-red-500 rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted-foreground w-8 text-right">{pct}%</span>
    </div>
  );
}

export default function Analytics() {
  const [range, setRange] = useState("30");

  const { data: analytics, isLoading } = useQuery<any>({
    queryKey: ["/api/growth/analytics", range],
    queryFn: () => fetch(`/api/growth/analytics?days=${range}`).then((r) => r.json()),
  });

  const { data: snapshots = [] } = useQuery<any[]>({
    queryKey: ["/api/growth/snapshots", range],
    queryFn: () => fetch(`/api/growth/snapshots?days=${range}`).then((r) => r.json()),
  });

  const { data: topVideos = [] } = useQuery<any[]>({
    queryKey: ["/api/content/videos"],
  });

  const published = (topVideos as any[])
    .filter((v: any) => v.status === "published" && v.viewCount != null)
    .sort((a: any, b: any) => b.viewCount - a.viewCount)
    .slice(0, 5);

  const maxViews = published[0]?.viewCount ?? 1;

  const subs = analytics?.subscriberCount;
  const views = analytics?.totalViews;
  const watchHours = analytics?.watchHoursTotal;
  const ctr = analytics?.averageCtr;

  return (
    <div className="space-y-6" data-testid="page-analytics">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="text-muted-foreground mt-0.5">YouTube channel performance</p>
        </div>
        <div className="flex gap-1" data-testid="range-picker">
          {RANGES.map((r) => (
            <Button
              key={r.value}
              size="sm"
              variant={range === r.value ? "default" : "outline"}
              onClick={() => setRange(r.value)}
              data-testid={`btn-range-${r.value}`}
            >
              {r.label}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Key metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={Users} label="Subscribers" value={subs != null ? Number(subs).toLocaleString() : "—"} color="text-red-500" />
            <StatCard icon={Eye} label="Total Views" value={views != null ? Number(views).toLocaleString() : "—"} color="text-blue-500" />
            <StatCard icon={Clock} label="Watch Hours" value={watchHours != null ? Number(watchHours).toLocaleString() : "—"} color="text-green-500" />
            <StatCard icon={TrendingUp} label="Avg CTR" value={ctr != null ? `${Number(ctr).toFixed(1)}%` : "—"} color="text-purple-500" />
          </div>

          {/* Subscriber snapshots timeline */}
          {snapshots.length > 1 && (
            <Card data-testid="card-snapshots">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart2 className="w-4 h-4" />
                  Subscriber Growth
                  <Badge variant="outline" className="text-xs font-normal ml-1">last {range} days</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="relative h-32 flex items-end gap-1" data-testid="chart-subscribers">
                  {(() => {
                    const values = snapshots.map((s: any) => s.subscriberCount ?? 0);
                    const min = Math.min(...values);
                    const max = Math.max(...values);
                    const span = max - min || 1;
                    return snapshots.map((s: any, i: number) => {
                      const pct = ((s.subscriberCount ?? 0) - min) / span;
                      return (
                        <div
                          key={i}
                          className="flex-1 bg-red-500/80 rounded-t min-h-[2px]"
                          style={{ height: `${Math.max(4, pct * 100)}%` }}
                          title={`${new Date(s.recordedAt).toLocaleDateString()}: ${Number(s.subscriberCount).toLocaleString()}`}
                          data-testid={`bar-snapshot-${i}`}
                        />
                      );
                    });
                  })()}
                </div>
                <div className="flex justify-between text-xs text-muted-foreground mt-2">
                  <span>{new Date(snapshots[0]?.recordedAt).toLocaleDateString()}</span>
                  <span>{new Date(snapshots[snapshots.length - 1]?.recordedAt).toLocaleDateString()}</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Top videos by views */}
          {published.length > 0 && (
            <Card data-testid="card-top-videos">
              <CardHeader>
                <CardTitle className="text-sm">Top Videos by Views</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {published.map((v: any) => (
                  <MiniBar
                    key={v.id}
                    label={v.title}
                    value={v.viewCount}
                    max={maxViews}
                  />
                ))}
              </CardContent>
            </Card>
          )}

          {/* No data state */}
          {subs == null && views == null && snapshots.length === 0 && (
            <Card className="border-dashed" data-testid="card-no-analytics">
              <CardContent className="pt-10 pb-10 text-center">
                <BarChart2 className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  No analytics data yet. Connect your YouTube channel in Settings and data will appear here automatically.
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
