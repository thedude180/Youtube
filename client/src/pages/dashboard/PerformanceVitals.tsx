import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Gauge, Zap, Eye, LayoutDashboard, Timer } from "lucide-react";

interface VitalSummary {
  avg: number;
  p75: number;
  p95: number;
  count: number;
  rating: Record<string, number>;
}

const VITAL_CONFIG: Record<string, { label: string; unit: string; icon: typeof Gauge; goodThreshold: number; needsImprovementThreshold: number }> = {
  LCP: { label: "Largest Contentful Paint", unit: "ms", icon: Eye, goodThreshold: 2500, needsImprovementThreshold: 4000 },
  CLS: { label: "Cumulative Layout Shift", unit: "", icon: LayoutDashboard, goodThreshold: 0.1, needsImprovementThreshold: 0.25 },
  INP: { label: "Interaction to Next Paint", unit: "ms", icon: Zap, goodThreshold: 200, needsImprovementThreshold: 500 },
  FCP: { label: "First Contentful Paint", unit: "ms", icon: Timer, goodThreshold: 1800, needsImprovementThreshold: 3000 },
  TTFB: { label: "Time to First Byte", unit: "ms", icon: Gauge, goodThreshold: 800, needsImprovementThreshold: 1800 },
};

function getRating(name: string, value: number): "good" | "needs-improvement" | "poor" {
  const config = VITAL_CONFIG[name];
  if (!config) return "good";
  if (value <= config.goodThreshold) return "good";
  if (value <= config.needsImprovementThreshold) return "needs-improvement";
  return "poor";
}

function ratingColor(rating: string) {
  if (rating === "good") return "bg-emerald-500/15 text-emerald-400 border-emerald-500/20";
  if (rating === "needs-improvement") return "bg-amber-500/15 text-amber-400 border-amber-500/20";
  return "bg-red-500/15 text-red-400 border-red-500/20";
}

function formatVital(name: string, value: number): string {
  if (name === "CLS") return value.toFixed(3);
  return Math.round(value).toLocaleString();
}

export default function PerformanceVitals() {
  const { data } = useQuery<{ summary: Record<string, VitalSummary>; totalSamples: number }>({
    queryKey: ["/api/vitals/summary"],
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  if (!data?.summary || Object.keys(data.summary).length === 0) return null;

  const coreVitals = ["LCP", "CLS", "INP"].filter(v => data.summary[v]);
  const otherVitals = ["FCP", "TTFB"].filter(v => data.summary[v]);
  const allVitals = [...coreVitals, ...otherVitals];

  if (allVitals.length === 0) return null;

  const overallScore = allVitals.reduce((acc, name) => {
    const rating = getRating(name, data.summary[name].p75);
    return acc + (rating === "good" ? 1 : rating === "needs-improvement" ? 0.5 : 0);
  }, 0);
  const scorePercent = Math.round((overallScore / allVitals.length) * 100);

  return (
    <Card data-testid="card-performance-vitals">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <Gauge className="w-4 h-4" />
            Performance Score
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge
              variant="secondary"
              className={`text-xs font-bold ${scorePercent >= 80 ? "bg-emerald-500/15 text-emerald-400" : scorePercent >= 50 ? "bg-amber-500/15 text-amber-400" : "bg-red-500/15 text-red-400"}`}
              data-testid="badge-perf-score"
            >
              {scorePercent}/100
            </Badge>
            <span className="text-[10px] text-muted-foreground">{data.totalSamples} samples</span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {allVitals.map((name) => {
            const vital = data.summary[name];
            const config = VITAL_CONFIG[name];
            if (!config) return null;
            const Icon = config.icon;
            const rating = getRating(name, vital.p75);
            return (
              <div
                key={name}
                className={`rounded-lg border p-2.5 ${ratingColor(rating)} transition-all duration-300`}
                data-testid={`vital-${name.toLowerCase()}`}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon className="w-3 h-3" />
                  <span className="text-[10px] font-bold uppercase tracking-wider">{name}</span>
                </div>
                <p className="text-lg font-bold font-display">
                  {formatVital(name, vital.p75)}<span className="text-[10px] font-normal ml-0.5">{config.unit}</span>
                </p>
                <p className="text-[10px] opacity-70 mt-0.5">{config.label}</p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
