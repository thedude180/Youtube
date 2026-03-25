import { useQuery } from "@tanstack/react-query";
import { Activity, Database, HardDrive, Shield, Heart, Webhook, Brain } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";

type SystemState = "healthy" | "degraded" | "blocked" | "running" | "idle";

interface PulseData {
  status: SystemState;
  systems: Record<string, string>;
  trustBudget?: Array<{ category: string; budgetRemaining: number; exhausted: boolean }>;
  timestamp: string;
}

const STATE_COLORS: Record<SystemState, string> = {
  healthy: "bg-emerald-500",
  degraded: "bg-amber-500",
  blocked: "bg-red-500",
  running: "bg-blue-500",
  idle: "bg-zinc-400",
};

const STATE_LABELS: Record<SystemState, string> = {
  healthy: "Healthy",
  degraded: "Degraded",
  blocked: "Blocked",
  running: "Running",
  idle: "Idle",
};

const SYSTEM_ICONS: Record<string, typeof Activity> = {
  database: Database,
  storage: HardDrive,
  kernel: Shield,
  trust_budget: Heart,
  webhook: Webhook,
  learning: Brain,
};

function StatusDot({ state }: { state: SystemState }) {
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${STATE_COLORS[state] || STATE_COLORS.idle}`}
      data-testid={`status-dot-${state}`}
    />
  );
}

export function SystemPulseHUD() {
  const { data, isLoading } = useQuery<PulseData>({
    queryKey: ["/api/kernel/pulse"],
    refetchInterval: 30000,
  });

  if (isLoading || !data) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1" data-testid="system-pulse-hud-loading">
        <Activity className="h-3 w-3 text-muted-foreground animate-pulse" />
        <span className="text-[10px] text-muted-foreground">Checking...</span>
      </div>
    );
  }

  const overallState = (data.status || "idle") as SystemState;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-accent/50 transition-colors"
          data-testid="system-pulse-hud"
          aria-label={`System status: ${STATE_LABELS[overallState]}`}
        >
          <StatusDot state={overallState} />
          <span className="text-[10px] font-medium text-muted-foreground hidden sm:inline">
            {STATE_LABELS[overallState]}
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="end" className="w-64 p-3">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold">System Pulse</span>
            <Badge variant={overallState === "healthy" ? "default" : "destructive"} className="text-[9px] h-4" data-testid="badge-overall-status">
              {STATE_LABELS[overallState]}
            </Badge>
          </div>
          <div className="space-y-1">
            {Object.entries(data.systems || {}).map(([name, state]) => {
              const Icon = SYSTEM_ICONS[name] || Activity;
              const s = (state as SystemState) || "idle";
              return (
                <div key={name} className="flex items-center justify-between gap-2" data-testid={`system-status-${name}`}>
                  <div className="flex items-center gap-1.5">
                    <Icon className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[11px] capitalize">{name.replace(/_/g, " ")}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <StatusDot state={s} />
                    <span className="text-[10px] text-muted-foreground">{STATE_LABELS[s]}</span>
                  </div>
                </div>
              );
            })}
          </div>
          {data.trustBudget && data.trustBudget.some((b) => b.exhausted) && (
            <div className="pt-1 border-t border-border">
              <span className="text-[10px] text-red-400">Trust budget exhausted in: {data.trustBudget.filter((b) => b.exhausted).map((b) => b.category.replace(/_/g, " ")).join(", ")}</span>
            </div>
          )}
          <div className="text-[9px] text-muted-foreground/60">
            Updated {new Date(data.timestamp).toLocaleTimeString()}
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
