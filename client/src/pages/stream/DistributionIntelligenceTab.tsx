import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Globe, Shield, TrendingUp, Radio, BarChart3,
  AlertTriangle, CheckCircle2, XCircle, Clock, Layers
} from "lucide-react";

function LoadingCard({ title }: { title: string }) {
  return (
    <Card className="card-empire" data-testid={`card-${title.toLowerCase().replace(/\s+/g, "-")}-loading`}>
      <CardHeader className="pb-3"><Skeleton className="h-5 w-40" /></CardHeader>
      <CardContent><Skeleton className="h-24 w-full" /></CardContent>
    </Card>
  );
}

function ErrorCard({ title, icon }: { title: string; icon: React.ReactNode }) {
  return (
    <Card className="card-empire" data-testid={`card-${title.toLowerCase().replace(/\s+/g, "-")}-error`}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          {icon}{title}
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

function DistributionSummaryCard() {
  const { data, isLoading, isError } = useQuery<{
    stats: { totalEvents: number; platformBreakdown: Record<string, number> };
    supportedPlatforms: string[];
    brandConsistency: number;
    cadence: { burnoutRisk: number; overallHealth: string };
    regulatoryAlerts: number;
    globalSafety: number;
  }>({
    queryKey: ["/api/distribution/summary"],
    refetchInterval: 30000,
  });

  if (isLoading) return <LoadingCard title="Distribution Summary" />;
  if (isError || !data) return <ErrorCard title="Distribution Summary" icon={<Globe className="h-4 w-4 text-primary" />} />;

  const healthColor = data.globalSafety >= 0.8 ? "text-emerald-400" : data.globalSafety >= 0.5 ? "text-amber-400" : "text-red-400";
  const cadenceColor = data.cadence.overallHealth === "healthy" ? "text-emerald-400" : data.cadence.overallHealth === "moderate" ? "text-amber-400" : "text-red-400";

  return (
    <Card className="card-empire col-span-full" data-testid="card-distribution-summary">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Globe className="h-4 w-4 text-primary" />
          Distribution Intelligence
          <Badge variant="outline" className="ml-auto text-[10px]">
            {data.supportedPlatforms.length} platforms
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-1" data-testid="stat-total-events">
            <div className="text-xs text-muted-foreground">Total Events</div>
            <div className="text-xl font-bold">{data.stats.totalEvents}</div>
          </div>
          <div className="space-y-1" data-testid="stat-brand-consistency">
            <div className="text-xs text-muted-foreground">Brand Consistency</div>
            <div className="text-xl font-bold">{(data.brandConsistency * 100).toFixed(0)}%</div>
          </div>
          <div className="space-y-1" data-testid="stat-cadence-health">
            <div className="text-xs text-muted-foreground">Cadence Health</div>
            <div className={`text-xl font-bold capitalize ${cadenceColor}`}>
              {data.cadence.overallHealth}
            </div>
          </div>
          <div className="space-y-1" data-testid="stat-global-safety">
            <div className="text-xs text-muted-foreground">Global Safety</div>
            <div className={`text-xl font-bold ${healthColor}`}>
              {(data.globalSafety * 100).toFixed(0)}%
            </div>
          </div>
        </div>
        {data.regulatoryAlerts > 0 && (
          <div className="mt-3 flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 rounded p-2" data-testid="alert-regulatory">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {data.regulatoryAlerts} regulatory alert{data.regulatoryAlerts > 1 ? "s" : ""} require attention
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PlatformHealthCard() {
  const { data, isLoading, isError } = useQuery<{
    stats: { totalEvents: number; platformBreakdown: Record<string, number> };
  }>({
    queryKey: ["/api/distribution/stats"],
    refetchInterval: 30000,
  });

  if (isLoading) return <LoadingCard title="Platform Health" />;
  if (isError || !data) return <ErrorCard title="Platform Health" icon={<Radio className="h-4 w-4 text-primary" />} />;

  const platforms = Object.entries(data.stats?.platformBreakdown || {}).sort((a, b) => b[1] - a[1]);

  return (
    <Card className="card-empire" data-testid="card-platform-health">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Radio className="h-4 w-4 text-primary" />
          Platform Health
        </CardTitle>
      </CardHeader>
      <CardContent>
        {platforms.length === 0 ? (
          <div className="text-xs text-muted-foreground p-3 text-center" data-testid="text-no-platforms">No distribution events yet</div>
        ) : (
          <div className="space-y-2">
            {platforms.map(([platform, count]) => (
              <div key={platform} className="flex items-center justify-between text-xs" data-testid={`row-platform-${platform}`}>
                <span className="capitalize font-medium">{platform}</span>
                <Badge variant="outline" className="text-[10px]">{count} events</Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CompetitorInsightsCard() {
  const { data, isLoading, isError } = useQuery<{
    competitors: { name: string; platform: string; score: number }[];
  }>({
    queryKey: ["/api/distribution/competitor-intel"],
    refetchInterval: 60000,
  });

  if (isLoading) return <LoadingCard title="Competitor Insights" />;
  if (isError || !data) return <ErrorCard title="Competitor Insights" icon={<BarChart3 className="h-4 w-4 text-primary" />} />;

  return (
    <Card className="card-empire" data-testid="card-competitor-insights">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          Competitor Insights
        </CardTitle>
      </CardHeader>
      <CardContent>
        {(data.competitors || []).length === 0 ? (
          <div className="text-xs text-muted-foreground p-3 text-center" data-testid="text-no-competitors">No competitor data available</div>
        ) : (
          <div className="space-y-2">
            {(data.competitors || []).slice(0, 5).map((c, i) => (
              <div key={i} className="flex items-center justify-between text-xs" data-testid={`row-competitor-${i}`}>
                <span className="font-medium">{c.name}</span>
                <Badge variant="outline" className="text-[10px]">{(c.score * 100).toFixed(0)}%</Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TrendOpportunitiesCard() {
  const { data, isLoading, isError } = useQuery<{
    trends: { topic: string; window: string; score: number }[];
  }>({
    queryKey: ["/api/distribution/trend-arbitrage"],
    refetchInterval: 60000,
  });

  if (isLoading) return <LoadingCard title="Trend Opportunities" />;
  if (isError || !data) return <ErrorCard title="Trend Opportunities" icon={<TrendingUp className="h-4 w-4 text-primary" />} />;

  const windowColors: Record<string, string> = {
    strong: "text-emerald-400",
    moderate: "text-amber-400",
    closing: "text-orange-400",
    expired: "text-red-400",
  };

  return (
    <Card className="card-empire" data-testid="card-trend-opportunities">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          Trend Opportunities
        </CardTitle>
      </CardHeader>
      <CardContent>
        {(data.trends || []).length === 0 ? (
          <div className="text-xs text-muted-foreground p-3 text-center" data-testid="text-no-trends">No trending opportunities detected</div>
        ) : (
          <div className="space-y-2">
            {(data.trends || []).slice(0, 5).map((t, i) => (
              <div key={i} className="flex items-center justify-between text-xs" data-testid={`row-trend-${i}`}>
                <span className="font-medium">{t.topic}</span>
                <Badge variant="outline" className={`text-[10px] ${windowColors[t.window] || ""}`}>{t.window}</Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RegulatoryAlertsCard() {
  const { data, isLoading, isError } = useQuery<{
    alerts: { regulation: string; region: string; impact: string; daysUntilEffective: number }[];
    urgentCount: number;
  }>({
    queryKey: ["/api/distribution/regulatory-horizon"],
    refetchInterval: 120000,
  });

  if (isLoading) return <LoadingCard title="Regulatory Alerts" />;
  if (isError || !data) return <ErrorCard title="Regulatory Alerts" icon={<Shield className="h-4 w-4 text-primary" />} />;

  const impactColors: Record<string, string> = { critical: "text-red-400", high: "text-orange-400", medium: "text-amber-400", low: "text-muted-foreground" };

  return (
    <Card className="card-empire" data-testid="card-regulatory-alerts">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          Regulatory Horizon
          {data.urgentCount > 0 && (
            <Badge variant="destructive" className="ml-auto text-[10px]">{data.urgentCount} urgent</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {(data.alerts || []).slice(0, 5).map((a, i) => (
            <div key={i} className="flex items-center justify-between text-xs" data-testid={`row-regulatory-${i}`}>
              <div className="flex-1">
                <span className="font-medium">{a.regulation}</span>
                <span className="text-muted-foreground ml-1">({a.region})</span>
              </div>
              <div className="flex items-center gap-2">
                {a.daysUntilEffective > 0 ? (
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />{a.daysUntilEffective}d
                  </span>
                ) : (
                  <Badge variant="outline" className="text-[10px] text-emerald-400">Active</Badge>
                )}
                <Badge variant="outline" className={`text-[10px] ${impactColors[a.impact] || ""}`}>{a.impact}</Badge>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function GlobalSafetyCard() {
  const { data, isLoading, isError } = useQuery<{
    overallScore: number;
    dependencies: { platform: string; riskLevel: string; dependencyScore: number }[];
    roadmap: string[];
  }>({
    queryKey: ["/api/distribution/platform-independence"],
    refetchInterval: 60000,
  });

  if (isLoading) return <LoadingCard title="Platform Independence" />;
  if (isError || !data) return <ErrorCard title="Platform Independence" icon={<Layers className="h-4 w-4 text-primary" />} />;

  const riskColors: Record<string, string> = { low: "text-emerald-400", medium: "text-amber-400", high: "text-orange-400", critical: "text-red-400" };
  const scoreColor = data.overallScore >= 0.7 ? "text-emerald-400" : data.overallScore >= 0.4 ? "text-amber-400" : "text-red-400";

  return (
    <Card className="card-empire" data-testid="card-platform-independence">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Layers className="h-4 w-4 text-primary" />
          Platform Independence
          <Badge variant="outline" className={`ml-auto text-[10px] ${scoreColor}`}>
            {(data.overallScore * 100).toFixed(0)}%
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {(data.dependencies || []).length === 0 ? (
          <div className="text-xs text-muted-foreground p-3 text-center" data-testid="text-no-dependencies">No platform data available</div>
        ) : (
          <div className="space-y-2">
            {(data.dependencies || []).slice(0, 5).map((d, i) => (
              <div key={i} className="flex items-center justify-between text-xs" data-testid={`row-dependency-${i}`}>
                <span className="capitalize font-medium">{d.platform}</span>
                <Badge variant="outline" className={`text-[10px] ${riskColors[d.riskLevel] || ""}`}>{d.riskLevel}</Badge>
              </div>
            ))}
          </div>
        )}
        {(data.roadmap || []).length > 0 && (
          <div className="mt-3 space-y-1">
            {data.roadmap.slice(0, 2).map((r, i) => (
              <div key={i} className="text-[10px] text-muted-foreground flex items-center gap-1" data-testid={`text-roadmap-${i}`}>
                <CheckCircle2 className="h-3 w-3 text-primary shrink-0" />
                {r}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function DistributionIntelligenceTab() {
  return (
    <div className="space-y-4" data-testid="section-distribution-intelligence">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <DistributionSummaryCard />
        <PlatformHealthCard />
        <CompetitorInsightsCard />
        <TrendOpportunitiesCard />
        <RegulatoryAlertsCard />
        <GlobalSafetyCard />
      </div>
    </div>
  );
}
