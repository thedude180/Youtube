import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { AnimatedCounter } from "@/components/AnimatedCounter";
import {
  Activity,
  Radio,
  Video,
  Zap,
  Shield,
  TrendingUp,
  Clock,
} from "lucide-react";

interface SystemHealth {
  overallScore: number;
  overallStatus: string;
  healthyCount: number;
  totalSubsystems: number;
}

interface LiveStreamHealth {
  streams: Array<{
    platform: string;
    channelName: string;
    status: string;
  }>;
}

export default function LiveStatusBar() {
  const { data: health } = useQuery<SystemHealth>({
    queryKey: ["/api/system/health"],
    refetchInterval: 2 * 60_000,
    staleTime: 60_000,
  });

  const { data: liveHealth } = useQuery<LiveStreamHealth>({
    queryKey: ["/api/verification/live-health"],
    refetchInterval: 2 * 60_000,
    staleTime: 60_000,
  });

  const { data: queueData } = useQuery<{ pending: number; processing: number; published: number }>({
    queryKey: ["/api/autopilot/stats"],
    refetchInterval: 2 * 60_000,
    staleTime: 60_000,
  });

  const score = health?.overallScore ?? 0;
  const liveStreams = liveHealth?.streams?.filter((s: any) => s.status === "live") || [];
  const pending = queueData?.pending ?? 0;
  const processing = queueData?.processing ?? 0;

  const scoreColor = score >= 80 ? "text-emerald-400" : score >= 50 ? "text-amber-400" : "text-red-400";
  const scoreBg = score >= 80 ? "bg-emerald-500/10" : score >= 50 ? "bg-amber-500/10" : "bg-red-500/10";

  return (
    <div className="flex items-center gap-2 overflow-x-auto scrollable-tabs py-1" data-testid="live-status-bar">
      <Badge variant="secondary" className={`shrink-0 text-[10px] gap-1.5 ${scoreBg} ${scoreColor} border-0`}>
        <Shield className="h-3 w-3" />
        <AnimatedCounter value={score} className="font-mono" />%
      </Badge>

      {liveStreams.length > 0 && (
        <Badge variant="secondary" className="shrink-0 text-[10px] gap-1.5 bg-red-500/10 text-red-400 border-0">
          <div className="relative">
            <Radio className="h-3 w-3" />
            <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
          </div>
          {liveStreams.length} LIVE
        </Badge>
      )}

      {(pending + processing) > 0 && (
        <Badge variant="secondary" className="shrink-0 text-[10px] gap-1.5 bg-primary/10 text-primary border-0">
          <Activity className="h-3 w-3" />
          <AnimatedCounter value={pending + processing} className="font-mono" /> in queue
        </Badge>
      )}

      <Badge variant="secondary" className="shrink-0 text-[10px] gap-1.5 border-0">
        <Zap className="h-3 w-3 text-primary" />
        {health?.healthyCount ?? 0}/{health?.totalSubsystems ?? 0} systems
      </Badge>

      <Badge variant="secondary" className="shrink-0 text-[10px] gap-1.5 border-0">
        <Clock className="h-3 w-3 text-muted-foreground" />
        {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </Badge>
    </div>
  );
}
