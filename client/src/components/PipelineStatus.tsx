import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Radio,
  Video,
  Search,
  Image,
  Moon,
  ArrowRight,
  Loader2,
} from "lucide-react";

interface LoopStatus {
  phase: string;
  activeStreamId: number | null;
  lastRunAt: number;
  consecutiveNoWork: number;
  backoffMs: number;
}

const PHASES = [
  { key: "livestream", label: "Live", icon: Radio, color: "text-red-400", bg: "bg-red-500/15" },
  { key: "stream-exhaust", label: "Extracting", icon: Video, color: "text-purple-400", bg: "bg-purple-500/15" },
  { key: "vod-optimize", label: "Optimizing", icon: Search, color: "text-blue-400", bg: "bg-blue-500/15" },
  { key: "thumbnail-gen", label: "Thumbnails", icon: Image, color: "text-pink-400", bg: "bg-pink-500/15" },
  { key: "idle", label: "Watching", icon: Moon, color: "text-muted-foreground", bg: "bg-muted" },
];

export default function PipelineStatus() {
  const { data: status } = useQuery<LoopStatus>({
    queryKey: ["/api/content-loop/status"],
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  if (!status) return null;

  const currentPhaseIndex = PHASES.findIndex(p => p.key === status.phase);
  const isActive = status.phase !== "idle";

  return (
    <Card className={`transition-all duration-500 ${isActive ? "border-primary/20 shimmer" : ""}`} data-testid="card-pipeline-status">
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Content Pipeline</span>
            {isActive && (
              <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary border-0 gap-1">
                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                Active
              </Badge>
            )}
          </div>
          {status.activeStreamId && (
            <Badge variant="secondary" className="text-[10px]">
              Stream #{status.activeStreamId}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          {PHASES.map((phase, i) => {
            const isCurrent = phase.key === status.phase;
            const isPast = currentPhaseIndex >= 0 && i < currentPhaseIndex;
            const Icon = phase.icon;

            return (
              <div key={phase.key} className="flex items-center gap-1 sm:gap-2 flex-1">
                <div
                  className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-all duration-300 flex-1 justify-center ${
                    isCurrent
                      ? `${phase.bg} ${phase.color} ring-1 ring-current/20`
                      : isPast
                      ? "bg-emerald-500/10 text-emerald-400"
                      : "bg-muted/50 text-muted-foreground/50"
                  }`}
                  data-testid={`pipeline-phase-${phase.key}`}
                >
                  <Icon className={`h-3.5 w-3.5 shrink-0 ${isCurrent ? "animate-pulse" : ""}`} />
                  <span className="text-[10px] font-medium hidden sm:inline">{phase.label}</span>
                </div>
                {i < PHASES.length - 1 && (
                  <ArrowRight className={`h-3 w-3 shrink-0 ${isPast ? "text-emerald-400/50" : "text-muted-foreground/20"}`} />
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
