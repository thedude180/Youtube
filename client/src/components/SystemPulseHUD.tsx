import { useQuery } from "@tanstack/react-query";
import { Activity, Database, HardDrive, Shield, Heart, Webhook, Brain, Clock, AlertCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";

type SystemState = "healthy" | "degraded" | "blocked" | "running" | "idle";

interface TrustBudgetEntry {
  agentName: string;
  remaining: number;
  total: number;
  deductionsCount: number;
  totalDeducted: number;
  exhausted: boolean;
  periodId: number;
}

interface PlaybookEntry {
  id: number;
  name: string;
  capability: string;
  level: string;
}

interface PulseData {
  status: SystemState;
  systems: Record<string, string>;
  trustBudget?: TrustBudgetEntry[];
  queueLatencyMs?: number;
  dlqDepth?: number;
  playbooks?: PlaybookEntry[];
  recentActivations?: Array<{ id: number; playbookId: number; status: string; activatedAt: string }>;
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
  workflow: Activity,
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
    queryKey: ["/api/admin/system-pulse"],
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
      <TooltipContent side="bottom" align="end" className="w-72 p-3">
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

          <div className="pt-1 border-t border-border space-y-0.5">
            <div className="flex items-center justify-between" data-testid="metric-queue-latency">
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3 text-muted-foreground" />
                <span className="text-[10px]">Queue Latency</span>
              </div>
              <span className="text-[10px] text-muted-foreground">{data.queueLatencyMs ?? 0}ms</span>
            </div>
            <div className="flex items-center justify-between" data-testid="metric-dlq-depth">
              <div className="flex items-center gap-1">
                <AlertCircle className="h-3 w-3 text-muted-foreground" />
                <span className="text-[10px]">DLQ Depth</span>
              </div>
              <span className={`text-[10px] ${(data.dlqDepth ?? 0) > 0 ? "text-red-400 font-medium" : "text-muted-foreground"}`}>
                {data.dlqDepth ?? 0}
              </span>
            </div>
          </div>

          {data.trustBudget && data.trustBudget.length > 0 && (
            <div className="pt-1 border-t border-border space-y-0.5">
              <span className="text-[10px] font-medium">Trust Budget</span>
              {data.trustBudget.map((b) => (
                <div key={b.periodId} className="flex items-center justify-between" data-testid={`trust-budget-${b.agentName}`}>
                  <span className="text-[10px] truncate max-w-[120px]">{b.agentName}</span>
                  <span className={`text-[10px] ${b.exhausted ? "text-red-400 font-medium" : "text-muted-foreground"}`}>
                    {b.remaining}/{b.total}
                  </span>
                </div>
              ))}
              {data.trustBudget.some((b) => b.exhausted) && (
                <span className="text-[10px] text-red-400">Budget exhausted — automation blocked</span>
              )}
            </div>
          )}

          {data.playbooks && data.playbooks.length > 0 && (
            <div className="pt-1 border-t border-border space-y-0.5">
              <span className="text-[10px] font-medium">Playbooks</span>
              {data.playbooks.map((p) => (
                <div key={p.id} className="flex items-center justify-between" data-testid={`playbook-${p.id}`}>
                  <span className="text-[10px] truncate max-w-[140px]">{p.name}</span>
                  <Badge variant="outline" className="text-[8px] h-3">{p.level}</Badge>
                </div>
              ))}
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
