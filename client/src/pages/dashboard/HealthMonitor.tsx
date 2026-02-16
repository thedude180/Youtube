import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { HeartPulse, Server, Wifi, WifiOff, Clock } from "lucide-react";

function statusBadgeClass(status: string): string {
  switch (status?.toLowerCase()) {
    case "healthy":
    case "ok":
    case "up":
      return "bg-emerald-500/10 text-emerald-500";
    case "degraded":
    case "warning":
    case "slow":
      return "bg-amber-500/10 text-amber-500";
    case "down":
    case "error":
    case "unhealthy":
      return "bg-red-500/10 text-red-500";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function statusDot(status: string): string {
  switch (status?.toLowerCase()) {
    case "healthy":
    case "ok":
    case "up":
      return "bg-emerald-400";
    case "degraded":
    case "warning":
    case "slow":
      return "bg-amber-400";
    case "down":
    case "error":
    case "unhealthy":
      return "bg-red-400";
    default:
      return "bg-muted-foreground";
  }
}

function formatTimestamp(ts: string | undefined): string {
  if (!ts) return "N/A";
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return ts;
  }
}

export default function HealthMonitor() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/health/engines"] });

  if (isLoading) {
    return (
      <div data-testid="health-monitor-loading" className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-md" />
          ))}
        </div>
        <Skeleton className="h-24 rounded-md" />
      </div>
    );
  }

  const engines: any[] = data?.engines ?? [];
  const circuitBreakers: any[] = data?.circuitBreakers ?? data?.externalServices ?? [];

  if (!engines.length && !circuitBreakers.length && !data) {
    return (
      <Card data-testid="health-monitor-empty">
        <CardContent className="p-6">
          <div className="flex flex-col items-center gap-2 py-6">
            <HeartPulse className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No engine health data available.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const healthyCount = engines.filter(
    (e) => ["healthy", "ok", "up"].includes(e.status?.toLowerCase())
  ).length;

  return (
    <div data-testid="health-monitor" className="space-y-4">
      <Card data-testid="card-engine-health-overview">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-base flex items-center gap-2">
              <HeartPulse className="w-4 h-4" />
              Engine Health
            </CardTitle>
            <Badge variant="secondary" className="text-xs no-default-hover-elevate">
              {healthyCount}/{engines.length} healthy
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {engines.map((engine: any, i: number) => (
              <div
                key={engine.name ?? i}
                className="p-3 rounded-md bg-muted/30 space-y-2"
                data-testid={`engine-card-${engine.name?.toLowerCase().replace(/\s+/g, '-') ?? i}`}
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full shrink-0 ${statusDot(engine.status)}`} />
                    <span className="text-sm font-semibold truncate">{engine.name ?? `Engine ${i + 1}`}</span>
                  </div>
                  <Badge
                    variant="secondary"
                    className={`text-xs no-default-hover-elevate ${statusBadgeClass(engine.status)}`}
                  >
                    {engine.status ?? "unknown"}
                  </Badge>
                </div>
                {engine.lastRun && (
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{formatTimestamp(engine.lastRun)}</span>
                  </div>
                )}
                {engine.details && (
                  <p className="text-xs text-muted-foreground" data-testid={`engine-details-${i}`}>
                    {engine.details}
                  </p>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {circuitBreakers.length > 0 && (
        <Card data-testid="card-external-services">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-base flex items-center gap-2">
                <Server className="w-4 h-4" />
                External Services
              </CardTitle>
              <Badge variant="secondary" className="text-xs no-default-hover-elevate">
                {circuitBreakers.filter((s: any) => ["closed", "healthy", "ok", "up"].includes(s.state?.toLowerCase() ?? s.status?.toLowerCase())).length}/{circuitBreakers.length} operational
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {circuitBreakers.map((service: any, i: number) => {
                const state = service.state ?? service.status ?? "unknown";
                const isHealthy = ["closed", "healthy", "ok", "up"].includes(state.toLowerCase());
                return (
                  <div
                    key={service.name ?? i}
                    className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/30 flex-wrap"
                    data-testid={`service-${service.name?.toLowerCase().replace(/\s+/g, '-') ?? i}`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {isHealthy ? (
                        <Wifi className="h-4 w-4 text-emerald-400 shrink-0" />
                      ) : (
                        <WifiOff className="h-4 w-4 text-red-400 shrink-0" />
                      )}
                      <span className="text-sm font-medium truncate">{service.name ?? `Service ${i + 1}`}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {service.failures != null && (
                        <span className="text-xs text-muted-foreground">{service.failures} failures</span>
                      )}
                      <Badge
                        variant="secondary"
                        className={`text-xs no-default-hover-elevate ${
                          isHealthy ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
                        }`}
                      >
                        {state}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
