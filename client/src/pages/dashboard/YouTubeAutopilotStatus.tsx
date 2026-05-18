import { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Video, Zap, Clock, AlertCircle, CheckCircle2, Brain,
  TrendingUp, TrendingDown, Radio, BarChart3, RefreshCw, CalendarDays, FlaskConical, Timer,
} from "lucide-react";
import { formatDistanceToNow, addDays, startOfDay, endOfDay, isToday, format } from "date-fns";

type CopilotMode = "off" | "suggest" | "auto-safe" | "manual-approval";

const MODE_LABELS: Record<CopilotMode, string> = {
  "off": "Off",
  "suggest": "Suggest",
  "auto-safe": "Auto-Safe",
  "manual-approval": "Manual Approval",
};

const MODE_COLORS: Record<CopilotMode, string> = {
  "off": "bg-muted-foreground/20 text-muted-foreground",
  "suggest": "bg-blue-500/20 text-blue-400",
  "auto-safe": "bg-emerald-500/20 text-emerald-400",
  "manual-approval": "bg-amber-500/20 text-amber-400",
};

function formatBucketLabel(bucket: string): string {
  if (!bucket || bucket === "unknown") return "—";
  return bucket
    .replace("long_", "")
    .replace("short_", "")
    .replace(/_/g, "–")
    .replace(/(\d+)/g, "$1") + " min";
}

function formatShortBucketLabel(bucket: string): string {
  if (!bucket) return "—";
  const map: Record<string, string> = {
    short_15_30: "8–20 s",
    short_31_45: "21–40 s",
    short_46_60: "41–59 s",
  };
  return map[bucket] ?? bucket;
}

function formatWindowLabel(w: string): string {
  if (!w) return "—";
  const map: Record<string, string> = {
    morning: "Morning (07–09:30)",
    afternoon: "Afternoon (13–16:30)",
    evening: "Evening (20:30–23)",
    late_night: "Late Night",
  };
  return map[w] ?? w;
}

// All autopilot queue types that count as YouTube Shorts (mirrors server-side definitions)
const SHORT_TYPES = new Set(["youtube_short", "platform_short", "platform_text_short", "vod-short"]);
// All autopilot queue types that count as long-form clips
const LONGFORM_TYPES = new Set(["auto-clip", "vod-long-form"]);

interface QuotaStatus {
  breakerActive: boolean;
  unitsUsed: number;
  quotaLimit: number;
  resetsAt: string;
}

function useQuotaCountdown(resetsAt: string | undefined): string {
  const [countdown, setCountdown] = useState<string>("");

  useEffect(() => {
    if (!resetsAt) return;

    function update() {
      const msLeft = new Date(resetsAt!).getTime() - Date.now();
      if (msLeft <= 0) {
        setCountdown("resetting…");
        return;
      }
      const totalSec = Math.floor(msLeft / 1000);
      const h = Math.floor(totalSec / 3600);
      const m = Math.floor((totalSec % 3600) / 60);
      const s = totalSec % 60;
      if (h > 0) {
        setCountdown(`${h}h ${m}m`);
      } else if (m > 0) {
        setCountdown(`${m}m ${s}s`);
      } else {
        setCountdown(`${s}s`);
      }
    }

    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [resetsAt]);

  return countdown;
}

function fmtDurSec(sec: number): string {
  if (!sec || sec < 60) return `${sec}s`;
  const m = Math.round(sec / 60);
  return `${m}m`;
}

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try { return format(new Date(iso), "h:mma").toLowerCase(); } catch { return "—"; }
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try { return format(new Date(iso), "MMM d · h:mma").toLowerCase(); } catch { return "—"; }
}

interface QueueItem {
  id: number;
  type: string;
  targetPlatform: string;
  status: string;
  scheduledAt: string | null;
  caption: string | null;
  sourceVideoTitle: string | null;
  metadata: {
    segmentStartSec?: number;
    segmentEndSec?: number;
    startSec?: number;
    endSec?: number;
    targetDurationSec?: number;
    actualDurationSec?: number;
  } | null;
}

interface DayData {
  date: Date;
  shorts: QueueItem[];
  longForms: QueueItem[];
}

interface QueueCalendarProps {
  maxShorts: number;
  maxLongForm: number;
}

function QueueCalendar({ maxShorts, maxLongForm }: QueueCalendarProps) {
  const { data: queueRaw = [], isLoading } = useQuery<QueueItem[]>({
    queryKey: ["/api/autopilot/queue?status=scheduled"],
    refetchInterval: 120_000,
  });

  const days: DayData[] = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(now, i);
      const dayStart = startOfDay(date).getTime();
      const dayEnd = endOfDay(date).getTime();

      const ytItems = queueRaw.filter(item => {
        if (item.targetPlatform !== "youtube") return false;
        if (!item.scheduledAt) return false;
        const t = new Date(item.scheduledAt).getTime();
        return t >= dayStart && t <= dayEnd;
      });

      const sortByTime = (a: QueueItem, b: QueueItem) =>
        (a.scheduledAt ? new Date(a.scheduledAt).getTime() : 0) -
        (b.scheduledAt ? new Date(b.scheduledAt).getTime() : 0);

      const shorts = ytItems.filter(i => SHORT_TYPES.has(i.type)).sort(sortByTime);
      const longForms = ytItems.filter(i => LONGFORM_TYPES.has(i.type)).sort(sortByTime);

      return { date, shorts, longForms };
    });
  }, [queueRaw]);

  if (isLoading) {
    return (
      <div className="rounded-lg bg-background/40 border border-border/20 p-3 space-y-2" data-testid="card-queue-calendar-loading">
        <Skeleton className="h-4 w-36" />
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full rounded-md" />
        ))}
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-background/40 border border-border/20 p-3 space-y-2" data-testid="card-queue-calendar">
      <span className="text-[11px] font-medium text-foreground flex items-center gap-1.5">
        <CalendarDays className="h-3.5 w-3.5 text-blue-400" />
        7-Day Schedule
      </span>

      <div className="space-y-1.5" data-testid="list-calendar-days">
        {days.map((day, i) => {
          const shortsFull = day.shorts.length >= maxShorts;
          const lfFull = day.longForms.length >= maxLongForm;
          const hasGap = !shortsFull || !lfFull;
          const today = isToday(day.date);
          const dayLabel = today ? "Today" : format(day.date, "EEE");
          const dateLabel = format(day.date, "MMM d");

          return (
            <div
              key={i}
              data-testid={`row-calendar-day-${i}`}
              className={`rounded-md px-2.5 py-2 space-y-1.5 text-[10px] transition-colors ${
                today
                  ? "bg-blue-500/10 border border-blue-500/20"
                  : hasGap
                  ? "bg-amber-500/5 border border-amber-500/15"
                  : "bg-background/30 border border-transparent"
              }`}
            >
              {/* Day header row */}
              <div className="flex items-center justify-between">
                <span className={`font-semibold text-[11px] ${today ? "text-blue-400" : "text-foreground"}`}>
                  {dayLabel}
                  <span className="font-normal text-muted-foreground ml-1.5">{dateLabel}</span>
                </span>
                <span className={`text-[9px] font-medium ${shortsFull && lfFull ? "text-emerald-400" : "text-amber-400"}`}>
                  {shortsFull && lfFull ? "✓ full" : "⚠ gaps"}
                </span>
              </div>

              {/* Shorts row — each slot is a visible chip showing time + length */}
              <div className="flex items-center gap-1 flex-wrap" data-testid={`shorts-slots-${i}`}>
                <span className="text-muted-foreground/50 shrink-0">
                  Shorts
                  <span
                    className={`ml-1 font-medium ${shortsFull ? "text-emerald-400" : "text-amber-400"}`}
                    data-testid={`shorts-count-${i}`}
                  >
                    {day.shorts.length}/{maxShorts}
                  </span>
                </span>
                {Array.from({ length: maxShorts }).map((_, si) => {
                  const item = day.shorts[si];
                  if (!item) {
                    return (
                      <span
                        key={si}
                        data-testid={`short-gap-${i}-${si}`}
                        className="px-1.5 py-0.5 rounded border border-amber-500/25 bg-amber-500/10 text-amber-400/70 italic"
                      >
                        gap
                      </span>
                    );
                  }
                  const meta = item.metadata ?? {};
                  const durSec =
                    (meta.segmentEndSec != null && meta.segmentStartSec != null
                      ? meta.segmentEndSec - meta.segmentStartSec
                      : null) ??
                    (meta.endSec != null && meta.startSec != null
                      ? meta.endSec - meta.startSec
                      : null);
                  const clipTitle = item.caption?.trim() || null;
                  const srcTitle = item.sourceVideoTitle?.trim() || null;
                  return (
                    <Popover key={si}>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          data-testid={`short-slot-${i}-${si}`}
                          className="px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 flex items-center gap-1 cursor-pointer hover:bg-emerald-500/30 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-400"
                        >
                          <span>▶</span>
                          <span data-testid={`short-time-${i}-${si}`}>{fmtTime(item.scheduledAt)}</span>
                          {durSec != null && durSec > 0 && (
                            <span className="text-emerald-400/60" data-testid={`short-dur-${i}-${si}`}>
                              · {durSec}s
                            </span>
                          )}
                        </button>
                      </PopoverTrigger>
                      <PopoverContent
                        side="top"
                        align="start"
                        className="w-56 p-2.5 space-y-1.5 text-[11px]"
                        data-testid={`short-slot-popover-${i}-${si}`}
                      >
                        <p className="font-semibold text-foreground text-[11px] flex items-center gap-1">
                          <span className="text-emerald-400">▶</span> YouTube Short
                        </p>
                        <div className="space-y-1 text-[10px]">
                          <div className="flex items-start gap-1.5">
                            <span className="text-muted-foreground/60 shrink-0 w-14">Publishes</span>
                            <span className="text-foreground font-medium" data-testid={`short-popover-time-${i}-${si}`}>
                              {fmtDateTime(item.scheduledAt)}
                            </span>
                          </div>
                          {durSec != null && durSec > 0 && (
                            <div className="flex items-start gap-1.5">
                              <span className="text-muted-foreground/60 shrink-0 w-14">Duration</span>
                              <span className="text-foreground" data-testid={`short-popover-dur-${i}-${si}`}>{durSec}s</span>
                            </div>
                          )}
                          {clipTitle && (
                            <div className="flex items-start gap-1.5">
                              <span className="text-muted-foreground/60 shrink-0 w-14">Title</span>
                              <span className="text-foreground leading-tight line-clamp-2" data-testid={`short-popover-title-${i}-${si}`}>{clipTitle}</span>
                            </div>
                          )}
                          {srcTitle && (
                            <div className="flex items-start gap-1.5">
                              <span className="text-muted-foreground/60 shrink-0 w-14">Source</span>
                              <span className="text-muted-foreground leading-tight line-clamp-2" data-testid={`short-popover-source-${i}-${si}`}>{srcTitle}</span>
                            </div>
                          )}
                        </div>
                      </PopoverContent>
                    </Popover>
                  );
                })}
              </div>

              {/* Long-form row — show all scheduled LF slots up to maxLongForm */}
              <div className="flex items-center gap-1 flex-wrap" data-testid={`longform-slot-${i}`}>
                <span className="text-muted-foreground/50 shrink-0">
                  LF
                  <span
                    className={`ml-1 font-medium ${lfFull ? "text-emerald-400" : "text-amber-400"}`}
                    data-testid={`longform-count-${i}`}
                  >
                    {day.longForms.length}/{maxLongForm}
                  </span>
                </span>
                {Array.from({ length: maxLongForm }).map((_, li) => {
                  const lf = day.longForms[li];
                  if (!lf) {
                    return (
                      <span
                        key={li}
                        className="px-1.5 py-0.5 rounded border border-amber-500/25 bg-amber-500/10 text-amber-400/70 italic"
                        data-testid={`longform-gap-${i}-${li}`}
                      >
                        no long-form
                      </span>
                    );
                  }
                  return (
                    <span
                      key={li}
                      className="px-1.5 py-0.5 rounded bg-violet-500/20 border border-violet-500/30 text-violet-300 flex items-center gap-1"
                      data-testid={`longform-chip-${i}-${li}`}
                    >
                      <span>▶</span>
                      <span className="font-medium" data-testid={`longform-duration-${i}-${li}`}>
                        {fmtDurSec(lf.metadata?.targetDurationSec || lf.metadata?.actualDurationSec || 0)}
                      </span>
                      <span className="text-violet-400/60" data-testid={`longform-time-${i}-${li}`}>
                        · {fmtTime(lf.scheduledAt)}
                      </span>
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 pt-1 border-t border-border/15">
        <span className="flex items-center gap-1 text-[9px] text-muted-foreground/60">
          <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/30 border border-emerald-500/40 inline-block" />
          Scheduled
        </span>
        <span className="flex items-center gap-1 text-[9px] text-muted-foreground/60">
          <span className="w-2.5 h-2.5 rounded-sm bg-amber-500/20 border border-amber-500/30 inline-block" />
          Gap
        </span>
        <span className="flex items-center gap-1 text-[9px] text-muted-foreground/60">
          <span className="w-2.5 h-2.5 rounded-sm bg-violet-500/30 border border-violet-500/40 inline-block" />
          Long-form
        </span>
      </div>
    </div>
  );
}

export default function YouTubeAutopilotStatus() {
  const { user } = useAuth();
  const { toast } = useToast();

  const { data, isLoading, refetch } = useQuery<any>({
    queryKey: ["/api/youtube/output-status"],
    refetchInterval: 60_000,
    enabled: !!user,
  });

  const { data: quotaData } = useQuery<QuotaStatus>({
    queryKey: ["/api/youtube/quota/status"],
    refetchInterval: 60_000,
    enabled: !!user,
  });

  const quotaCountdown = useQuotaCountdown(quotaData?.resetsAt);

  const cycleMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/youtube/learning/run-cycle"),
    onSuccess: () => {
      toast({ title: "Learning cycle triggered", description: "Analysing recent upload data…" });
      queryClient.invalidateQueries({ queryKey: ["/api/youtube/output-status"] });
    },
    onError: () => toast({ title: "Failed", description: "Could not trigger learning cycle.", variant: "destructive" }),
  });

  const modeMutation = useMutation({
    mutationFn: (mode: CopilotMode) => apiRequest("POST", "/api/youtube/copilot/mode", { mode }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/youtube/output-status"] });
    },
  });

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border/30 bg-card/20 p-4 space-y-3" data-testid="card-yt-autopilot-loading">
        <Skeleton className="h-5 w-48" />
        <div className="grid grid-cols-2 gap-2">
          <Skeleton className="h-16 rounded-lg" />
          <Skeleton className="h-16 rounded-lg" />
          <Skeleton className="h-16 rounded-lg" />
          <Skeleton className="h-16 rounded-lg" />
        </div>
      </div>
    );
  }

  if (!data) return null;

  const today = data.today ?? {};
  const nextPublish = data.nextPublish ?? {};
  const queue = data.queue ?? {};
  const learning = data.learning ?? {};
  const livestream = data.livestream ?? {};
  const copilot = data.copilot ?? {};
  const currentMode = (copilot.mode ?? "auto-safe") as CopilotMode;

  const nextShortMs = nextPublish.shortAt ? new Date(nextPublish.shortAt).getTime() - Date.now() : null;
  const nextLongMs = nextPublish.longFormAt ? new Date(nextPublish.longFormAt).getTime() - Date.now() : null;

  const shortsAtCap = today.shortsScheduled >= today.shortsMax;
  const lfAtCap = today.longFormScheduled >= today.longFormMax;

  return (
    <div className="rounded-xl border border-border/30 bg-card/20 p-4 space-y-4" data-testid="card-yt-autopilot">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Zap className="h-4 w-4 text-red-400" />
          YouTube Autopilot
        </h2>
        <div className="flex items-center gap-2">
          {livestream.active && (
            <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[10px] animate-pulse" data-testid="badge-live">
              <Radio className="h-2.5 w-2.5 mr-1" /> LIVE
            </Badge>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => refetch()}
            data-testid="button-refresh-autopilot"
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Today's schedule */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-background/40 border border-border/20 p-3" data-testid="card-shorts-today">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Shorts Today</span>
            {shortsAtCap
              ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              : <Clock className="h-3.5 w-3.5 text-muted-foreground/50" />}
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold text-foreground" data-testid="text-shorts-count">{today.shortsScheduled ?? 0}</span>
            <span className="text-xs text-muted-foreground">/ {today.shortsMax}</span>
          </div>
          {nextShortMs !== null && nextShortMs > 0 && !shortsAtCap && (
            <p className="text-[10px] text-muted-foreground mt-1" data-testid="text-next-short">
              Next: {formatDistanceToNow(new Date(nextPublish.shortAt), { addSuffix: true })}
            </p>
          )}
        </div>

        <div className="rounded-lg bg-background/40 border border-border/20 p-3" data-testid="card-longform-today">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Long-Form Today</span>
            {lfAtCap
              ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              : <Video className="h-3.5 w-3.5 text-muted-foreground/50" />}
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold text-foreground" data-testid="text-longform-count">{today.longFormScheduled ?? 0}</span>
            <span className="text-xs text-muted-foreground">/ {today.longFormMax}</span>
          </div>
          {nextLongMs !== null && nextLongMs > 0 && !lfAtCap && (
            <p className="text-[10px] text-muted-foreground mt-1" data-testid="text-next-longform">
              Next: {formatDistanceToNow(new Date(nextPublish.longFormAt), { addSuffix: true })}
            </p>
          )}
        </div>

        <div className="rounded-lg bg-background/40 border border-border/20 p-3" data-testid="card-queue-status">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">Queue</span>
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-bold text-foreground" data-testid="text-queue-backlog">{queue.backlog ?? 0}</span>
            <span className="text-[10px] text-muted-foreground">pending</span>
          </div>
          {(queue.failed ?? 0) > 0 && (
            <p className="text-[10px] text-red-400 mt-1 flex items-center gap-1" data-testid="text-queue-failed">
              <AlertCircle className="h-2.5 w-2.5" />{queue.failed} failed
            </p>
          )}
        </div>

        <div className="rounded-lg bg-background/40 border border-border/20 p-3" data-testid="card-quota-status">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">YouTube Quota</span>
            {!quotaData
              ? <Clock className="h-3.5 w-3.5 text-muted-foreground/40" />
              : quotaData.breakerActive
              ? <Timer className="h-3.5 w-3.5 text-red-400" />
              : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />}
          </div>
          {!quotaData ? (
            <Skeleton className="h-5 w-20 mt-1" data-testid="skeleton-quota" />
          ) : quotaData.breakerActive ? (
            <>
              <Badge className="text-[10px] bg-red-500/20 text-red-400 border-red-500/30 mb-1" data-testid="badge-quota">
                Exhausted
              </Badge>
              {quotaCountdown && (
                <p className="text-[10px] text-amber-400 mt-1 flex items-center gap-1" data-testid="text-quota-countdown">
                  <Clock className="h-2.5 w-2.5" />
                  Quota resets in {quotaCountdown}
                </p>
              )}
            </>
          ) : (
            <>
              <div className="flex items-baseline gap-1">
                <span className="text-lg font-bold text-foreground" data-testid="text-quota-used">
                  {quotaData.unitsUsed}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  / {quotaData.quotaLimit}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5" data-testid="text-quota-resets">
                Quota resets in {quotaCountdown || "—"}
              </p>
            </>
          )}
        </div>
      </div>

      {/* Learning summary */}
      <div className="rounded-lg bg-background/40 border border-border/20 p-3 space-y-2" data-testid="card-learning">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-foreground flex items-center gap-1.5">
            <Brain className="h-3.5 w-3.5 text-violet-400" />
            Learning Brain
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 text-[10px] px-2"
            onClick={() => cycleMutation.mutate()}
            disabled={cycleMutation.isPending}
            data-testid="button-run-learning-cycle"
          >
            {cycleMutation.isPending ? "Running…" : "Run Cycle"}
          </Button>
        </div>

        {learning.summary && (
          <p className="text-[10px] text-muted-foreground leading-relaxed" data-testid="text-learning-summary">
            {learning.summary}
          </p>
        )}

        <div className="grid grid-cols-2 gap-2 pt-1">
          <div>
            <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wide mb-0.5">Best Duration</p>
            <div className="flex items-center gap-1" data-testid="text-best-bucket">
              <TrendingUp className="h-3 w-3 text-emerald-400" />
              <span className="text-[11px] text-emerald-400 font-medium">
                {formatBucketLabel(learning.bestDurationBucket ?? "")}
              </span>
            </div>
          </div>
          <div>
            <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wide mb-0.5">Worst Duration</p>
            <div className="flex items-center gap-1" data-testid="text-worst-bucket">
              <TrendingDown className="h-3 w-3 text-red-400" />
              <span className="text-[11px] text-red-400 font-medium">
                {formatBucketLabel(learning.worstDurationBucket ?? "")}
              </span>
            </div>
          </div>
          {learning.bestPostingWindow && (
            <div className="col-span-2">
              <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wide mb-0.5">Best Window</p>
              <div className="flex items-center gap-1" data-testid="text-best-window">
                <BarChart3 className="h-3 w-3 text-blue-400" />
                <span className="text-[11px] text-blue-400 font-medium">
                  {formatWindowLabel(learning.bestPostingWindow)}
                </span>
              </div>
            </div>
          )}
        </div>

        {learning.topInsight && (
          <p className="text-[10px] text-muted-foreground/70 italic border-l-2 border-violet-400/30 pl-2" data-testid="text-top-insight">
            {learning.topInsight}
          </p>
        )}
      </div>

      {/* Length Experiment Results */}
      {((learning.buckets && learning.buckets.length > 0) || (learning.shortBuckets && learning.shortBuckets.length > 0)) && (
        <div className="rounded-lg bg-background/40 border border-border/20 p-3 space-y-2" data-testid="card-length-experiments">
          <span className="text-[11px] font-medium text-foreground flex items-center gap-1.5">
            <FlaskConical className="h-3.5 w-3.5 text-amber-400" />
            Length Experiment Results
          </span>

          {learning.buckets && learning.buckets.length > 0 && (
            <div>
              <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wide mb-1">Long-Form (ranked by performance)</p>
              <div className="space-y-1">
                {learning.buckets.map((b: any, i: number) => (
                  <div key={b.bucket} className="flex items-center gap-2" data-testid={`row-lf-bucket-${i}`}>
                    <span className={`text-[10px] font-medium w-14 shrink-0 ${i === 0 ? "text-emerald-400" : i === learning.buckets.length - 1 ? "text-red-400/70" : "text-muted-foreground"}`}>
                      {formatBucketLabel(b.bucket)}
                    </span>
                    <div className="flex-1 h-1.5 bg-border/20 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${i === 0 ? "bg-emerald-400" : i === learning.buckets.length - 1 ? "bg-red-400/50" : "bg-blue-400/60"}`}
                        style={{ width: `${Math.min(100, (b.avgScore / (learning.buckets[0]?.avgScore || 1)) * 100)}%` }}
                      />
                    </div>
                    <span className="text-[9px] text-muted-foreground/60 w-12 text-right shrink-0">
                      {b.avgScore.toFixed(1)} · {b.sampleCount}x
                    </span>
                    {b.avgViewPct > 0 && (
                      <span className="text-[9px] text-muted-foreground/50 w-10 text-right shrink-0">
                        {b.avgViewPct.toFixed(0)}% view
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {learning.shortBuckets && learning.shortBuckets.length > 0 && (
            <div>
              <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wide mb-1 mt-2">Shorts (ranked by performance)</p>
              <div className="space-y-1">
                {learning.shortBuckets.map((b: any, i: number) => (
                  <div key={b.bucket} className="flex items-center gap-2" data-testid={`row-short-bucket-${i}`}>
                    <span className={`text-[10px] font-medium w-14 shrink-0 ${i === 0 ? "text-emerald-400" : "text-muted-foreground"}`}>
                      {formatShortBucketLabel(b.bucket)}
                    </span>
                    <div className="flex-1 h-1.5 bg-border/20 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${i === 0 ? "bg-emerald-400" : "bg-blue-400/40"}`}
                        style={{ width: `${Math.min(100, (b.avgScore / (learning.shortBuckets[0]?.avgScore || 1)) * 100)}%` }}
                      />
                    </div>
                    <span className="text-[9px] text-muted-foreground/60 w-12 text-right shrink-0">
                      {b.avgScore.toFixed(1)} · {b.sampleCount}x
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(learning.buckets?.length === 0 && learning.shortBuckets?.length === 0) && (
            <p className="text-[10px] text-muted-foreground/60 italic">
              No experiment data yet — results appear after videos are published and analytics return.
            </p>
          )}
        </div>
      )}

      {/* Live copilot mode */}
      <div className="rounded-lg bg-background/40 border border-border/20 p-3 space-y-2" data-testid="card-copilot-mode">
        <span className="text-[11px] font-medium text-foreground flex items-center gap-1.5">
          <Radio className="h-3.5 w-3.5 text-red-400" />
          Chat Copilot Mode
        </span>
        <div className="flex flex-wrap gap-1.5">
          {(["off", "suggest", "auto-safe", "manual-approval"] as CopilotMode[]).map(m => (
            <button
              key={m}
              onClick={() => modeMutation.mutate(m)}
              disabled={modeMutation.isPending}
              data-testid={`button-copilot-mode-${m}`}
              className={`text-[10px] px-2 py-0.5 rounded-full border transition-all ${
                currentMode === m
                  ? `${MODE_COLORS[m]} border-current font-medium`
                  : "bg-transparent text-muted-foreground border-border/30 hover:border-border/60"
              }`}
            >
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>
        {livestream.active && (
          <p className="text-[10px] text-muted-foreground" data-testid="text-copilot-stream">
            Active stream: {livestream.title ?? `Stream #${livestream.streamId}`}
          </p>
        )}
      </div>

      {/* 7-day schedule calendar */}
      <QueueCalendar maxShorts={today.shortsMax ?? 3} maxLongForm={today.longFormMax ?? 1} />
    </div>
  );
}
