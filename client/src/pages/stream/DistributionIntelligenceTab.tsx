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
    stats: { totalEvents: number; byPlatform: Record<string, number> };
    supportedPlatforms: string[];
    brandConsistency: number;
    cadence: { burnoutRisk: number; overallHealth: string };
    regulatoryAlerts: number;
    globalSafety: number;
  }>({
    queryKey: ["/api/distribution/summary"],
    refetchInterval: 3 * 60_000,
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
    stats: { totalEvents: number; byPlatform: Record<string, number> };
  }>({
    queryKey: ["/api/distribution/stats"],
    refetchInterval: 3 * 60_000,
  });

  if (isLoading) return <LoadingCard title="Platform Health" />;
  if (isError || !data) return <ErrorCard title="Platform Health" icon={<Radio className="h-4 w-4 text-primary" />} />;

  const platforms = Object.entries(data.stats?.byPlatform || {}).sort((a, b) => b[1] - a[1]);

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

function BrandConsistencyCard() {
  const { data, isLoading, isError } = useQuery<{
    overallScore: number;
    elements: { type: string; consistency: number }[];
  }>({
    queryKey: ["/api/distribution/brand-recognition"],
    refetchInterval: 60000,
  });

  if (isLoading) return <LoadingCard title="Brand Consistency" />;
  if (isError || !data) return <ErrorCard title="Brand Consistency" icon={<CheckCircle2 className="h-4 w-4 text-primary" />} />;

  const scoreColor = (data.overallScore ?? 0) >= 0.8 ? "text-emerald-400" : (data.overallScore ?? 0) >= 0.5 ? "text-amber-400" : "text-red-400";

  return (
    <Card className="card-empire" data-testid="card-brand-consistency">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-primary" />
          Brand Consistency
          <Badge variant="outline" className={`ml-auto text-[10px] ${scoreColor}`}>
            {((data.overallScore ?? 0) * 100).toFixed(0)}%
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {(data.elements || []).length === 0 ? (
          <div className="text-xs text-muted-foreground p-3 text-center" data-testid="text-no-brand-elements">No brand elements tracked yet</div>
        ) : (
          <div className="space-y-2">
            {(data.elements || []).slice(0, 5).map((el, i) => (
              <div key={i} className="flex items-center justify-between text-xs" data-testid={`row-brand-element-${i}`}>
                <span className="capitalize font-medium">{el.type}</span>
                <Badge variant="outline" className="text-[10px]">{(el.consistency * 100).toFixed(0)}%</Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CadenceIntelligenceCard() {
  const { data, isLoading, isError } = useQuery<{
    burnoutRisk: number;
    optimalFrequency: Record<string, number>;
    recommendations: string[];
  }>({
    queryKey: ["/api/distribution/cadence"],
    refetchInterval: 60000,
  });

  if (isLoading) return <LoadingCard title="Cadence Intelligence" />;
  if (isError || !data) return <ErrorCard title="Cadence Intelligence" icon={<Clock className="h-4 w-4 text-primary" />} />;

  const riskColor = (data.burnoutRisk ?? 0) < 0.3 ? "text-emerald-400" : (data.burnoutRisk ?? 0) < 0.6 ? "text-amber-400" : "text-red-400";

  return (
    <Card className="card-empire" data-testid="card-cadence-intelligence">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          Cadence Intelligence
          <Badge variant="outline" className={`ml-auto text-[10px] ${riskColor}`}>
            Burnout: {((data.burnoutRisk ?? 0) * 100).toFixed(0)}%
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {(data.recommendations || []).length === 0 ? (
          <div className="text-xs text-muted-foreground p-3 text-center" data-testid="text-no-cadence-data">Cadence analysis will populate with publishing data</div>
        ) : (
          <div className="space-y-1">
            {(data.recommendations || []).slice(0, 3).map((rec, i) => (
              <div key={i} className="text-[10px] text-muted-foreground flex items-center gap-1" data-testid={`text-cadence-rec-${i}`}>
                <CheckCircle2 className="h-3 w-3 text-primary shrink-0" />
                {rec}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AlgorithmRelationshipsCard() {
  const { data, isLoading, isError } = useQuery<{
    userId: string;
    relationships: { platform: string; favorScore: number; trend: string }[];
  }>({
    queryKey: ["/api/distribution/algorithm-relationships"],
    refetchInterval: 60000,
  });

  if (isLoading) return <LoadingCard title="Algorithm Relationships" />;
  if (isError || !data) return <ErrorCard title="Algorithm Relationships" icon={<BarChart3 className="h-4 w-4 text-primary" />} />;

  const trendIcons: Record<string, string> = { improving: "text-emerald-400", stable: "text-muted-foreground", declining: "text-red-400" };

  return (
    <Card className="card-empire" data-testid="card-algorithm-relationships">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          Algorithm Relationships
        </CardTitle>
      </CardHeader>
      <CardContent>
        {(data.relationships || []).length === 0 ? (
          <div className="text-xs text-muted-foreground p-3 text-center" data-testid="text-no-algorithm-data">No algorithm data available</div>
        ) : (
          <div className="space-y-2">
            {(data.relationships || []).slice(0, 5).map((r, i) => (
              <div key={i} className="flex items-center justify-between text-xs" data-testid={`row-algorithm-${i}`}>
                <span className="capitalize font-medium">{r.platform}</span>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">{(r.favorScore * 100).toFixed(0)}%</Badge>
                  <span className={`text-[10px] capitalize ${trendIcons[r.trend] || ""}`}>{r.trend}</span>
                </div>
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
        <BrandConsistencyCard />
        <CadenceIntelligenceCard />
        <AlgorithmRelationshipsCard />
        <CompetitorInsightsCard />
        <TrendOpportunitiesCard />
        <RegulatoryAlertsCard />
        <GlobalSafetyCard />
      </div>
    </div>
  );
}
