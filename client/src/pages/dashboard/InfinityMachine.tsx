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
  Users,
  Handshake,
  Video,
  RotateCcw,
  Calendar,
} from "lucide-react";

interface EngineStatus {
  running: boolean;
  lastScanTime?: number;
  lastCheck?: string;
  lastRun?: string;
  lastCount?: number;
  nextSlot?: string;
  lastBroadcast?: string;
}

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
  engines?: {
    brandPartnerships: EngineStatus;
    streamScheduler: EngineStatus;
    catalogReviver: EngineStatus;
  };
}

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)   return "just now";
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs  < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function timeFromNow(iso: string | null | undefined): string {
  if (!iso) return "–";
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "now";
  const hrs = Math.floor(diff / 3_600_000);
  if (hrs < 1) return `${Math.floor(diff / 60_000)}m`;
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
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

function EngineRow({
  icon: Icon,
  iconColor,
  label,
  running,
  meta,
  testId,
  action,
  actionLabel,
  actionPending,
}: {
  icon: React.ElementType;
  iconColor: string;
  label: string;
  running: boolean;
  meta: string;
  testId: string;
  action?: () => void;
  actionLabel?: string;
  actionPending?: boolean;
}) {
  return (
    <div data-testid={testId} className="flex items-center justify-between gap-3 py-2">
      <div className="flex items-center gap-2 min-w-0">
        <Icon className={`h-3.5 w-3.5 shrink-0 ${iconColor}`} />
        <div className="min-w-0">
          <p className="text-xs font-medium truncate">{label}</p>
          <p className="text-[10px] text-muted-foreground truncate">{meta}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Badge
          variant="outline"
          className={`text-[10px] px-1.5 py-0 ${running ? "text-green-600 border-green-600/30 bg-green-500/10" : "text-muted-foreground border-border/50"}`}
        >
          {running ? "Live" : "Idle"}
        </Badge>
        {action && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[10px]"
            data-testid={`button-run-${testId}`}
            disabled={actionPending}
            onClick={action}
          >
            {actionPending ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
            {actionLabel ?? "Run"}
          </Button>
        )}
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

  const invalidate = () => setTimeout(() => qc.invalidateQueries({ queryKey: ["/api/youtube/infinity/status"] }), 3000);

  const runSeo = useMutation({
    mutationFn: () => apiRequest("POST", "/api/youtube/infinity/seo/run", {}),
    onSuccess: () => { toast({ title: "SEO engine started", description: "Updating worst-performing back-catalog videos" }); invalidate(); },
  });

  const runRefill = useMutation({
    mutationFn: () => apiRequest("POST", "/api/youtube/infinity/guardian/run", {}),
    onSuccess: () => { toast({ title: "Queue refill triggered", description: "Back-catalog runner pulling more content" }); invalidate(); },
  });

  const runCommunity = useMutation({
    mutationFn: () => apiRequest("POST", "/api/youtube/infinity/community/run", {}),
    onSuccess: () => { toast({ title: "Community cycle started", description: "Posting update + poll for your channel" }); invalidate(); },
  });

  const runRevive = useMutation({
    mutationFn: () => apiRequest("POST", "/api/youtube/infinity/revive/run", {}),
    onSuccess: () => { toast({ title: "Revival started", description: "Re-promoting top back-catalog videos" }); invalidate(); },
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
  const eng = data.engines;

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
          Fully autonomous — zero human input required for content, community, sponsorships, and streams
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

        {/* Content Engines — SEO + Guardian */}
        <div className="space-y-1">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Content Engines</h4>

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
        </div>

        <Separator />

        {/* Autonomous Services Layer */}
        <div className="space-y-1">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Autonomous Services</h4>

          <EngineRow
            icon={Users}
            iconColor="text-blue-500"
            label="Community Manager"
            running={true}
            meta="Posts polls + replies comments every 8h"
            testId="section-community-manager"
            action={() => runCommunity.mutate()}
            actionLabel="Post now"
            actionPending={runCommunity.isPending}
          />

          <Separator className="my-0" />

          <EngineRow
            icon={Handshake}
            iconColor="text-emerald-500"
            label="Brand Partnerships"
            running={eng?.brandPartnerships?.running ?? false}
            meta={eng?.brandPartnerships?.lastScanTime
              ? `Last scan ${timeAgo(new Date(eng.brandPartnerships.lastScanTime).toISOString())}`
              : "Weekly sponsorship readiness + deal tracking"}
            testId="section-brand-partnerships"
          />

          <Separator className="my-0" />

          <EngineRow
            icon={Video}
            iconColor="text-rose-500"
            label="Back Catalog Growth"
            running={true}
            meta="Daily: SEO sweep + thumbnails + pinned comments + playlists"
            testId="section-back-catalog-growth"
          />

          <Separator className="my-0" />

          <EngineRow
            icon={Calendar}
            iconColor="text-orange-500"
            label="Stream Auto-Scheduler"
            running={eng?.streamScheduler?.running ?? false}
            meta={eng?.streamScheduler?.nextSlot
              ? `Next slot in ${timeFromNow(eng.streamScheduler.nextSlot)}`
              : "Creates weekly YouTube broadcasts + announces 24h before"}
            testId="section-stream-scheduler"
          />

          <Separator className="my-0" />

          <EngineRow
            icon={RotateCcw}
            iconColor="text-purple-500"
            label="Back Catalog Reviver"
            running={eng?.catalogReviver?.running ?? false}
            meta={eng?.catalogReviver?.lastRun
              ? `Last revival ${timeAgo(eng.catalogReviver.lastRun)} · ${eng.catalogReviver.lastCount ?? 0} videos`
              : "Weekly: re-promotes top 5 videos via community posts"}
            testId="section-catalog-reviver"
            action={() => runRevive.mutate()}
            actionLabel="Revive"
            actionPending={runRevive.isPending}
          />
        </div>

      </CardContent>
    </Card>
  );
}
