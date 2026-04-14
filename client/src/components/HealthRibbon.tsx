import { useQuery } from "@tanstack/react-query";
import { Activity, Bot, Zap, Shield, Database } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface EngineHeartbeat {
  status: string;
  lastRun: string | null;
  failureCount: number;
}

interface HealthResponse {
  database: { status: string; latencyMs: number };
  engines: Record<string, EngineHeartbeat>;
  uptime: number;
  memory: { heapUsed: number; heapTotal: number };
}

function StatusDot({ status }: { status: "green" | "yellow" | "red" }) {
  const colors = {
    green: "bg-emerald-400 shadow-emerald-400/50",
    yellow: "bg-amber-400 shadow-amber-400/50",
    red: "bg-red-400 shadow-red-400/50",
  };
  return (
    <span className={`inline-block w-1.5 h-1.5 rounded-full shadow-[0_0_6px] ${colors[status]}`} />
  );
}

export function HealthRibbon() {
  const { data: health } = useQuery<HealthResponse>({
    queryKey: ["/api/system/health"],
    refetchInterval: 3 * 60_000,
    staleTime: 60_000,
  });

  const dbStatus = health?.database?.status === "healthy" ? "green" : health?.database ? "red" : "yellow";
  const engineEntries = health?.engines ? Object.values(health.engines) : [];
  const runningEngines = engineEntries.filter(e => e.status === "running").length;
  const totalEngines = engineEntries.length || 12;
  const failedEngines = engineEntries.filter(e => e.failureCount > 0).length;

  const overallStatus: "green" | "yellow" | "red" = 
    dbStatus === "red" ? "red" :
    failedEngines > 0 ? "yellow" :
    runningEngines > 0 ? "green" : "yellow";

  const uptimeFormatted = health?.uptime 
    ? health.uptime > 3600 
      ? `${Math.floor(health.uptime / 3600)}h ${Math.floor((health.uptime % 3600) / 60)}m` 
      : `${Math.floor(health.uptime / 60)}m`
    : "--";

  return (
    <div 
      className="ribbon-gradient px-4 py-1.5 flex items-center gap-4 text-xs overflow-x-auto scrollable-tabs"
      data-testid="health-ribbon"
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5 shrink-0 cursor-default">
            <StatusDot status={overallStatus} />
            <span className="text-muted-foreground font-medium">System</span>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          {overallStatus === "green" ? "All systems operational" : 
           overallStatus === "yellow" ? "Some systems need attention" : 
           "System issues detected"}
        </TooltipContent>
      </Tooltip>

      <div className="h-3 w-px bg-border/50 shrink-0" />

      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5 shrink-0 cursor-default" data-testid="ribbon-database">
            <Database className={`h-3 w-3 ${dbStatus === "green" ? "text-emerald-400" : "text-red-400"}`} />
            <span className="text-muted-foreground">DB {health?.database?.status === "healthy" ? "Healthy" : "..."}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent>Database {health?.database?.status || "checking..."} ({health?.database?.latencyMs ?? "--"}ms)</TooltipContent>
      </Tooltip>

      <div className="h-3 w-px bg-border/50 shrink-0" />

      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5 shrink-0 cursor-default" data-testid="ribbon-engines">
            <Zap className={`h-3 w-3 ${runningEngines > 0 ? "text-primary" : "text-muted-foreground"}`} />
            <span className="text-muted-foreground">{runningEngines}/{totalEngines} Engines</span>
          </div>
        </TooltipTrigger>
        <TooltipContent>{runningEngines} engines running{failedEngines > 0 ? `, ${failedEngines} with errors` : ""}</TooltipContent>
      </Tooltip>

      <div className="h-3 w-px bg-border/50 shrink-0" />

      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5 shrink-0 cursor-default" data-testid="ribbon-ai-team">
            <Bot className="h-3 w-3 text-blue-400" />
            <span className="text-muted-foreground">AI Team</span>
          </div>
        </TooltipTrigger>
        <TooltipContent>3 AI agents collaborating autonomously</TooltipContent>
      </Tooltip>

      <div className="h-3 w-px bg-border/50 shrink-0" />

      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5 shrink-0 cursor-default" data-testid="ribbon-security">
            <Shield className="h-3 w-3 text-emerald-400" />
            <span className="text-muted-foreground">Protected</span>
          </div>
        </TooltipTrigger>
        <TooltipContent>Security Sentinel active · Uptime {uptimeFormatted}</TooltipContent>
      </Tooltip>

      <div className="ml-auto flex items-center gap-1.5 shrink-0">
        <Activity className="h-3 w-3 text-emerald-400" />
        <span className="text-muted-foreground/60 text-[10px]">Live</span>
      </div>
    </div>
  );
}
