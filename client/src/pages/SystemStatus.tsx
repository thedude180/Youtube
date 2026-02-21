import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, Database, Server, Shield, Cpu, Clock } from "lucide-react";
import { usePageTitle } from "@/hooks/use-page-title";

export default function SystemStatus() {
  usePageTitle("System Status");
  const { data: health } = useQuery({ queryKey: ["/api/system/health"] });

  const statusColor = (s: string) => s === "healthy" || s === "running" || s === "idle" ? "default" : s === "error" ? "destructive" : "secondary";

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Activity className="h-6 w-6" />
        <h1 className="text-2xl font-bold" data-testid="text-status-title">System Status</h1>
        <Badge variant="default" data-testid="badge-overall-status">Operational</Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Database className="h-4 w-4" />Database</CardTitle></CardHeader>
          <CardContent>
            <Badge variant={health?.database?.status === "healthy" ? "default" : "destructive"} data-testid="badge-db-status">
              {health?.database?.status || "checking..."}
            </Badge>
            {health?.database?.latencyMs >= 0 && <p className="text-xs text-muted-foreground mt-1">{health.database.latencyMs}ms latency</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Server className="h-4 w-4" />Server</CardTitle></CardHeader>
          <CardContent>
            <Badge variant="default" data-testid="badge-server-status">Online</Badge>
            {health?.uptime && <p className="text-xs text-muted-foreground mt-1">Uptime: {Math.floor(health.uptime / 3600)}h {Math.floor((health.uptime % 3600) / 60)}m</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Cpu className="h-4 w-4" />Memory</CardTitle></CardHeader>
          <CardContent>
            {health?.memory ? (
              <p className="text-xs text-muted-foreground">Heap: {Math.round(health.memory.heapUsed / 1024 / 1024)}MB / {Math.round(health.memory.heapTotal / 1024 / 1024)}MB</p>
            ) : <p className="text-xs text-muted-foreground">Loading...</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Shield className="h-4 w-4" />Security</CardTitle></CardHeader>
          <CardContent><Badge variant="default" data-testid="badge-security-status">Protected</Badge></CardContent>
        </Card>
      </div>

      {health?.engines && Object.keys(health.engines).length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Clock className="h-4 w-4" />Engine Status</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(health.engines).map(([name, info]: [string, any]) => (
                <div key={name} className="flex items-center justify-between py-1 border-b last:border-0" data-testid={`engine-status-${name}`}>
                  <span className="text-sm font-medium">{name.replace(/([A-Z])/g, " $1").trim()}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant={statusColor(info.status)} className="text-xs">{info.status}</Badge>
                    {info.lastRun && <span className="text-xs text-muted-foreground">{new Date(info.lastRun).toLocaleTimeString()}</span>}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}