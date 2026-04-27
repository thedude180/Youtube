import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Shield, Brain, Activity, Crosshair, Eye,
  TrendingUp, AlertTriangle, CheckCircle2, Gauge,
} from "lucide-react";
import AIToolsTab from "./AIToolsTab";

function GovernanceSummaryCard() {
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/content-core/governance/summary"],
    refetchInterval: 60000,
  });

  if (isLoading) {
    return (
      <Card className="card-empire" data-testid="card-governance-loading">
        <CardHeader className="pb-3"><Skeleton className="h-5 w-40" /></CardHeader>
        <CardContent><Skeleton className="h-24 w-full" /></CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const immunity = data.channelImmunity ?? 0;
  const immunityColor = immunity >= 0.8 ? "text-emerald-400" : immunity >= 0.5 ? "text-amber-400" : "text-red-400";

  return (
    <Card className="card-empire" data-testid="card-governance-summary">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          Governance & Trust
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="space-y-1" data-testid="stat-channel-immunity">
            <div className="text-xs text-muted-foreground">Channel Immunity</div>
            <div className={`text-xl font-bold ${immunityColor}`}>
              {(immunity * 100).toFixed(0)}%
            </div>
          </div>
          <div className="space-y-1" data-testid="stat-eval-violations">
            <div className="text-xs text-muted-foreground">Eval Violations</div>
            <div className="text-xl font-bold flex items-center gap-1">
              {data.evalViolations ?? 0}
              {(data.evalViolations ?? 0) === 0 ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-amber-400" />
              )}
            </div>
          </div>
          <div className="space-y-1" data-testid="stat-active-threats">
            <div className="text-xs text-muted-foreground">Active Threats</div>
            <div className="text-xl font-bold">
              {data.activeThreats}
              {data.activeThreats === 0 && <CheckCircle2 className="h-4 w-4 text-emerald-400 inline ml-1" />}
            </div>
          </div>
          <div className="space-y-1" data-testid="stat-compiled-skills">
            <div className="text-xs text-muted-foreground">Compiled Skills</div>
            <div className="text-xl font-bold text-blue-400">{data.compiledSkills}</div>
          </div>
          <div className="space-y-1" data-testid="stat-decay-signals">
            <div className="text-xs text-muted-foreground">Decay Signals</div>
            <div className="text-xl font-bold text-purple-400">{data.decaySignals}</div>
          </div>
        </div>

        {data.recentViolations?.length > 0 && (
          <div className="mt-4 space-y-2">
            <div className="text-xs font-medium text-muted-foreground">Recent Violations</div>
            {data.recentViolations.map((v: any, i: number) => (
              <div key={i} className="flex items-center gap-2 text-xs p-2 rounded bg-muted/30" data-testid={`violation-${i}`}>
                <AlertTriangle className="h-3 w-3 text-amber-400 shrink-0" />
                <span className="truncate">{v.agentName}: {v.violation}</span>
                <Badge variant="outline" className="ml-auto shrink-0 text-[10px]">{v.severity}</Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BrandProfileCard() {
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/content-core/brand/profile"],
    refetchInterval: 120000,
  });

  if (isLoading) {
    return (
      <Card className="card-empire">
        <CardHeader className="pb-3"><Skeleton className="h-5 w-40" /></CardHeader>
        <CardContent><Skeleton className="h-24 w-full" /></CardContent>
      </Card>
    );
  }

  if (!data) return null;

  return (
    <Card className="card-empire" data-testid="card-brand-profile">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Crosshair className="h-4 w-4 text-primary" />
          Brand Identity
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div>
            <div className="text-xs text-muted-foreground mb-1">Voice Tone</div>
            <Badge variant="outline" className="text-xs">{data.voiceTone}</Badge>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Content Pillars</div>
            <div className="flex flex-wrap gap-1">
              {data.contentPillars?.map((p: string) => (
                <Badge key={p} variant="secondary" className="text-[10px]">{p}</Badge>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Visual Style</div>
            <Badge variant="outline" className="text-xs">{data.visualStyle}</Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DecisionFeedCard() {
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/content-core/decisions"],
    refetchInterval: 3 * 60_000,
  });

  if (isLoading) {
    return (
      <Card className="card-empire">
        <CardHeader className="pb-3"><Skeleton className="h-5 w-40" /></CardHeader>
        <CardContent><Skeleton className="h-24 w-full" /></CardContent>
      </Card>
    );
  }

  const decisions = data || [];
  const bandColors: Record<string, string> = {
    GREEN: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    YELLOW: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    RED: "bg-red-500/20 text-red-400 border-red-500/30",
  };

  return (
    <Card className="card-empire" data-testid="card-decision-feed">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary" />
          Decision Theater
          <Badge variant="outline" className="ml-auto text-[10px]">{decisions.length} recent</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {decisions.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-decisions">
            No agent decisions recorded yet
          </div>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {decisions.slice(0, 10).map((d: any) => (
              <div key={d.id} className="flex items-center gap-2 text-xs p-2 rounded bg-muted/30" data-testid={`decision-${d.id}`}>
                <Gauge className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="font-medium truncate">{d.agentName}</span>
                <span className="text-muted-foreground truncate">{d.actionType}</span>
                <Badge className={`ml-auto shrink-0 text-[10px] ${bandColors[d.band] || ""}`}>
                  {d.band}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ContentVelocityCard() {
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/content-core/velocity"],
    refetchInterval: 60000,
  });

  if (isLoading) {
    return (
      <Card className="card-empire">
        <CardHeader className="pb-3"><Skeleton className="h-5 w-40" /></CardHeader>
        <CardContent><Skeleton className="h-16 w-full" /></CardContent>
      </Card>
    );
  }

  const trend = data || [];
  const latest = trend[0];

  return (
    <Card className="card-empire" data-testid="card-content-velocity">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          Content Velocity
        </CardTitle>
      </CardHeader>
      <CardContent>
        {latest ? (
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Publish Rate</div>
              <div className="text-lg font-bold">{latest.publishRate?.toFixed(1) || "—"}</div>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Quality Avg</div>
              <div className="text-lg font-bold text-emerald-400">{latest.qualityAvg?.toFixed(1) || "—"}</div>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Trend</div>
              <div className="text-lg font-bold text-blue-400">{latest.trend || "stable"}</div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-velocity">
            No velocity data yet
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DemandInsightsCard() {
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/content-core/demand"],
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

  const nodes = data || [];
  const highGap = nodes.filter((n: any) => (n.gapScore || 0) > 0.6);

  return (
    <Card className="card-empire" data-testid="card-demand-insights">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          Demand Gaps
          {highGap.length > 0 && (
            <Badge variant="outline" className="ml-auto text-[10px] text-amber-400 border-amber-500/30">
              {highGap.length} opportunities
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {nodes.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-demand">
            No demand data yet
          </div>
        ) : (
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {nodes.slice(0, 8).map((n: any, i: number) => (
              <div key={i} className="flex items-center justify-between text-xs p-2 rounded bg-muted/30" data-testid={`demand-node-${i}`}>
                <span className="font-medium truncate">{n.topic || n.nodeType}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-muted-foreground">gap: {((n.gapScore || 0) * 100).toFixed(0)}%</span>
                  <Eye className="h-3 w-3 text-muted-foreground" />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ContentIntelligenceTab() {
  return (
    <div className="space-y-4" data-testid="content-intelligence-tab">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <GovernanceSummaryCard />
        <BrandProfileCard />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <DecisionFeedCard />
        <ContentVelocityCard />
      </div>
      <DemandInsightsCard />
      <AIToolsTab />
    </div>
  );
}
