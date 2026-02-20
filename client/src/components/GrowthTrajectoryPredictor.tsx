import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp, Target, AlertTriangle, Zap, Clock,
  ArrowUpRight, Shield, Lightbulb, Rocket, Activity,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface TrajectoryData {
  currentMetrics: {
    totalViews: number;
    totalSubs: number;
    totalVideos: number;
    optimizations: number;
    channelCount: number;
  };
  trajectory: {
    historical: { date: string; views: number; subscribers: number; type: string }[];
    projected: { date: string; projectedViews: number; projectedSubs: number; inflectionViews: number; inflectionSubs: number; type: string }[];
  };
  inflection: {
    predicted: boolean;
    estimatedDays: number | null;
    estimatedDate: string | null;
    confidence: number;
    currentPhase: string;
    phaseDescription: string;
  };
  plateau: {
    views: { detected: boolean; severity: string; durationDays: number; avgGrowthRate: number };
    subscribers: { detected: boolean; severity: string; durationDays: number; avgGrowthRate: number };
  };
  aiInsights: {
    inflectionAnalysis: string;
    plateauBreakers: { title: string; description: string; impact: string; timeframe: string }[];
    growthAccelerators: string[];
    riskFactors: string[];
    nextMilestone: { metric: string; target: number; estimatedDays: number; description: string };
  } | null;
}

const fmt = (v: number) =>
  v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` :
  v >= 1000 ? `${(v / 1000).toFixed(1)}K` : String(v);

const phaseColors: Record<string, string> = {
  "Building Foundation": "bg-blue-500/10 text-blue-400 border-blue-500/20",
  "Momentum Building": "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  "Acceleration": "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  "Explosive Growth": "bg-purple-500/10 text-purple-400 border-purple-500/20",
  "Recovery Needed": "bg-amber-500/10 text-amber-400 border-amber-500/20",
};

const phaseIcons: Record<string, typeof Activity> = {
  "Building Foundation": Activity,
  "Momentum Building": TrendingUp,
  "Acceleration": Rocket,
  "Explosive Growth": Zap,
  "Recovery Needed": AlertTriangle,
};

const impactColors: Record<string, string> = {
  high: "bg-emerald-500/10 text-emerald-400",
  medium: "bg-amber-500/10 text-amber-400",
  low: "bg-blue-500/10 text-blue-400",
};

const severityConfig: Record<string, { color: string; label: string }> = {
  none: { color: "bg-emerald-500/10 text-emerald-400", label: "No Plateau" },
  mild: { color: "bg-amber-500/10 text-amber-400", label: "Mild Plateau" },
  moderate: { color: "bg-orange-500/10 text-orange-400", label: "Moderate Plateau" },
  severe: { color: "bg-red-500/10 text-red-400", label: "Severe Plateau" },
};

export default function GrowthTrajectoryPredictor() {
  const { data, isLoading } = useQuery<TrajectoryData>({
    queryKey: ["/api/growth/trajectory"],
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const chartData = useMemo(() => {
    if (!data?.trajectory) return [];

    const hist = data.trajectory.historical.map(h => ({
      date: h.date,
      views: h.views,
      subscribers: h.subscribers,
      projectedViews: null as number | null,
      projectedSubs: null as number | null,
      inflectionViews: null as number | null,
      inflectionSubs: null as number | null,
    }));

    const proj = data.trajectory.projected.map(p => ({
      date: p.date,
      views: null as number | null,
      subscribers: null as number | null,
      projectedViews: p.projectedViews,
      projectedSubs: p.projectedSubs,
      inflectionViews: p.inflectionViews,
      inflectionSubs: p.inflectionSubs,
    }));

    if (hist.length > 0 && proj.length > 0) {
      const bridge = { ...hist[hist.length - 1] };
      bridge.projectedViews = bridge.views;
      bridge.projectedSubs = bridge.subscribers;
      bridge.inflectionViews = bridge.views;
      bridge.inflectionSubs = bridge.subscribers;
      hist[hist.length - 1] = bridge;
    }

    return [...hist, ...proj];
  }, [data]);

  if (isLoading) {
    return <Skeleton className="h-[500px] w-full rounded-lg" />;
  }

  if (!data) return null;

  const { inflection, plateau, aiInsights, currentMetrics } = data;
  const PhaseIcon = phaseIcons[inflection.currentPhase] || Activity;
  const phaseColor = phaseColors[inflection.currentPhase] || phaseColors["Building Foundation"];
  const viewsPlateau = plateau.views;
  const subsPlateau = plateau.subscribers;
  const anyPlateau = viewsPlateau.detected || subsPlateau.detected;
  const worstPlateau = viewsPlateau.severity === "severe" || subsPlateau.severity === "severe"
    ? "severe" : viewsPlateau.severity === "moderate" || subsPlateau.severity === "moderate"
    ? "moderate" : viewsPlateau.detected || subsPlateau.detected
    ? "mild" : "none";

  return (
    <Card data-testid="card-growth-trajectory">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-purple-400" />
            <CardTitle className="text-base">Growth Trajectory</CardTitle>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className={phaseColor} data-testid="badge-growth-phase">
              <PhaseIcon className="h-3 w-3 mr-1" />
              {inflection.currentPhase}
            </Badge>
            {anyPlateau && (
              <Badge variant="outline" className={severityConfig[worstPlateau].color} data-testid="badge-plateau-status">
                <AlertTriangle className="h-3 w-3 mr-1" />
                {severityConfig[worstPlateau].label}
              </Badge>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">{inflection.phaseDescription}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <InflectionStat
            label="Inflection Point"
            value={inflection.predicted && inflection.estimatedDate ? inflection.estimatedDate : "Active Now"}
            sub={inflection.predicted && inflection.estimatedDays ? `~${inflection.estimatedDays} days away` : "Growth is compounding"}
            icon={Target}
            testId="stat-inflection-date"
          />
          <InflectionStat
            label="Readiness"
            value={`${inflection.confidence}%`}
            sub="Inflection readiness score"
            icon={Zap}
            testId="stat-readiness"
          />
          <InflectionStat
            label="Views Plateau"
            value={viewsPlateau.detected ? `${viewsPlateau.durationDays}d` : "None"}
            sub={viewsPlateau.detected ? `${viewsPlateau.avgGrowthRate}% avg growth` : "Healthy growth"}
            icon={viewsPlateau.detected ? AlertTriangle : TrendingUp}
            testId="stat-views-plateau"
          />
          <InflectionStat
            label="Subs Plateau"
            value={subsPlateau.detected ? `${subsPlateau.durationDays}d` : "None"}
            sub={subsPlateau.detected ? `${subsPlateau.avgGrowthRate}% avg growth` : "Healthy growth"}
            icon={subsPlateau.detected ? AlertTriangle : TrendingUp}
            testId="stat-subs-plateau"
          />
        </div>

        {chartData.length > 0 && (
          <div className="h-[220px]" data-testid="chart-trajectory">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="actualGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(258, 90%, 66%)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="hsl(258, 90%, 66%)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="projectedGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(200, 90%, 60%)" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="hsl(200, 90%, 60%)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="inflectionGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(150, 80%, 50%)" stopOpacity={0.15} />
                    <stop offset="100%" stopColor="hsl(150, 80%, 50%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  interval="preserveStartEnd"
                  tickCount={6}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  tickFormatter={fmt}
                  width={45}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  labelStyle={{ color: "hsl(var(--foreground))" }}
                  formatter={(value: number, name: string) => {
                    const labels: Record<string, string> = {
                      views: "Actual Views",
                      projectedViews: "Projected Views",
                      inflectionViews: "Inflection Path",
                    };
                    return [fmt(value), labels[name] || name];
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="views"
                  stroke="hsl(258, 90%, 66%)"
                  fill="url(#actualGrad)"
                  strokeWidth={2}
                  connectNulls={false}
                  dot={false}
                />
                <Area
                  type="monotone"
                  dataKey="projectedViews"
                  stroke="hsl(200, 90%, 60%)"
                  fill="url(#projectedGrad)"
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  connectNulls={false}
                  dot={false}
                />
                <Area
                  type="monotone"
                  dataKey="inflectionViews"
                  stroke="hsl(150, 80%, 50%)"
                  fill="url(#inflectionGrad)"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  connectNulls={false}
                  dot={false}
                />
                {inflection.predicted && inflection.estimatedDays && (() => {
                  const histLen = data.trajectory.historical.length || 0;
                  const idx = Math.min(chartData.length - 1, histLen + Math.min(inflection.estimatedDays, 89));
                  const targetDate = chartData[idx]?.date;
                  if (!targetDate) return null;
                  return (
                    <ReferenceLine
                      x={targetDate}
                      stroke="hsl(150, 80%, 50%)"
                      strokeDasharray="3 3"
                      label={{ value: "Inflection", position: "top", fill: "hsl(150, 80%, 50%)", fontSize: 10 }}
                    />
                  );
                })()}
              </AreaChart>
            </ResponsiveContainer>
            <div className="flex items-center justify-center gap-4 mt-1">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-0.5 bg-purple-500 rounded" />
                <span className="text-[10px] text-muted-foreground">Actual</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-0.5 bg-sky-500 rounded border-dashed" />
                <span className="text-[10px] text-muted-foreground">Projected</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-0.5 bg-emerald-500 rounded" />
                <span className="text-[10px] text-muted-foreground">Inflection Path</span>
              </div>
            </div>
          </div>
        )}

        {aiInsights && (
          <div className="space-y-3">
            <div className="rounded-lg border p-3 bg-card" data-testid="card-inflection-analysis">
              <div className="flex items-start gap-2">
                <Lightbulb className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-medium mb-1">Inflection Analysis</p>
                  <p className="text-xs text-muted-foreground">{aiInsights.inflectionAnalysis}</p>
                </div>
              </div>
            </div>

            {aiInsights.plateauBreakers && aiInsights.plateauBreakers.length > 0 && (
              <div data-testid="section-plateau-breakers">
                <div className="flex items-center gap-1.5 mb-2">
                  <Rocket className="h-3.5 w-3.5 text-purple-400" />
                  <p className="text-xs font-medium">Plateau Breakers</p>
                </div>
                <div className="grid gap-2">
                  {aiInsights.plateauBreakers.map((breaker, i) => (
                    <div key={i} className="rounded-lg border p-2.5 bg-card" data-testid={`card-plateau-breaker-${i}`}>
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="flex items-start gap-2 min-w-0">
                          <ArrowUpRight className="h-3.5 w-3.5 text-purple-400 mt-0.5 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-xs font-medium">{breaker.title}</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">{breaker.description}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Badge variant="outline" className={`text-[10px] ${impactColors[breaker.impact] || impactColors.medium}`}>
                            {breaker.impact}
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            <Clock className="h-2.5 w-2.5 mr-0.5" />
                            {breaker.timeframe}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {aiInsights.growthAccelerators && aiInsights.growthAccelerators.length > 0 && (
              <div data-testid="section-growth-accelerators">
                <div className="flex items-center gap-1.5 mb-2">
                  <Zap className="h-3.5 w-3.5 text-emerald-400" />
                  <p className="text-xs font-medium">Growth Accelerators</p>
                </div>
                <div className="grid gap-1.5">
                  {aiInsights.growthAccelerators.map((acc, i) => (
                    <div key={i} className="flex items-start gap-2 text-[11px] text-muted-foreground" data-testid={`text-accelerator-${i}`}>
                      <div className="w-1 h-1 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                      <span>{acc}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {aiInsights.riskFactors && aiInsights.riskFactors.length > 0 && (
                <div className="rounded-lg border p-2.5 bg-card" data-testid="card-risk-factors">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Shield className="h-3.5 w-3.5 text-amber-400" />
                    <p className="text-xs font-medium">Risk Factors</p>
                  </div>
                  {aiInsights.riskFactors.map((risk, i) => (
                    <div key={i} className="flex items-start gap-2 text-[11px] text-muted-foreground mb-1">
                      <AlertTriangle className="h-3 w-3 text-amber-400 mt-0.5 shrink-0" />
                      <span>{risk}</span>
                    </div>
                  ))}
                </div>
              )}

              {aiInsights.nextMilestone && (
                <div className="rounded-lg border p-2.5 bg-card" data-testid="card-next-milestone">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Target className="h-3.5 w-3.5 text-purple-400" />
                    <p className="text-xs font-medium">Next Milestone</p>
                  </div>
                  <p className="text-lg font-bold font-mono">
                    {fmt(aiInsights.nextMilestone.target)} {aiInsights.nextMilestone.metric}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    ~{aiInsights.nextMilestone.estimatedDays} days | {aiInsights.nextMilestone.description}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function InflectionStat({ label, value, sub, icon: Icon, testId }: {
  label: string;
  value: string;
  sub: string;
  icon: typeof Activity;
  testId: string;
}) {
  return (
    <div className="rounded-lg border p-2.5 bg-card" data-testid={testId}>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="h-3 w-3 text-muted-foreground" />
        <span className="text-[10px] text-muted-foreground">{label}</span>
      </div>
      <p className="text-sm font-bold font-mono">{value}</p>
      <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>
    </div>
  );
}
