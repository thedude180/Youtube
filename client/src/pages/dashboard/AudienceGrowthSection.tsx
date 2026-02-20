import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { safeArray } from "@/lib/safe-data";
import {
  Users,
  Trophy,
  TrendingUp,
  Flame,
  Star,
  Globe,
  Clock,
  Target,
  ArrowUp,
  Crown,
} from "lucide-react";

interface HeatmapHour {
  hour: number;
  activity: number;
  viewers: number;
  engagement: number;
}

interface HeatmapDay {
  day: string;
  hours: HeatmapHour[];
}

interface HeatmapData {
  heatmapData: HeatmapDay[];
  peakTime: { day: string; hour: number };
  totalDataPoints: number;
}

interface MilestoneData {
  currentSubscribers: number;
  achievedMilestones: { milestone: number; achievedAt: string }[];
  nextMilestone: number;
  progress: number;
  estimatedDaysToNext: number;
  dailyGrowthRate: number;
  growthTrend: string;
}

interface ForecastMonth {
  month: string;
  predictedSubscribers: number;
  confidence: number;
}

interface ForecastData {
  currentSubscribers: number;
  monthlyGrowthRate: number;
  forecast: ForecastMonth[];
  yearEndPrediction: number;
  bestCaseScenario: number;
  worstCaseScenario: number;
  accelerators: string[];
}

interface EngagementData {
  overallScore: number;
  components: {
    likeRate: number;
    commentRate: number;
    shareRate: number;
    saveRate: number;
    avgWatchPercentage: number;
    subscriberConversion: number;
  };
  nicheAverage: number;
  percentile: number;
  trend: string;
}

interface Fan {
  username: string;
  engagementScore: number;
  totalComments: number;
  totalWatchTime: number;
  memberSince: string;
  tier: string;
  platforms: string[];
}

interface TopFansData {
  topFans: Fan[];
  totalSuperfans: number;
  superfanGrowthRate: number;
}

interface GeoCountry {
  code: string;
  name: string;
  viewers: number;
  percentage: number;
  avgWatchTime: number;
}

interface GeoData {
  distribution: GeoCountry[];
  primaryLanguage: string;
  internationalPercentage: number;
}

function formatNum(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return n.toLocaleString();
}

function heatColor(activity: number): string {
  if (activity >= 80) return "bg-emerald-500 dark:bg-emerald-400";
  if (activity >= 60) return "bg-emerald-400/70 dark:bg-emerald-500/70";
  if (activity >= 40) return "bg-emerald-300/50 dark:bg-emerald-600/50";
  if (activity >= 20) return "bg-emerald-200/40 dark:bg-emerald-700/40";
  return "bg-muted/30";
}

function tierColor(tier: string): string {
  switch (tier) {
    case "vip": return "bg-amber-500/10 text-amber-400";
    case "superfan": return "bg-purple-500/10 text-purple-400";
    case "member": return "bg-blue-500/10 text-blue-400";
    default: return "bg-muted text-muted-foreground";
  }
}

function HeatmapCard() {
  const { data, isLoading } = useQuery<HeatmapData>({
    queryKey: ["/api/audience/heatmap", "me"],
    refetchInterval: 30_000, staleTime: 20_000,
  });

  if (isLoading) return <Skeleton className="h-48 w-full" />;
  if (!data) return null;

  const hours = [0, 3, 6, 9, 12, 15, 18, 21];

  return (
    <Card data-testid="card-audience-heatmap">
      <CardHeader className="p-2 pb-1">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-sm flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            Activity Heatmap
          </CardTitle>
          <Badge
            variant="secondary"
            className="text-xs no-default-hover-elevate no-default-active-elevate"
            data-testid="badge-peak-time"
          >
            Peak: {data.peakTime.day} {data.peakTime.hour}:00
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-2 pt-0">
        <div className="space-y-0.5">
          <div className="grid gap-0.5" style={{ gridTemplateColumns: "28px repeat(24, 1fr)" }}>
            <div />
            {hours.map((h) => (
              <span
                key={h}
                className="text-[9px] text-muted-foreground text-center col-span-3"
              >
                {h}h
              </span>
            ))}
          </div>
          {safeArray(data.heatmapData).map((row) => (
            <div
              key={row.day}
              className="grid gap-0.5"
              style={{ gridTemplateColumns: "28px repeat(24, 1fr)" }}
              data-testid={`heatmap-row-${row.day.toLowerCase()}`}
            >
              <span className="text-[9px] text-muted-foreground leading-3 flex items-center">
                {row.day}
              </span>
              {row.hours.map((cell) => (
                <div
                  key={cell.hour}
                  className={`h-3 rounded-[2px] ${heatColor(cell.activity)}`}
                  title={`${row.day} ${cell.hour}:00 - ${cell.activity}% activity, ${cell.viewers} viewers`}
                  data-testid={`heatmap-cell-${row.day.toLowerCase()}-${cell.hour}`}
                />
              ))}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function MilestoneCard() {
  const { data, isLoading } = useQuery<MilestoneData>({
    queryKey: ["/api/audience/milestones", "me"],
    refetchInterval: 30_000, staleTime: 20_000,
  });

  if (isLoading) return <Skeleton className="h-32 w-full" />;
  if (!data) return null;

  return (
    <Card data-testid="card-milestone-tracker">
      <CardHeader className="p-2 pb-1">
        <CardTitle className="text-sm flex items-center gap-1.5">
          <Trophy className="h-3.5 w-3.5 text-amber-400" />
          Milestone Tracker
        </CardTitle>
      </CardHeader>
      <CardContent className="p-2 pt-0 space-y-2">
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <span className="text-lg font-bold font-display" data-testid="text-current-subs">
            {formatNum(data.currentSubscribers)}
          </span>
          <span className="text-xs text-muted-foreground">
            Next: {formatNum(data.nextMilestone)}
          </span>
        </div>
        <div className="space-y-1">
          <div className="h-2 w-full rounded-full bg-muted">
            <div
              className="h-2 rounded-full bg-amber-400 transition-all"
              style={{ width: `${Math.min(data.progress, 100)}%` }}
              data-testid="progress-milestone"
            />
          </div>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">{data.progress}%</span>
            <span className="text-xs text-muted-foreground">
              ~{data.estimatedDaysToNext}d remaining
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge
            variant="secondary"
            className={`text-xs no-default-hover-elevate no-default-active-elevate ${
              data.growthTrend === "accelerating"
                ? "bg-emerald-500/10 text-emerald-400"
                : data.growthTrend === "stable"
                ? "bg-blue-500/10 text-blue-400"
                : "bg-amber-500/10 text-amber-400"
            }`}
            data-testid="badge-growth-trend"
          >
            <ArrowUp className="h-3 w-3 mr-0.5" />
            {data.growthTrend}
          </Badge>
          <span className="text-xs text-muted-foreground">
            +{data.dailyGrowthRate}/day
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function ForecastCard() {
  const { data, isLoading } = useQuery<ForecastData>({
    queryKey: ["/api/audience/growth-forecast", "me"],
    refetchInterval: 30_000, staleTime: 20_000,
  });

  if (isLoading) return <Skeleton className="h-32 w-full" />;
  if (!data) return null;

  const maxSubs = data.forecast[data.forecast.length - 1]?.predictedSubscribers || 1;
  const displayMonths = data.forecast.slice(0, 6);

  return (
    <Card data-testid="card-growth-forecast">
      <CardHeader className="p-2 pb-1">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-sm flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
            Growth Forecast
          </CardTitle>
          <span className="text-xs text-muted-foreground">
            +{data.monthlyGrowthRate}%/mo
          </span>
        </div>
      </CardHeader>
      <CardContent className="p-2 pt-0 space-y-2">
        <div className="flex items-end gap-0.5 h-12" data-testid="chart-forecast-bars">
          {displayMonths.map((m, i) => (
            <div key={m.month} className="flex-1 flex flex-col items-center gap-0.5">
              <div
                className="w-full rounded-sm bg-emerald-400/70 dark:bg-emerald-500/60 min-h-[2px]"
                style={{
                  height: `${Math.max(8, (m.predictedSubscribers / maxSubs) * 100)}%`,
                }}
              />
              <span className="text-[8px] text-muted-foreground">
                {m.month.slice(5)}
              </span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-1 text-center">
          <div>
            <p className="text-[10px] text-muted-foreground">Worst</p>
            <p className="text-xs font-medium" data-testid="text-worst-case">
              {formatNum(data.worstCaseScenario)}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Predicted</p>
            <p className="text-xs font-bold" data-testid="text-year-end">
              {formatNum(data.yearEndPrediction)}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Best</p>
            <p className="text-xs font-medium" data-testid="text-best-case">
              {formatNum(data.bestCaseScenario)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EngagementCard() {
  const { data, isLoading } = useQuery<EngagementData>({
    queryKey: ["/api/audience/engagement-score", "me"],
    refetchInterval: 30_000, staleTime: 20_000,
  });

  if (isLoading) return <Skeleton className="h-32 w-full" />;
  if (!data) return null;

  const scoreColor =
    data.overallScore >= 75
      ? "text-emerald-400"
      : data.overallScore >= 50
      ? "text-amber-400"
      : "text-red-400";

  const ringColor =
    data.overallScore >= 75
      ? "stroke-emerald-400"
      : data.overallScore >= 50
      ? "stroke-amber-400"
      : "stroke-red-400";

  const circumference = 2 * Math.PI * 28;
  const strokeDashoffset = circumference - (data.overallScore / 100) * circumference;

  return (
    <Card data-testid="card-engagement-score">
      <CardHeader className="p-2 pb-1">
        <CardTitle className="text-sm flex items-center gap-1.5">
          <Flame className="h-3.5 w-3.5 text-orange-400" />
          Engagement Score
        </CardTitle>
      </CardHeader>
      <CardContent className="p-2 pt-0">
        <div className="flex items-center gap-3">
          <div className="relative w-16 h-16 shrink-0">
            <svg viewBox="0 0 64 64" className="w-16 h-16 -rotate-90">
              <circle
                cx="32"
                cy="32"
                r="28"
                fill="none"
                strokeWidth="4"
                className="stroke-muted"
              />
              <circle
                cx="32"
                cy="32"
                r="28"
                fill="none"
                strokeWidth="4"
                strokeLinecap="round"
                className={ringColor}
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
              />
            </svg>
            <span
              className={`absolute inset-0 flex items-center justify-center text-sm font-bold ${scoreColor}`}
              data-testid="text-engagement-score"
            >
              {data.overallScore}
            </span>
          </div>
          <div className="space-y-1 flex-1 min-w-0">
            <div className="flex items-center justify-between gap-1 flex-wrap">
              <span className="text-xs text-muted-foreground">vs Niche</span>
              <span className="text-xs font-medium">{data.nicheAverage}</span>
            </div>
            <div className="flex items-center justify-between gap-1 flex-wrap">
              <span className="text-xs text-muted-foreground">Percentile</span>
              <span className="text-xs font-medium">Top {100 - data.percentile}%</span>
            </div>
            <Badge
              variant="secondary"
              className={`text-xs no-default-hover-elevate no-default-active-elevate ${
                data.trend === "improving"
                  ? "bg-emerald-500/10 text-emerald-400"
                  : data.trend === "stable"
                  ? "bg-blue-500/10 text-blue-400"
                  : "bg-red-500/10 text-red-400"
              }`}
              data-testid="badge-engagement-trend"
            >
              {data.trend}
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TopFansCard() {
  const { data, isLoading } = useQuery<TopFansData>({
    queryKey: ["/api/audience/top-fans", "me"],
    refetchInterval: 30_000, staleTime: 20_000,
  });

  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (!data) return null;

  return (
    <Card data-testid="card-top-fans">
      <CardHeader className="p-2 pb-1">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-sm flex items-center gap-1.5">
            <Star className="h-3.5 w-3.5 text-purple-400" />
            Top Fans
          </CardTitle>
          <span className="text-xs text-muted-foreground">
            {formatNum(data.totalSuperfans)} superfans
          </span>
        </div>
      </CardHeader>
      <CardContent className="p-2 pt-0">
        <div className="space-y-1">
          {safeArray(data.topFans).slice(0, 5).map((fan, idx) => (
            <div
              key={fan.username}
              className="flex items-center justify-between gap-2"
              data-testid={`row-fan-${idx}`}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-[10px] text-muted-foreground w-3 shrink-0">
                  {idx + 1}
                </span>
                <span className="text-xs truncate">{fan.username}</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Badge
                  variant="secondary"
                  className={`text-[10px] px-1 py-0 no-default-hover-elevate no-default-active-elevate ${tierColor(fan.tier)}`}
                  data-testid={`badge-tier-${idx}`}
                >
                  {fan.tier}
                </Badge>
                <span className="text-[10px] text-muted-foreground">
                  {fan.engagementScore}
                </span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function GeoCard() {
  const { data, isLoading } = useQuery<GeoData>({
    queryKey: ["/api/audience/geo-distribution", "me"],
    refetchInterval: 30_000, staleTime: 20_000,
  });

  if (isLoading) return <Skeleton className="h-32 w-full" />;
  if (!data) return null;

  const sorted = [...safeArray(data.distribution)].sort((a, b) => b.percentage - a.percentage).slice(0, 5);
  const maxPct = sorted[0]?.percentage || 1;

  return (
    <Card data-testid="card-geo-distribution">
      <CardHeader className="p-2 pb-1">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-sm flex items-center gap-1.5">
            <Globe className="h-3.5 w-3.5 text-blue-400" />
            Geo Distribution
          </CardTitle>
          <span className="text-xs text-muted-foreground">
            {data.internationalPercentage}% intl
          </span>
        </div>
      </CardHeader>
      <CardContent className="p-2 pt-0">
        <div className="space-y-1">
          {sorted.map((c) => (
            <div key={c.code} className="space-y-0.5" data-testid={`geo-row-${c.code.toLowerCase()}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs">{c.code}</span>
                <span className="text-[10px] text-muted-foreground">
                  {c.percentage}% · {formatNum(c.viewers)}
                </span>
              </div>
              <div className="h-1 w-full rounded-full bg-muted">
                <div
                  className="h-1 rounded-full bg-blue-400/70"
                  style={{ width: `${(c.percentage / maxPct) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function AudienceGrowthSection() {
  return (
    <div className="space-y-2 max-w-5xl mx-auto" data-testid="section-audience-growth">
      <div className="flex items-center gap-2 flex-wrap">
        <Users className="h-4 w-4 text-purple-400" />
        <h2 className="text-sm font-semibold">Audience Growth</h2>
      </div>

      <HeatmapCard />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        <MilestoneCard />
        <ForecastCard />
        <EngagementCard />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <TopFansCard />
        <GeoCard />
      </div>
    </div>
  );
}
