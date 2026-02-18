import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  TrendingUp, TrendingDown, Eye, Users, DollarSign,
  Zap, BarChart3, ArrowUpRight,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { safeArray } from "@/lib/safe-data";

type MetricType = "views" | "subscribers" | "revenue";

const RANGE_OPTIONS = [
  { value: "7d", label: "7 Days" },
  { value: "30d", label: "30 Days" },
  { value: "90d", label: "90 Days" },
  { value: "6m", label: "6 Months" },
];

const METRIC_CONFIG: Record<MetricType, {
  icon: typeof Eye;
  label: string;
  baselineKey: string;
  actualKey: string;
  projectedKey: string;
  format: (v: number) => string;
  color: string;
  baselineColor: string;
  projectedColor: string;
}> = {
  views: {
    icon: Eye,
    label: "Views",
    baselineKey: "baselineViews",
    actualKey: "actualViews",
    projectedKey: "projectedViews",
    format: (v) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(1)}K` : String(v),
    color: "hsl(258, 90%, 66%)",
    baselineColor: "hsl(0, 0%, 50%)",
    projectedColor: "hsl(200, 90%, 60%)",
  },
  subscribers: {
    icon: Users,
    label: "Subscribers",
    baselineKey: "baselineSubscribers",
    actualKey: "actualSubscribers",
    projectedKey: "projectedSubscribers",
    format: (v) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(1)}K` : String(v),
    color: "hsl(150, 80%, 50%)",
    baselineColor: "hsl(0, 0%, 50%)",
    projectedColor: "hsl(200, 90%, 60%)",
  },
  revenue: {
    icon: DollarSign,
    label: "Revenue",
    baselineKey: "baselineRevenue",
    actualKey: "actualRevenue",
    projectedKey: "projectedRevenue",
    format: (v) => `$${v >= 1000 ? `${(v / 1000).toFixed(1)}K` : v.toFixed(0)}`,
    color: "hsl(45, 90%, 55%)",
    baselineColor: "hsl(0, 0%, 50%)",
    projectedColor: "hsl(200, 90%, 60%)",
  },
};

function CustomTooltip({ active, payload, label, metric }: any) {
  if (!active || !payload?.length) return null;
  const config = METRIC_CONFIG[metric as MetricType];

  return (
    <div className="bg-popover border border-border rounded-md p-3 shadow-lg text-sm" data-testid="tooltip-growth-chart">
      <p className="font-medium text-foreground mb-2">{label}</p>
      {safeArray(payload).map((entry: any, i: number) => (
        <div key={i} className="flex items-center gap-2 py-0.5">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-medium text-foreground">{config.format(entry.value || 0)}</span>
        </div>
      ))}
      {payload.length >= 2 && (
        <div className="mt-2 pt-2 border-t border-border text-xs text-muted-foreground">
          {(() => {
            const baseline = payload.find((p: any) => p.dataKey?.includes("baseline"))?.value || 0;
            const actual = payload.find((p: any) => p.dataKey?.includes("actual"))?.value || 0;
            const diff = actual - baseline;
            const pct = baseline > 0 ? ((diff / baseline) * 100).toFixed(1) : "0";
            return diff >= 0
              ? <span className="text-green-400">AI Impact: +{config.format(diff)} (+{pct}%)</span>
              : <span className="text-red-400">AI Impact: {config.format(diff)} ({pct}%)</span>;
          })()}
        </div>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, change, positive }: {
  icon: typeof Eye; label: string; value: string; change?: string; positive?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-md bg-muted/30" data-testid={`stat-${label.toLowerCase().replace(/\s/g, '-')}`}>
      <div className="p-2 rounded-md bg-primary/10">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground truncate">{label}</p>
        <p className="text-sm font-semibold text-foreground">{value}</p>
      </div>
      {change && (
        <Badge variant="secondary" className="text-[10px] shrink-0" data-testid={`badge-change-${label.toLowerCase().replace(/\s/g, '-')}`}>
          {positive ? <TrendingUp className="w-3 h-3 mr-0.5" /> : <TrendingDown className="w-3 h-3 mr-0.5" />}
          {change}
        </Badge>
      )}
    </div>
  );
}

export default function GrowthImpactChart() {
  const [range, setRange] = useState("30d");
  const [metric, setMetric] = useState<MetricType>("views");

  const { data: impactData, isLoading: impactLoading } = useQuery<{
    chartData: any[];
    summary: { viewsLift: number; subsLift: number; totalOptimizations: number; dataPoints: number };
  }>({
    queryKey: [`/api/growth/impact?range=${range}`],
  });

  const { data: summaryData, isLoading: summaryLoading } = useQuery<{
    totalViews: number;
    totalSubscribers: number;
    totalOptimizations: number;
    connectedPlatforms: number;
    viewsGrowth: number;
    subsGrowth: number;
    estimatedImpact: { viewsMultiplier: number; subsMultiplier: number; revenueMultiplier: number };
  }>({
    queryKey: ["/api/growth/summary"],
  });

  const config = METRIC_CONFIG[metric];
  const chartData = useMemo(() => safeArray(impactData?.chartData), [impactData]);

  const handleRangeChange = useCallback((v: string) => setRange(v), []);
  const handleMetricChange = useCallback((v: string) => setMetric(v as MetricType), []);

  if (impactLoading || summaryLoading) {
    return (
      <Card data-testid="card-growth-impact-loading">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20" />)}
          </div>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  const summary = impactData?.summary;
  const sd = summaryData;

  return (
    <Card data-testid="card-growth-impact">
      <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          <CardTitle className="text-base font-semibold" data-testid="text-growth-title">AI Growth Impact</CardTitle>
          {summary && summary.viewsLift > 0 && (
            <Badge variant="secondary" className="text-[10px]" data-testid="badge-views-lift">
              <ArrowUpRight className="w-3 h-3 mr-0.5" />
              +{summary.viewsLift}% views
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Select value={metric} onValueChange={handleMetricChange}>
            <SelectTrigger className="w-[130px] h-8 text-xs" data-testid="select-metric">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="views" data-testid="option-views">
                <span className="flex items-center gap-1.5"><Eye className="w-3 h-3" /> Views</span>
              </SelectItem>
              <SelectItem value="subscribers" data-testid="option-subscribers">
                <span className="flex items-center gap-1.5"><Users className="w-3 h-3" /> Subscribers</span>
              </SelectItem>
              <SelectItem value="revenue" data-testid="option-revenue">
                <span className="flex items-center gap-1.5"><DollarSign className="w-3 h-3" /> Revenue</span>
              </SelectItem>
            </SelectContent>
          </Select>
          <Select value={range} onValueChange={handleRangeChange}>
            <SelectTrigger className="w-[110px] h-8 text-xs" data-testid="select-range">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGE_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value} data-testid={`option-range-${opt.value}`}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            icon={Eye}
            label="Total Views"
            value={config.format(sd?.totalViews || 0)}
            change={sd && sd.viewsGrowth !== 0 ? `${sd.viewsGrowth > 0 ? "+" : ""}${sd.viewsGrowth}%` : undefined}
            positive={(sd?.viewsGrowth || 0) > 0}
          />
          <StatCard
            icon={Users}
            label="Subscribers"
            value={config.format(sd?.totalSubscribers || 0)}
            change={sd && sd.subsGrowth !== 0 ? `${sd.subsGrowth > 0 ? "+" : ""}${sd.subsGrowth}%` : undefined}
            positive={(sd?.subsGrowth || 0) > 0}
          />
          <StatCard
            icon={Zap}
            label="AI Optimizations"
            value={String(sd?.totalOptimizations || 0)}
          />
          <StatCard
            icon={TrendingUp}
            label="Platforms"
            value={String(sd?.connectedPlatforms || 0)}
          />
        </div>

        <div className="rounded-md border border-border p-3 sm:p-4" data-testid="chart-container-growth">
          <div className="flex items-center gap-4 mb-3 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs">
              <div className="w-3 h-0.5 rounded" style={{ backgroundColor: config.baselineColor }} />
              <span className="text-muted-foreground">Without AI</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <div className="w-3 h-0.5 rounded" style={{ backgroundColor: config.color }} />
              <span className="text-muted-foreground">With AI</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <div className="w-3 h-0.5 rounded border-dashed border-t-2" style={{ borderColor: config.projectedColor }} />
              <span className="text-muted-foreground">Projected</span>
            </div>
          </div>

          {chartData.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[280px] text-center" data-testid="empty-growth-chart">
              <BarChart3 className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">No growth data yet</p>
              <p className="text-xs text-muted-foreground/70 mt-1 max-w-xs">
                Connect your channels and let the AI optimize your content. Growth tracking will appear here automatically.
              </p>
            </div>
          ) : chartData.length > 0 && !impactData?.summary?.totalOptimizations ? (
            <div className="relative">
              <Badge variant="secondary" className="absolute top-0 right-0 z-10 text-[10px]">
                Estimated Projection
              </Badge>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={chartData} margin={{ top: 20, right: 5, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id={`gradient-baseline-${metric}-est`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={config.baselineColor} stopOpacity={0.15} />
                      <stop offset="100%" stopColor={config.baselineColor} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id={`gradient-actual-${metric}-est`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={config.color} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={config.color} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} tickFormatter={config.format} width={55} />
                  <Tooltip content={<CustomTooltip metric={metric} />} />
                  <Area type="monotone" dataKey={config.baselineKey} name="Without AI (est.)" stroke={config.baselineColor} strokeWidth={2} strokeDasharray="4 4" fill={`url(#gradient-baseline-${metric}-est)`} dot={false} />
                  <Area type="monotone" dataKey={config.actualKey} name="With AI (est.)" stroke={config.color} strokeWidth={2.5} strokeDasharray="4 4" fill={`url(#gradient-actual-${metric}-est)`} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={`gradient-baseline-${metric}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={config.baselineColor} stopOpacity={0.15} />
                    <stop offset="100%" stopColor={config.baselineColor} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id={`gradient-actual-${metric}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={config.color} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={config.color} stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id={`gradient-projected-${metric}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={config.projectedColor} stopOpacity={0.1} />
                    <stop offset="100%" stopColor={config.projectedColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={config.format}
                  width={55}
                />
                <Tooltip content={<CustomTooltip metric={metric} />} />
                <Area
                  type="monotone"
                  dataKey={config.baselineKey}
                  name="Without AI"
                  stroke={config.baselineColor}
                  strokeWidth={2}
                  fill={`url(#gradient-baseline-${metric})`}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2 }}
                />
                <Area
                  type="monotone"
                  dataKey={config.actualKey}
                  name="With AI"
                  stroke={config.color}
                  strokeWidth={2.5}
                  fill={`url(#gradient-actual-${metric})`}
                  dot={false}
                  activeDot={{ r: 5, strokeWidth: 2 }}
                />
                <Area
                  type="monotone"
                  dataKey={config.projectedKey}
                  name="Projected"
                  stroke={config.projectedColor}
                  strokeWidth={1.5}
                  strokeDasharray="6 3"
                  fill={`url(#gradient-projected-${metric})`}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {summary && (summary.viewsLift !== 0 || summary.subsLift !== 0) && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center" data-testid="growth-summary-stats">
            <div className="p-3 rounded-md bg-primary/5 border border-primary/10">
              <p className="text-xs text-muted-foreground">Views Lift</p>
              <p className={`text-lg font-bold ${summary.viewsLift > 0 ? "text-green-400" : "text-muted-foreground"}`}>
                {summary.viewsLift > 0 ? "+" : ""}{summary.viewsLift}%
              </p>
            </div>
            <div className="p-3 rounded-md bg-primary/5 border border-primary/10">
              <p className="text-xs text-muted-foreground">Subscriber Lift</p>
              <p className={`text-lg font-bold ${summary.subsLift > 0 ? "text-green-400" : "text-muted-foreground"}`}>
                {summary.subsLift > 0 ? "+" : ""}{summary.subsLift}%
              </p>
            </div>
            <div className="p-3 rounded-md bg-primary/5 border border-primary/10">
              <p className="text-xs text-muted-foreground">Optimizations Applied</p>
              <p className="text-lg font-bold text-primary">{summary.totalOptimizations}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
