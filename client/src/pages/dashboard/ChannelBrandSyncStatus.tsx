import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import {
  RefreshCw, CheckCircle2, Clock, Sparkles,
  Film, Radio, Shield, Image, Loader2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface BrandSyncStatus {
  lastRunAt: string | null;
  nextRunEta: string | null;
  isRunning: boolean;
  lastRunResult: {
    shortsUpdated: number;
    replaysUpdated: number;
    brandFixes: number;
    thumbnailsGenerated: number;
    skipped: number;
  } | null;
}

export default function ChannelBrandSyncStatus() {
  const { toast } = useToast();

  const { data: status, isLoading } = useQuery<BrandSyncStatus>({
    queryKey: ["/api/youtube/brand-sync/status"],
    refetchInterval: 15_000,
  });

  const runMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/youtube/brand-sync/run"),
    onSuccess: () => {
      toast({ title: "Brand sync started", description: "Sweeping Shorts, replays, and brand consistency…" });
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ["/api/youtube/brand-sync/status"] }), 1500);
    },
    onError: () => toast({ title: "Failed to start brand sync", variant: "destructive" }),
  });

  if (isLoading) return <Skeleton className="h-36 w-full rounded-xl" />;
  if (!status) return null;

  const result = status.lastRunResult;
  const isRunning = status.isRunning || runMutation.isPending;
  const totalChanges = result
    ? result.shortsUpdated + result.replaysUpdated + result.brandFixes + result.thumbnailsGenerated
    : 0;

  const metrics = result
    ? [
        { icon: Film,        label: "Shorts SEO",   value: result.shortsUpdated,       color: "text-red-400"     },
        { icon: Radio,       label: "Replay SEO",   value: result.replaysUpdated,      color: "text-blue-400"    },
        { icon: Shield,      label: "Brand fixes",  value: result.brandFixes,          color: "text-amber-400"   },
        { icon: Image,       label: "Thumbnails",   value: result.thumbnailsGenerated, color: "text-emerald-400" },
      ]
    : [];

  return (
    <Card
      className="p-4 border border-border/40 bg-card/50"
      data-testid="card-channel-brand-sync"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-foreground" data-testid="text-brand-sync-title">
              Channel Brand Sync
            </p>
            <p className="text-[11px] text-muted-foreground">
              Shorts SEO · Replay SEO · Brand consistency · Thumbnails
            </p>
          </div>
        </div>

        <Button
          size="sm"
          variant="outline"
          onClick={() => runMutation.mutate()}
          disabled={isRunning}
          data-testid="button-brand-sync-run"
          className="h-7 text-xs flex-shrink-0"
        >
          {isRunning
            ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Running…</>
            : <><RefreshCw className="h-3 w-3 mr-1" />Run now</>
          }
        </Button>
      </div>

      {/* Status row */}
      <div className="flex items-center gap-2 mb-3">
        {isRunning ? (
          <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-[10px]">
            <Loader2 className="h-2.5 w-2.5 mr-1 animate-spin" />Running
          </Badge>
        ) : status.lastRunAt ? (
          <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]">
            <CheckCircle2 className="h-2.5 w-2.5 mr-1" />
            Last run {formatDistanceToNow(new Date(status.lastRunAt), { addSuffix: true })}
          </Badge>
        ) : (
          <Badge className="bg-muted/40 text-muted-foreground text-[10px]">
            <Clock className="h-2.5 w-2.5 mr-1" />Awaiting first sweep
          </Badge>
        )}

        {status.nextRunEta && !isRunning && (
          <span className="text-[10px] text-muted-foreground/60">
            · Next {formatDistanceToNow(new Date(status.nextRunEta), { addSuffix: true })}
          </span>
        )}
      </div>

      {/* Last run metrics */}
      {result && (
        <div className="grid grid-cols-4 gap-2" data-testid="grid-brand-sync-metrics">
          {metrics.map(({ icon: Icon, label, value, color }) => (
            <div
              key={label}
              className="flex flex-col items-center gap-0.5 rounded-lg bg-muted/30 px-2 py-2"
            >
              <Icon className={`h-3.5 w-3.5 ${color}`} />
              <span className={`text-base font-bold tabular-nums ${color}`}>{value}</span>
              <span className="text-[9px] text-muted-foreground/70 text-center leading-tight">{label}</span>
            </div>
          ))}
        </div>
      )}

      {result && totalChanges === 0 && (
        <p className="text-[11px] text-muted-foreground/60 mt-2">
          All {result.skipped} videos already on-brand — nothing to update.
        </p>
      )}

      {!result && !isRunning && (
        <p className="text-[11px] text-muted-foreground/60">
          First sweep runs ~25 min after boot. Click "Run now" to trigger immediately.
        </p>
      )}
    </Card>
  );
}
