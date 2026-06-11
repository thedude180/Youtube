import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Infinity,
  ShieldCheck,
  ShieldAlert,
  Gamepad2,
  TrendingUp,
  Database,
  Zap,
  RefreshCw,
  Play,
  Clock,
  Youtube,
  Film,
} from "lucide-react";

interface InfinityStatus {
  queue: {
    shortsDays: number;
    longFormDays: number;
    freshCount: number;
    catalogCount: number;
  };
  quota: {
    uploadsToday: number;
    backlogWriteToday: number;
    remaining: number;
    limit: number;
    isExceeded: boolean;
  };
  gameFocus: {
    currentGame: string;
    daysQueued: number;
    itemsQueued: number;
  };
  backCatalog: {
    totalVideos: number;
    minedCount: number;
    minedPct: number;
  };
  velocity: {
    publishedLast7Days: number;
    averagePerDay: number;
  };
  guardian: {
    isHealthy: boolean;
    lastCheckAt: string | null;
    lastRefillAt: string | null;
    refillsToday: number;
  };
  seoEngine: {
    updatesToday: number;
    budgetRemaining: number;
    maxPerDay: number;
    lastRunAt: string | null;
    isRunning: boolean;
  };
}

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)   return "just now";
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs  < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function QueueBar({ label, days, threshold, target, icon: Icon }: {
  label: string; days: number; threshold: number; target: number; icon: React.ElementType;
}) {
  const pct     = Math.min(100, (days / target) * 100);
  const isLow   = days < threshold;
  const isWarn  = days < threshold * 1.5 && !isLow;
  const color   = isLow ? "bg-red-500" : isWarn ? "bg-yellow-500" : "bg-green-500";

  return (
    <div data-testid={`queue-bar-${label.toLowerCase().replace(/\s/g, "-")}`} className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
          {label}
        </div>
        <span className={`font-semibold ${isLow ? "text-red-500" : isWarn ? "text-yellow-500" : "text-green-500"}`}>
          {days.toFixed(1)}d
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>0</span>
        <span className="text-yellow-500/80">{threshold}d refill</span>
        <span>{target}d target</span>
      </div>
    </div>
  );
}

export default function InfinityMachine() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<InfinityStatus>({
    queryKey: ["/api/youtube/infinity/status"],
    refetchInterval: 2 * 60_000,
  });

  const runSeo = useMutation({
    mutationFn: () => apiRequest("POST", "/api/youtube/infinity/seo/run", {}),
    onSuccess: () => {
      toast({ title: "SEO engine started", description: "Updating worst-performing back-catalog videos" });
      setTimeout(() => qc.invalidateQueries({ queryKey: ["/api/youtube/infinity/status"] }), 3000);
    },
  });

  const runRefill = useMutation({
    mutationFn: () => apiRequest("POST", "/api/youtube/infinity/guardian/run", {}),
    onSuccess: () => {
      toast({ title: "Queue refill triggered", description: "Back-catalog runner pulling more content" });
      setTimeout(() => qc.invalidateQueries({ queryKey: ["/api/youtube/infinity/status"] }), 5000);
    },
  });

  if (isLoading || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Infinity className="h-5 w-5 text-violet-500" />
            Infinity Machine
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-40 flex items-center justify-center text-muted-foreground text-sm animate-pulse">
            Loading…
          </div>
        </CardContent>
      </Card>
    );
  }

  const overallHealthy = data.guardian.isHealthy && !data.quota.isExceeded
    && data.queue.shortsDays >= 3 && data.queue.longFormDays >= 7;

  const quotaUsed    = data.quota.limit - data.quota.remaining;
  const quotaUsedPct = Math.min(100, (quotaUsed / data.quota.limit) * 100);

  return (
    <Card data-testid="infinity-machine-panel">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Infinity className="h-5 w-5 text-violet-500" />
            Infinity Machine
          </CardTitle>
          <div className="flex items-center gap-2">
            {overallHealthy ? (
              <Badge variant="outline" className="gap-1 text-green-600 border-green-600/30 bg-green-500/10">
                <ShieldCheck className="h-3 w-3" /> Healthy
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1 text-yellow-600 border-yellow-600/30 bg-yellow-500/10">
                <ShieldAlert className="h-3 w-3" /> Attention
              </Badge>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Autonomous publishing loop — never stops, zero human input required
        </p>
      </CardHeader>

      <CardContent className="space-y-5">

        {/* Queue Health */}
        <div className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Queue Health</h4>
          <QueueBar label="Shorts"     days={data.queue.shortsDays}   threshold={3} target={5}  icon={Youtube} />
          <QueueBar label="Long-form"  days={data.queue.longFormDays} threshold={7} target={14} icon={Film}    />
          <div className="flex gap-4 text-xs text-muted-foreground pt-1">
            <span data-testid="text-fresh-count">
              🔴 Live/Fresh: <span className="font-medium text-foreground">{data.queue.freshCount}</span>
            </span>
            <span data-testid="text-catalog-count">
              📼 Back-catalog: <span className="font-medium text-foreground">{data.queue.catalogCount}</span>
            </span>
          </div>
        </div>

        <Separator />

        {/* Game Focus + Velocity */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1" data-testid="card-game-focus">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Gamepad2 className="h-3.5 w-3.5" />
              Game Focus
            </div>
            <p className="font-semibold text-sm truncate">{data.gameFocus.currentGame}</p>
            <p className="text-xs text-muted-foreground">
              {data.gameFocus.daysQueued.toFixed(1)}d queued ({data.gameFocus.itemsQueued} items)
            </p>
          </div>
          <div className="space-y-1" data-testid="card-velocity">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <TrendingUp className="h-3.5 w-3.5" />
              Velocity (7d)
            </div>
            <p className="font-semibold text-sm">{data.velocity.publishedLast7Days} videos</p>
            <p className="text-xs text-muted-foreground">{data.velocity.averagePerDay}/day avg</p>
          </div>
        </div>

        <Separator />

        {/* Quota Usage */}
        <div className="space-y-2" data-testid="section-quota">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Today's Quota</h4>
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Used / {data.quota.limit.toLocaleString()} units</span>
              <span className={`font-medium ${data.quota.isExceeded ? "text-red-500" : "text-foreground"}`}>
                {quotaUsed.toLocaleString()} used
              </span>
            </div>
            <Progress value={quotaUsedPct} className="h-2" />
          </div>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span data-testid="text-uploads-today">
              ↑ Uploads: <span className="font-medium text-foreground">{data.quota.uploadsToday}</span>
            </span>
            <span data-testid="text-seo-writes-today">
              ✏ SEO writes: <span className="font-medium text-foreground">{data.quota.backlogWriteToday}</span>
            </span>
            <span data-testid="text-quota-remaining">
              Remaining: <span className="font-medium text-foreground">{data.quota.remaining.toLocaleString()}</span>
            </span>
          </div>
        </div>

        <Separator />

        {/* Back Catalog */}
        <div className="space-y-2" data-testid="section-back-catalog">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Back Catalog</h4>
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Mined for content</span>
              <span className="font-medium">{data.backCatalog.minedCount}/{data.backCatalog.totalVideos} videos</span>
            </div>
            <Progress value={data.backCatalog.minedPct} className="h-2" />
          </div>
          <p className="text-xs text-muted-foreground">
            {data.backCatalog.minedPct}% mined
            {data.backCatalog.minedPct >= 90 && " — recycler will reset flags for infinite loop"}
          </p>
        </div>

        <Separator />

        {/* SEO Engine + Guardian */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2" data-testid="section-seo-engine">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Zap className="h-3.5 w-3.5 text-yellow-500" />
              <span className="font-semibold uppercase tracking-wide">SEO Engine</span>
            </div>
            <div className="text-xs space-y-0.5">
              <p>
                <span className="text-muted-foreground">Today: </span>
                <span className="font-medium">{data.seoEngine.updatesToday}/{data.seoEngine.maxPerDay}</span>
              </p>
              <p>
                <span className="text-muted-foreground">Budget left: </span>
                <span className="font-medium">{data.seoEngine.budgetRemaining}</span>
              </p>
              <p className="text-muted-foreground">
                <Clock className="inline h-3 w-3 mr-0.5" />
                {timeAgo(data.seoEngine.lastRunAt)}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs w-full"
              data-testid="button-run-seo"
              disabled={runSeo.isPending || data.seoEngine.isRunning}
              onClick={() => runSeo.mutate()}
            >
              {data.seoEngine.isRunning ? (
                <><RefreshCw className="h-3 w-3 mr-1 animate-spin" /> Running…</>
              ) : (
                <><Play className="h-3 w-3 mr-1" /> Run now</>
              )}
            </Button>
          </div>

          <div className="space-y-2" data-testid="section-guardian">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Database className="h-3.5 w-3.5 text-violet-500" />
              <span className="font-semibold uppercase tracking-wide">Guardian</span>
            </div>
            <div className="text-xs space-y-0.5">
              <p>
                <span className="text-muted-foreground">Refills today: </span>
                <span className="font-medium">{data.guardian.refillsToday}</span>
              </p>
              <p className="text-muted-foreground">
                Checked: <Clock className="inline h-3 w-3 mr-0.5" />{timeAgo(data.guardian.lastCheckAt)}
              </p>
              <p className="text-muted-foreground">
                Refilled: {timeAgo(data.guardian.lastRefillAt)}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs w-full"
              data-testid="button-run-refill"
              disabled={runRefill.isPending}
              onClick={() => runRefill.mutate()}
            >
              {runRefill.isPending ? (
                <><RefreshCw className="h-3 w-3 mr-1 animate-spin" /> Refilling…</>
              ) : (
                <><RefreshCw className="h-3 w-3 mr-1" /> Force refill</>
              )}
            </Button>
          </div>
        </div>

      </CardContent>
    </Card>
  );
}
