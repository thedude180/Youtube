import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PulseOrb } from "@/components/PulseOrb";
import { AnimatedCounter } from "@/components/AnimatedCounter";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Radio,
  Target,
  Upload,
  RefreshCw,
  Zap,
  TrendingUp,
  Video,
  Eye,
  Flame,
  Clock,
} from "lucide-react";

interface PriorityItem {
  rank: number;
  name: string;
  status: string;
  active: boolean;
}

interface StreamExhaustData {
  activeStreamsWithContent: number;
  totalRemainingMinutes: number;
  totalExtractedMinutes: number;
  totalStreamMinutes: number;
  exhaustPercentage: number;
  batchesQueued: number;
  nextBatchEta: string;
  streams: Array<{
    id: number;
    title: string;
    totalMinutes: number;
    extractedMinutes: number;
    remainingMinutes: number;
    exhausted: boolean;
  }>;
}

interface PriorityDashboard {
  currentPriority: {
    mode: string;
    label: string;
    description: string;
    priorities: PriorityItem[];
  };
  stats: {
    todayContentQueued: number;
    vodsOptimizedThisWeek: number;
    liveStreamsThisWeek: number;
    totalContentCreatedThisWeek: number;
  };
}

const modeConfig: Record<string, { color: string; borderColor: string; icon: typeof Radio; pulseStatus: "active" | "warning" | "idle" | "error" }> = {
  livestream: { color: "text-red-400", borderColor: "border-red-500/30", icon: Radio, pulseStatus: "error" },
  "post-stream-harvest": { color: "text-amber-400", borderColor: "border-amber-500/30", icon: Zap, pulseStatus: "warning" },
  "daily-content": { color: "text-emerald-400", borderColor: "border-emerald-500/30", icon: Upload, pulseStatus: "active" },
  "vod-optimization": { color: "text-blue-400", borderColor: "border-blue-500/30", icon: RefreshCw, pulseStatus: "active" },
  idle: { color: "text-muted-foreground", borderColor: "border-muted/30", icon: Target, pulseStatus: "idle" },
};

const priorityIcons = [Radio, TrendingUp, Upload, Eye];

export default function PriorityCommandCenter() {
  const { data, isLoading } = useQuery<PriorityDashboard>({
    queryKey: ["/api/priority/status"],
    refetchInterval: 3 * 60_000,
  });

  const { data: exhaustData } = useQuery<StreamExhaustData>({
    queryKey: ["/api/stream-exhaust/status"],
    refetchInterval: 60000,
  });

  if (isLoading) {
    return <Skeleton className="h-44 w-full rounded-lg" />;
  }

  if (!data) return null;

  const { currentPriority, stats } = data;
  const config = modeConfig[currentPriority.mode] || modeConfig.idle;
  const ModeIcon = config.icon;

  return (
    <div className="space-y-3">
      <Card
        data-testid="card-priority-center"
        className={`gradient-border ${config.borderColor}`}
      >
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <PulseOrb status={config.pulseStatus} size="md" />
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <ModeIcon className={`h-4 w-4 ${config.color}`} />
                  <span data-testid="text-priority-mode" className={`text-sm font-bold tracking-wide uppercase ${config.color}`}>
                    {currentPriority.label}
                  </span>
                </div>
                <p data-testid="text-priority-description" className="text-xs text-muted-foreground mt-0.5 max-w-md">
                  {currentPriority.description}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="text-center">
                <div className="text-lg font-bold font-mono">
                  <AnimatedCounter value={stats.todayContentQueued} />
                </div>
                <div className="text-[10px] text-muted-foreground uppercase">Today</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold font-mono">
                  <AnimatedCounter value={stats.totalContentCreatedThisWeek} />
                </div>
                <div className="text-[10px] text-muted-foreground uppercase">This Week</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold font-mono">
                  <AnimatedCounter value={stats.vodsOptimizedThisWeek} />
                </div>
                <div className="text-[10px] text-muted-foreground uppercase">VODs Optimized</div>
              </div>
            </div>
          </div>

          <div className="space-y-1">
            {currentPriority.priorities.map((priority, i) => {
              const Icon = priorityIcons[i] || Target;
              return (
                <div
                  key={priority.rank}
                  data-testid={`priority-item-${priority.rank}`}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors ${
                    priority.active ? "bg-muted/50" : "opacity-50"
                  }`}
                >
                  <span className="text-[10px] font-mono text-muted-foreground w-4 shrink-0">
                    {priority.rank === 0 ? "!" : `#${priority.rank}`}
                  </span>
                  <Icon className={`h-3.5 w-3.5 shrink-0 ${priority.active ? config.color : "text-muted-foreground"}`} />
                  <span className="text-xs font-medium truncate">{priority.name}</span>
                  <Badge
                    variant={priority.active ? "default" : "secondary"}
                    className="ml-auto text-[9px] px-1.5 py-0 no-default-hover-elevate no-default-active-elevate shrink-0"
                  >
                    {priority.active ? (priority.rank === 0 && currentPriority.mode === "livestream" ? "LIVE" : "Active") : "Paused"}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground hidden sm:block max-w-[200px] truncate">
                    {priority.status.replace(/^(Active|Paused|Standby)\s*[—-]\s*/, "")}
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {exhaustData && exhaustData.totalStreamMinutes > 0 && (
        <Card data-testid="card-stream-exhaust" className="gradient-border border-purple-500/30">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Flame className="h-4 w-4 text-purple-400" />
                <span className="text-sm font-bold tracking-wide uppercase text-purple-400">
                  Stream Content Pipeline
                </span>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="text-center">
                  <div className="text-lg font-bold font-mono text-purple-400">
                    <AnimatedCounter value={exhaustData.exhaustPercentage} />%
                  </div>
                  <div className="text-[10px] text-muted-foreground uppercase">Extracted</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold font-mono">
                    <AnimatedCounter value={exhaustData.batchesQueued} />
                  </div>
                  <div className="text-[10px] text-muted-foreground uppercase">Batches</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold font-mono">
                    <AnimatedCounter value={exhaustData.activeStreamsWithContent} />
                  </div>
                  <div className="text-[10px] text-muted-foreground uppercase">Active Streams</div>
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  {Math.round(exhaustData.totalExtractedMinutes)} min used / {Math.round(exhaustData.totalStreamMinutes)} min total
                </span>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {Math.round(exhaustData.totalRemainingMinutes)} min remaining
                </span>
              </div>
              <Progress
                value={exhaustData.exhaustPercentage}
                className="h-2"
                data-testid="progress-stream-exhaust"
              />
            </div>

            {exhaustData.streams.length > 0 && (
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {exhaustData.streams.slice(0, 5).map((stream) => (
                  <div
                    key={stream.id}
                    data-testid={`stream-exhaust-item-${stream.id}`}
                    className="flex items-center gap-2 px-2 py-1 rounded-md bg-muted/30"
                  >
                    <Video className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="text-xs truncate flex-1">{stream.title}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {Math.round(stream.extractedMinutes)}/{stream.totalMinutes}m
                    </span>
                    <Badge
                      variant={stream.exhausted ? "secondary" : "default"}
                      className="text-[9px] px-1.5 py-0 no-default-hover-elevate no-default-active-elevate shrink-0"
                    >
                      {stream.exhausted ? "Done" : `${Math.round((stream.extractedMinutes / stream.totalMinutes) * 100)}%`}
                    </Badge>
                  </div>
                ))}
              </div>
            )}

            {exhaustData.activeStreamsWithContent === 0 && exhaustData.totalStreamMinutes > 0 && (
              <div className="text-center py-2">
                <p className="text-xs text-muted-foreground">All stream footage has been fully converted into content</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
