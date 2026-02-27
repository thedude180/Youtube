import { useState, lazy, Suspense } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Calendar, Zap, CheckCircle2, XCircle, Clock,
  ChevronRight, Sparkles, LayoutGrid, TrendingUp,
  Youtube, Twitch, Radio,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

const CalendarTab = lazy(() => import("./content/CalendarTab"));

interface HorizonData {
  totalItems: number;
  furthestDate: string | null;
  daysAhead: number;
  byPlatform: Record<string, number>;
  pendingApproval: {
    id: number;
    platform: string;
    type: string;
    title: string;
    scheduledAt: string;
  }[];
}

const PLATFORM_COLORS: Record<string, string> = {
  youtube: "text-red-400 bg-red-500/10 border-red-500/20",
  twitch: "text-purple-400 bg-purple-500/10 border-purple-500/20",
  tiktok: "text-pink-400 bg-pink-500/10 border-pink-500/20",
  x: "text-sky-400 bg-sky-500/10 border-sky-500/20",
  discord: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
  kick: "text-green-400 bg-green-500/10 border-green-500/20",
  rumble: "text-orange-400 bg-orange-500/10 border-orange-500/20",
  instagram: "text-rose-400 bg-rose-500/10 border-rose-500/20",
  other: "text-slate-400 bg-slate-500/10 border-slate-500/20",
};

const PLATFORM_DOTS: Record<string, string> = {
  youtube: "bg-red-400",
  twitch: "bg-purple-400",
  tiktok: "bg-pink-400",
  x: "bg-sky-400",
  discord: "bg-indigo-400",
  kick: "bg-green-400",
  rumble: "bg-orange-400",
  instagram: "bg-rose-400",
  other: "bg-slate-400",
};

function HorizonBanner({ data }: { data: HorizonData }) {
  const hasCoverage = data.totalItems > 0;
  const pct = Math.min(100, Math.round((data.daysAhead / 90) * 100));

  return (
    <div className="card-empire rounded-xl p-5 relative overflow-hidden" data-testid="card-ai-horizon">
      <div className="absolute inset-0 data-grid-bg opacity-50 pointer-events-none" />
      <div className="relative z-10">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center">
              <Zap className="w-5 h-5 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold holographic-text">AI Planning Horizon</h2>
                <span className="live-dot text-[10px] text-emerald-400 font-mono">LIVE</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {hasCoverage
                  ? `Your calendar is filled ${data.daysAhead} days ahead — content runs on autopilot`
                  : "No content scheduled yet — start a content loop to fill your calendar"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="text-center">
              <div className="text-2xl font-bold metric-display text-primary" data-testid="text-horizon-days">
                {hasCoverage ? data.daysAhead : 0}
              </div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Days Ahead</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold metric-display text-emerald-400" data-testid="text-horizon-total">
                {data.totalItems}
              </div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Items Queued</div>
            </div>
            {data.furthestDate && (
              <div className="text-center">
                <div className="text-sm font-bold metric-display text-amber-400" data-testid="text-horizon-date">
                  {format(new Date(data.furthestDate), "MMM d")}
                </div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Last Slot</div>
              </div>
            )}
          </div>
        </div>

        {hasCoverage && (
          <div className="mb-4">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
              <span>Coverage</span>
              <span>{pct}% of 90-day window</span>
            </div>
            <div className="h-2 bg-muted/40 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-1000"
                style={{
                  width: `${pct}%`,
                  background: "linear-gradient(90deg, hsl(265 80% 60%), hsl(220 80% 60%), hsl(142 70% 50%))",
                  boxShadow: "0 0 8px hsl(265 80% 60% / 0.5)",
                }}
                data-testid="bar-horizon-coverage"
              />
            </div>
          </div>
        )}

        {Object.keys(data.byPlatform).length > 0 && (
          <div className="flex flex-wrap gap-2" data-testid="grid-platform-breakdown">
            {Object.entries(data.byPlatform).map(([plat, count]) => (
              <div
                key={plat}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium ${PLATFORM_COLORS[plat] || PLATFORM_COLORS.other}`}
                data-testid={`pill-platform-${plat}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${PLATFORM_DOTS[plat] || "bg-slate-400"}`} />
                <span className="capitalize">{plat}</span>
                <span className="font-bold">{count}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ApprovalQueue({
  items,
  onAction,
  isPending,
}: {
  items: HorizonData["pendingApproval"];
  onAction: (id: number, action: "approve" | "reject") => void;
  isPending: boolean;
}) {
  if (items.length === 0) return null;

  return (
    <div className="space-y-3" data-testid="section-approval-queue">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          <h3 className="text-sm font-semibold text-amber-300">Pending Approval</h3>
          <Badge variant="outline" className="text-amber-400 border-amber-500/30 text-[10px]">
            {items.length}
          </Badge>
        </div>
        <p className="text-[10px] text-muted-foreground">AI-generated content awaiting your review</p>
      </div>

      <div className="grid gap-2">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-3 p-3 rounded-lg bg-amber-500/5 border border-amber-500/15 hover:border-amber-500/30 transition-colors"
            data-testid={`card-approval-${item.id}`}
          >
            <div
              className={`w-2 h-2 rounded-full flex-shrink-0 ${PLATFORM_DOTS[item.platform] || "bg-slate-400"}`}
            />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate text-foreground" data-testid={`text-approval-title-${item.id}`}>
                {item.title}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] text-muted-foreground capitalize">{item.platform}</span>
                <span className="text-[10px] text-muted-foreground">·</span>
                <span className="text-[10px] text-muted-foreground capitalize">{item.type}</span>
                <span className="text-[10px] text-muted-foreground">·</span>
                <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                  <Clock className="w-2.5 h-2.5" />
                  {formatDistanceToNow(new Date(item.scheduledAt), { addSuffix: true })}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                onClick={() => onAction(item.id, "approve")}
                disabled={isPending}
                data-testid={`button-approve-${item.id}`}
              >
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                Approve
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                onClick={() => onAction(item.id, "reject")}
                disabled={isPending}
                data-testid={`button-reject-${item.id}`}
              >
                <XCircle className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatPill({ label, value, color = "text-primary" }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/30 border border-border/40">
      <span className={`text-base font-bold metric-display ${color}`}>{value}</span>
      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</span>
    </div>
  );
}

export default function CalendarPage() {
  const { toast } = useToast();
  const [approvedIds, setApprovedIds] = useState<Set<number>>(new Set());

  const { data: horizon, isLoading: horizonLoading } = useQuery<HorizonData>({
    queryKey: ["/api/calendar/horizon"],
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, action }: { id: number; action: "approve" | "reject" }) =>
      apiRequest("PATCH", `/api/calendar/approve/${id}`, { action }).then(r => r.json()),
    onSuccess: (_, vars) => {
      setApprovedIds(prev => new Set([...prev, vars.id]));
      queryClient.invalidateQueries({ queryKey: ["/api/calendar/horizon"] });
      queryClient.invalidateQueries({ queryKey: ["/api/calendar/uploads"] });
      toast({
        title: vars.action === "approve" ? "Content approved" : "Content rejected",
        description: vars.action === "approve"
          ? "Item has been confirmed and scheduled for publishing."
          : "Item removed from the queue.",
      });
    },
  });

  const pendingItems = (horizon?.pendingApproval || []).filter(item => !approvedIds.has(item.id));

  return (
    <div className="min-h-screen animated-gradient-bg">
      <div className="max-w-[1400px] mx-auto px-4 py-6 space-y-6">

        <div className="relative overflow-hidden rounded-2xl border border-primary/20 p-6"
          style={{
            background: "linear-gradient(135deg, hsl(230 22% 7%) 0%, hsl(265 30% 10%) 50%, hsl(220 25% 7%) 100%)",
            boxShadow: "0 0 60px hsl(265 80% 60% / 0.08), 0 0 0 1px hsl(265 80% 60% / 0.05)",
          }}
          data-testid="header-calendar"
        >
          <div className="absolute inset-0 data-grid-bg opacity-30 pointer-events-none" />
          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <div className="w-9 h-9 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center empire-glow">
                  <Calendar className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h1 className="text-xl font-bold holographic-text" data-testid="text-page-title">
                    Content Calendar
                  </h1>
                  <p className="text-[11px] text-muted-foreground">
                    AI-orchestrated publishing schedule across all platforms
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {horizonLoading ? (
                <>
                  <Skeleton className="h-9 w-24" />
                  <Skeleton className="h-9 w-24" />
                  <Skeleton className="h-9 w-24" />
                </>
              ) : horizon ? (
                <>
                  <StatPill label="Queued" value={horizon.totalItems} color="text-primary" />
                  <StatPill label="Days Ahead" value={horizon.daysAhead} color="text-emerald-400" />
                  <StatPill
                    label="Platforms"
                    value={Object.keys(horizon.byPlatform).length}
                    color="text-amber-400"
                  />
                </>
              ) : null}
            </div>
          </div>
        </div>

        {horizonLoading ? (
          <Skeleton className="h-36 w-full rounded-xl" />
        ) : horizon ? (
          <HorizonBanner data={horizon} />
        ) : null}

        {!horizonLoading && pendingItems.length > 0 && (
          <Card className="border-amber-500/20 bg-amber-500/5">
            <CardContent className="p-4">
              <ApprovalQueue
                items={pendingItems}
                onAction={(id, action) => approveMutation.mutate({ id, action })}
                isPending={approveMutation.isPending}
              />
            </CardContent>
          </Card>
        )}

        <Card className="border-border/40">
          <CardContent className="p-4">
            <Suspense
              fallback={
                <div className="space-y-4">
                  <div className="flex gap-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={i} className="h-9 w-20 rounded-md" />
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-2">
                    {Array.from({ length: 35 }).map((_, i) => (
                      <Skeleton key={i} className="h-24 rounded-md" />
                    ))}
                  </div>
                </div>
              }
            >
              <CalendarTab />
            </Suspense>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
