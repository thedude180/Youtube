import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  HeartPulse,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Activity,
  Clock,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Cpu,
  Zap,
  Server,
} from "lucide-react";
import { AnimatedCounter } from "@/components/AnimatedCounter";

interface Diagnosis {
  rootCause?: string;
  [key: string]: unknown;
}

interface Subsystem {
  name: string;
  status: "healthy" | "degraded" | "failed" | "recovering";
  lastSuccess?: string;
  lastFailure?: string;
  consecutiveFailures: number;
  totalRuns: number;
  totalFailures: number;
  totalRecoveries: number;
  healingRate: number;
  lastError?: string;
  lastDiagnosis?: Diagnosis;
  circuitBreakerOpen: boolean;
  cooldownUntil?: string;
}

interface HealthData {
  overallStatus: string;
  overallScore: number;
  uptimePercent: number;
  totalSubsystems: number;
  healthyCount: number;
  degradedCount: number;
  failedCount: number;
  recoveringCount: number;
  totalSelfHeals: number;
  subsystems: Record<string, Subsystem>;
  lastFullScan?: string;
}

function scoreColor(score: number): string {
  if (score >= 80) return "text-emerald-400";
  if (score >= 50) return "text-amber-400";
  return "text-red-400";
}

function scoreStroke(score: number): string {
  if (score >= 80) return "stroke-emerald-400";
  if (score >= 50) return "stroke-amber-400";
  return "stroke-red-400";
}

function scoreGlow(score: number): string {
  if (score >= 80) return "0 0 30px rgba(52,211,153,0.3), 0 0 60px rgba(52,211,153,0.1)";
  if (score >= 50) return "0 0 30px rgba(251,191,36,0.3), 0 0 60px rgba(251,191,36,0.1)";
  return "0 0 30px rgba(248,113,113,0.3), 0 0 60px rgba(248,113,113,0.1)";
}

function statusBadgeVariant(status: string): string {
  switch (status?.toLowerCase()) {
    case "healthy":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/20";
    case "degraded":
      return "bg-amber-500/15 text-amber-400 border-amber-500/20";
    case "failed":
      return "bg-red-500/15 text-red-400 border-red-500/20";
    case "recovering":
      return "bg-blue-500/15 text-blue-400 border-blue-500/20";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function statusDotClasses(status: string): { bg: string; ping: string } {
  switch (status?.toLowerCase()) {
    case "healthy":
      return { bg: "bg-emerald-400", ping: "bg-emerald-400" };
    case "degraded":
      return { bg: "bg-amber-400", ping: "bg-amber-400" };
    case "failed":
      return { bg: "bg-red-400", ping: "bg-red-400" };
    case "recovering":
      return { bg: "bg-blue-400", ping: "bg-blue-400" };
    default:
      return { bg: "bg-muted-foreground", ping: "bg-muted-foreground" };
  }
}

function formatTs(ts: string | undefined): string {
  if (!ts) return "N/A";
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return ts;
  }
}

function cooldownRemaining(until: string | undefined): string | null {
  if (!until) return null;
  const diff = new Date(until).getTime() - Date.now();
  if (diff <= 0) return null;
  const secs = Math.ceil(diff / 1000);
  if (secs > 60) return `${Math.ceil(secs / 60)}m`;
  return `${secs}s`;
}

function ScoreGauge({ score }: { score: number }) {
  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center" data-testid="score-gauge">
      <svg width="180" height="180" viewBox="0 0 180 180" className="transform -rotate-90 w-[140px] h-[140px] sm:w-[180px] sm:h-[180px]">
        <circle
          cx="90"
          cy="90"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          className="text-muted/30"
        />
        <circle
          cx="90"
          cy="90"
          r={radius}
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={`${scoreStroke(score)} transition-all duration-1000 ease-out`}
          style={{ filter: `drop-shadow(${scoreGlow(score)})` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-3xl sm:text-4xl font-bold tabular-nums ${scoreColor(score)} transition-colors duration-500`} data-testid="score-value">
          <AnimatedCounter value={score} duration={800} formatter={(n) => String(n)} />
        </span>
        <span className="text-xs text-muted-foreground mt-1">SYSTEM SCORE</span>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  testId,
}: {
  label: string;
  value: number;
  icon: typeof CheckCircle2;
  color: string;
  testId: string;
}) {
  return (
    <Card data-testid={testId} className="border-muted/50" style={{ boxShadow: "0 0 15px rgba(0,0,0,0.1)" }}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Icon className={`h-4 w-4 ${color}`} />
            <span className="text-sm text-muted-foreground">{label}</span>
          </div>
          <span className={`text-2xl font-bold tabular-nums ${color}`}>
            <AnimatedCounter value={value} duration={600} formatter={(n) => String(n)} data-testid={`counter-${testId}`} />
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function SubsystemCard({ subsystem }: { subsystem: Subsystem }) {
  const dot = statusDotClasses(subsystem.status);
  const shouldPulse = subsystem.status === "healthy" || subsystem.status === "recovering";
  const cooldown = cooldownRemaining(subsystem.cooldownUntil);
  const isFailed = subsystem.status === "failed";
  const healingPct = Math.round((subsystem.healingRate ?? 0) * 100);
  const slug = subsystem.name?.toLowerCase().replace(/\s+/g, "-") ?? "unknown";

  return (
    <Card
      data-testid={`subsystem-card-${slug}`}
      className="border-muted/50 transition-all duration-300"
      style={{ boxShadow: "0 0 20px rgba(0,0,0,0.08)" }}
    >
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <span className="relative flex shrink-0" style={{ width: 10, height: 10 }}>
              {shouldPulse && (
                <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${dot.ping} opacity-75`} />
              )}
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${dot.bg}`} />
            </span>
            <span className="text-sm font-semibold truncate" data-testid={`subsystem-name-${slug}`}>
              {subsystem.name}
            </span>
          </div>
          <Badge
            variant="outline"
            className={`text-xs no-default-hover-elevate ${statusBadgeVariant(subsystem.status)}`}
            data-testid={`subsystem-status-${slug}`}
          >
            {subsystem.status}
          </Badge>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">Healing Rate</span>
            <span className="text-xs font-medium tabular-nums" data-testid={`subsystem-healing-${slug}`}>
              {healingPct}%
            </span>
          </div>
          <Progress value={healingPct} className="h-1.5" data-testid={`subsystem-healing-bar-${slug}`} />
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="space-y-0.5">
            <span className="text-muted-foreground flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 text-emerald-400" />
              Last OK
            </span>
            <span className="text-foreground/80 tabular-nums" data-testid={`subsystem-last-success-${slug}`}>
              {formatTs(subsystem.lastSuccess)}
            </span>
          </div>
          <div className="space-y-0.5">
            <span className="text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 text-red-400" />
              Last Fail
            </span>
            <span className="text-foreground/80 tabular-nums" data-testid={`subsystem-last-failure-${slug}`}>
              {formatTs(subsystem.lastFailure)}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 pt-1 border-t border-muted/30 flex-wrap">
          <div className="flex items-center gap-1.5" data-testid={`subsystem-circuit-${slug}`}>
            {subsystem.circuitBreakerOpen ? (
              <>
                <ShieldAlert className="h-4 w-4 text-red-400" />
                <span className="text-xs text-red-400 font-medium">OPEN</span>
                {cooldown && (
                  <span className="text-xs text-red-300/70 tabular-nums">({cooldown})</span>
                )}
              </>
            ) : (
              <>
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                <span className="text-xs text-emerald-400 font-medium">CLOSED</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
            <span className="tabular-nums" data-testid={`subsystem-runs-${slug}`}>
              {subsystem.totalRuns} runs
            </span>
            <span className="tabular-nums" data-testid={`subsystem-recoveries-${slug}`}>
              {subsystem.totalRecoveries} heals
            </span>
          </div>
        </div>

        {isFailed && (subsystem.lastError || subsystem.lastDiagnosis?.rootCause) && (
          <div
            className="p-2 rounded-md bg-red-500/10 border border-red-500/20 space-y-1"
            data-testid={`subsystem-error-${slug}`}
          >
            {subsystem.lastError && (
              <p className="text-xs text-red-400 break-words">
                <span className="font-semibold">Error:</span> {subsystem.lastError}
              </p>
            )}
            {subsystem.lastDiagnosis?.rootCause && (
              <p className="text-xs text-red-300/80 break-words">
                <span className="font-semibold">Root Cause:</span> {subsystem.lastDiagnosis.rootCause}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MissionControlSkeleton() {
  return (
    <div data-testid="mission-control-loading" className="space-y-6">
      <div className="flex flex-col items-center gap-4 py-8">
        <Skeleton className="h-[180px] w-[180px] rounded-full" />
        <Skeleton className="h-6 w-48" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-md" />
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-48 rounded-md" />
        ))}
      </div>
    </div>
  );
}

export default function MissionControl() {
  const { data: healthData, isLoading: healthLoading } = useQuery<HealthData>({
    queryKey: ["/api/system/health"],
    refetchInterval: 2 * 60_000,
    staleTime: 60_000,
  });

  const { data: enginesData, isLoading: enginesLoading } = useQuery<any>({
    queryKey: ["/api/health/engines"],
    refetchInterval: 2 * 60_000,
    staleTime: 60_000,
  });

  if (healthLoading && enginesLoading) {
    return <MissionControlSkeleton />;
  }

  const score = healthData?.overallScore ?? 0;
  const status = healthData?.overallStatus ?? "unknown";
  const uptime = healthData?.uptimePercent ?? 0;
  const totalHeals = healthData?.totalSelfHeals ?? 0;
  const subsystems = healthData?.subsystems ?? {};
  const subsystemList = Object.values(subsystems);

  return (
    <div data-testid="mission-control" className="space-y-6">
      <div
        className="relative rounded-md p-6 md:p-8 flex flex-col items-center gap-4"
        style={{
          background: "linear-gradient(135deg, rgba(88,28,135,0.15) 0%, rgba(30,58,138,0.15) 50%, rgba(15,23,42,0.3) 100%)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05), 0 0 40px rgba(88,28,135,0.08)",
        }}
        data-testid="mission-control-hero"
      >
        <div className="absolute inset-0 rounded-md overflow-hidden pointer-events-none">
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: "radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)",
              backgroundSize: "24px 24px",
            }}
          />
        </div>

        <ScoreGauge score={score} />

        <div className="flex flex-col items-center gap-2 z-10">
          <Badge
            variant="outline"
            className={`text-sm px-3 no-default-hover-elevate ${statusBadgeVariant(status)}`}
            data-testid="overall-status-badge"
          >
            <Activity className="h-3.5 w-3.5 mr-1.5" />
            {status.toUpperCase()}
          </Badge>

          <div className="flex items-center gap-4 flex-wrap justify-center text-sm text-muted-foreground mt-1">
            <span className="flex items-center gap-1.5" data-testid="uptime-display">
              <Zap className="h-3.5 w-3.5 text-emerald-400" />
              <AnimatedCounter
                value={Math.round(uptime * 100) / 100}
                duration={600}
                suffix="% uptime"
                formatter={(n) => n.toFixed(1)}
              />
            </span>
            <span className="flex items-center gap-1.5" data-testid="self-heals-display">
              <RefreshCw className="h-3.5 w-3.5 text-blue-400" />
              <AnimatedCounter value={totalHeals} duration={600} formatter={(n) => String(n)} suffix=" self-heals" />
            </span>
            <span className="flex items-center gap-1.5" data-testid="last-scan-display">
              <Clock className="h-3.5 w-3.5 text-purple-400" />
              {formatTs(healthData?.lastFullScan)}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Healthy"
          value={healthData?.healthyCount ?? 0}
          icon={CheckCircle2}
          color="text-emerald-400"
          testId="stat-healthy"
        />
        <StatCard
          label="Degraded"
          value={healthData?.degradedCount ?? 0}
          icon={AlertTriangle}
          color="text-amber-400"
          testId="stat-degraded"
        />
        <StatCard
          label="Failed"
          value={healthData?.failedCount ?? 0}
          icon={HeartPulse}
          color="text-red-400"
          testId="stat-failed"
        />
        <StatCard
          label="Recovering"
          value={healthData?.recoveringCount ?? 0}
          icon={RefreshCw}
          color="text-blue-400"
          testId="stat-recovering"
        />
      </div>

      {subsystemList.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Cpu className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Subsystems
            </h3>
            <Badge variant="secondary" className="text-xs no-default-hover-elevate">
              {subsystemList.length}
            </Badge>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {subsystemList.map((sub) => (
              <SubsystemCard key={sub.name} subsystem={sub} />
            ))}
          </div>
        </div>
      )}

      {enginesData?.engines?.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Server className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Engines
            </h3>
            <Badge variant="secondary" className="text-xs no-default-hover-elevate">
              {enginesData.engines.length}
            </Badge>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {enginesData.engines.map((engine: any, i: number) => {
              const engineSlug = engine.name?.toLowerCase().replace(/\s+/g, "-") ?? String(i);
              const isOk = ["healthy", "ok", "up"].includes(engine.status?.toLowerCase());
              return (
                <div
                  key={engine.name ?? i}
                  className="p-3 rounded-md bg-muted/20 space-y-2 border border-muted/30 transition-colors duration-300"
                  data-testid={`engine-card-${engineSlug}`}
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="relative flex shrink-0" style={{ width: 8, height: 8 }}>
                        {isOk && (
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                        )}
                        <span className={`relative inline-flex rounded-full h-2 w-2 ${isOk ? "bg-emerald-400" : "bg-red-400"}`} />
                      </span>
                      <span className="text-sm font-medium truncate">{engine.name ?? `Engine ${i + 1}`}</span>
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-xs no-default-hover-elevate ${
                        isOk ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-red-500/10 text-red-400 border-red-500/20"
                      }`}
                    >
                      {engine.status ?? "unknown"}
                    </Badge>
                  </div>
                  {engine.lastRun && (
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground tabular-nums">{formatTs(engine.lastRun)}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!healthData && !enginesData && !healthLoading && !enginesLoading && (
        <Card data-testid="mission-control-empty">
          <CardContent className="p-6">
            <div className="flex flex-col items-center gap-2 py-6">
              <Shield className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No system health data available.</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
