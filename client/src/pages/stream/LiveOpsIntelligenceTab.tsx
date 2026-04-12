import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Shield, Heart, AlertTriangle,
  Radio, Zap, CheckCircle2, XCircle,
} from "lucide-react";

function ErrorCard({ title, icon }: { title: string; icon: React.ReactNode }) {
  return (
    <Card className="card-empire" data-testid="card-error">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2 text-xs text-muted-foreground p-3 rounded bg-destructive/10">
          <XCircle className="h-4 w-4 text-destructive shrink-0" />
          <span>Unable to load data. Will retry automatically.</span>
        </div>
      </CardContent>
    </Card>
  );
}

function LiveOpsSummaryCard() {
  const { data, isLoading, isError } = useQuery<any>({
    queryKey: ["/api/live-ops/summary"],
    refetchInterval: 2 * 60_000,
  });

  if (isLoading) {
    return (
      <Card className="card-empire" data-testid="card-live-ops-loading">
        <CardHeader className="pb-3"><Skeleton className="h-5 w-40" /></CardHeader>
        <CardContent><Skeleton className="h-24 w-full" /></CardContent>
      </Card>
    );
  }

  if (isError || !data) return <ErrorCard title="Live Ops Status" icon={<Radio className="h-4 w-4 text-primary" />} />;

  const statusColors: Record<string, string> = {
    idle: "text-muted-foreground",
    pre_live: "text-amber-400",
    live: "text-emerald-400",
    post_processing: "text-blue-400",
  };

  return (
    <Card className="card-empire" data-testid="card-live-ops-summary">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Radio className="h-4 w-4 text-primary" />
          Live Ops Status
          <Badge variant="outline" className={`ml-auto text-[10px] ${statusColors[data.warRoom?.status] || ""}`}>
            {data.warRoom?.status || "idle"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="space-y-1" data-testid="stat-reputation">
            <div className="text-xs text-muted-foreground">Reputation</div>
            <div className={`text-xl font-bold ${(data.reputation?.score || 1) >= 0.8 ? "text-emerald-400" : (data.reputation?.score || 1) >= 0.5 ? "text-amber-400" : "text-red-400"}`}>
              {((data.reputation?.score || 1) * 100).toFixed(0)}%
            </div>
          </div>
          <div className="space-y-1" data-testid="stat-webhook-health">
            <div className="text-xs text-muted-foreground">Webhook Health</div>
            <div className="text-xl font-bold flex items-center gap-1">
              {((data.webhookHealth?.successRate || 1) * 100).toFixed(0)}%
              {(data.webhookHealth?.failedCount || 0) > 0 && (
                <AlertTriangle className="h-4 w-4 text-amber-400" />
              )}
            </div>
          </div>
          <div className="space-y-1" data-testid="stat-overrides">
            <div className="text-xs text-muted-foreground">Live Overrides</div>
            <div className="text-xl font-bold text-blue-400">{data.overrides?.total || 0}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TrustBudgetCard() {
  const { data, isLoading, isError } = useQuery<any>({
    queryKey: ["/api/live-ops/trust"],
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <Card className="card-empire">
        <CardHeader className="pb-3"><Skeleton className="h-5 w-40" /></CardHeader>
        <CardContent><Skeleton className="h-16 w-full" /></CardContent>
      </Card>
    );
  }

  if (isError || !data) return <ErrorCard title="Live Trust Budget" icon={<Shield className="h-4 w-4 text-primary" />} />;

  const budgets = [
    { label: "Title Changes", ...data.titleChanges, color: "text-blue-400" },
    { label: "Chat Actions", ...data.chatActions, color: "text-purple-400" },
    { label: "Engagement", ...data.engagementActions, color: "text-emerald-400" },
  ];

  return (
    <Card className="card-empire" data-testid="card-trust-budget">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          Live Trust Budget
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {budgets.map(b => (
            <div key={b.label} className="space-y-1" data-testid={`trust-${b.label.toLowerCase().replace(/\s+/g, '-')}`}>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{b.label}</span>
                <span className={b.color}>{b.used}/{b.max}</span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${b.remaining <= 1 ? "bg-red-500" : b.remaining <= 3 ? "bg-amber-500" : "bg-emerald-500"}`}
                  style={{ width: `${(b.remaining / b.max) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function BurnoutCard() {
  const { data, isLoading, isError } = useQuery<any>({
    queryKey: ["/api/live-ops/burnout/recovery"],
    refetchInterval: 120000,
  });

  if (isLoading) {
    return (
      <Card className="card-empire">
        <CardHeader className="pb-3"><Skeleton className="h-5 w-40" /></CardHeader>
        <CardContent><Skeleton className="h-16 w-full" /></CardContent>
      </Card>
    );
  }

  if (isError || !data) return <ErrorCard title="Wellness & Recovery" icon={<Heart className="h-4 w-4 text-primary" />} />;

  return (
    <Card className="card-empire" data-testid="card-burnout">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Heart className="h-4 w-4 text-primary" />
          Wellness & Recovery
        </CardTitle>
      </CardHeader>
      <CardContent>
        {data.suggestions?.length > 0 ? (
          <div className="space-y-2">
            {data.suggestions.map((s: string, i: number) => (
              <div key={i} className="flex items-start gap-2 text-xs p-2 rounded bg-muted/30" data-testid={`suggestion-${i}`}>
                <CheckCircle2 className="h-3 w-3 text-emerald-400 mt-0.5 shrink-0" />
                <span>{s}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground text-center py-3">No recovery suggestions needed</div>
        )}
      </CardContent>
    </Card>
  );
}

function DegradationPlaybooksCard() {
  const { data, isLoading, isError } = useQuery<any>({
    queryKey: ["/api/live-ops/playbooks"],
    refetchInterval: 300000,
  });

  if (isLoading) {
    return (
      <Card className="card-empire">
        <CardHeader className="pb-3"><Skeleton className="h-5 w-40" /></CardHeader>
        <CardContent><Skeleton className="h-16 w-full" /></CardContent>
      </Card>
    );
  }

  if (isError) return <ErrorCard title="Degradation Playbooks" icon={<Zap className="h-4 w-4 text-primary" />} />;

  const playbooks = data || [];

  return (
    <Card className="card-empire" data-testid="card-playbooks">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          Degradation Playbooks
          <Badge variant="outline" className="ml-auto text-[10px]">{playbooks.length} active</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {playbooks.map((p: any) => (
            <div key={p.id} className="flex items-center justify-between text-xs p-2 rounded bg-muted/30" data-testid={`playbook-${p.id}`}>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px]">{p.platform}</Badge>
                <span className="truncate">{p.failureType.replace(/_/g, " ")}</span>
              </div>
              <Badge variant={p.severity === "high" ? "destructive" : "secondary"} className="text-[10px] shrink-0">
                {p.severity}
              </Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function LiveOpsIntelligenceTab() {
  return (
    <div className="space-y-4" data-testid="live-ops-intelligence-tab">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <LiveOpsSummaryCard />
        <TrustBudgetCard />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <BurnoutCard />
        <DegradationPlaybooksCard />
      </div>
    </div>
  );
}
