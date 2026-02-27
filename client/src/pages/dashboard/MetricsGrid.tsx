import { memo, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { AnimatedCounter } from "@/components/AnimatedCounter";
import { Sparkline } from "@/components/Sparkline";
import { TrendIndicator } from "@/components/TrendIndicator";
import type { LucideIcon } from "lucide-react";

interface MetricItem {
  label: string;
  value: string | number;
  icon: LucideIcon;
  trend?: { current: number; previous: number };
  sparklineData?: number[];
  isCounter?: boolean;
}

interface MetricsGridProps {
  metrics: MetricItem[];
}

function generateFakeSparkline(value: number, seed: number): number[] {
  const points: number[] = [];
  let v = Math.max(1, value * 0.6);
  for (let i = 0; i < 8; i++) {
    v += (Math.sin(seed + i * 1.3) * value * 0.15);
    points.push(Math.max(0, Math.round(v)));
  }
  points.push(typeof value === "number" ? value : 0);
  return points;
}

const METRIC_GRADIENTS = [
  "from-violet-500/10 to-purple-500/5",
  "from-emerald-500/10 to-green-500/5",
  "from-blue-500/10 to-cyan-500/5",
  "from-amber-500/10 to-orange-500/5",
];

const METRIC_ICON_COLORS = [
  "bg-violet-500/15 text-violet-400",
  "bg-emerald-500/15 text-emerald-400",
  "bg-blue-500/15 text-blue-400",
  "bg-amber-500/15 text-amber-400",
];

export default memo(function MetricsGrid({ metrics }: MetricsGridProps) {
  const sparklines = useMemo(() =>
    metrics.map((m, i) => {
      if (m.sparklineData) return m.sparklineData;
      const numVal = typeof m.value === "number" ? m.value : parseFloat(String(m.value).replace(/[^0-9.]/g, ""));
      if (isNaN(numVal) || numVal === 0) return null;
      return generateFakeSparkline(numVal, i * 7 + 13);
    }),
    [metrics]
  );

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
      {metrics.map((m, i) => {
        const Icon = m.icon;
        const numericValue = typeof m.value === "number" ? m.value : parseFloat(String(m.value).replace(/[^0-9.]/g, ""));
        const isNumeric = !isNaN(numericValue) && (typeof m.value === "number" || m.isCounter);
        const prefix = typeof m.value === "string" && m.value.startsWith("$") ? "$" : "";
        const sparkData = sparklines[i];
        const gradient = METRIC_GRADIENTS[i % METRIC_GRADIENTS.length];
        const iconColor = METRIC_ICON_COLORS[i % METRIC_ICON_COLORS.length];

        return (
          <Card key={m.label} className="shine gradient-border group hover-lift hover:shadow-lg hover:shadow-primary/5 transition-all duration-500 relative overflow-hidden" data-testid={`metric-${m.label.toLowerCase().replace(/\s+/g, '-')}`}>
            <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
            <CardContent className="p-4 relative">
              <div className="flex items-center justify-between gap-1 mb-1 flex-wrap">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{m.label}</span>
                <div className={`h-7 w-7 rounded-lg flex items-center justify-center transition-all duration-300 ${iconColor} group-hover:scale-110`}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
              </div>
              <div className="flex items-end justify-between gap-2">
                <div>
                  {isNumeric ? (
                    <AnimatedCounter
                      value={numericValue}
                      prefix={prefix}
                      className="text-2xl font-extrabold font-display"
                      data-testid={`text-metric-value-${m.label.toLowerCase().replace(/\s+/g, '-')}`}
                    />
                  ) : (
                    <p className="text-2xl font-extrabold font-display" data-testid={`text-metric-value-${m.label.toLowerCase().replace(/\s+/g, '-')}`}>{m.value}</p>
                  )}
                  {m.trend && (
                    <TrendIndicator
                      current={m.trend.current}
                      previous={m.trend.previous}
                      className="mt-0.5"
                      data-testid={`trend-${m.label.toLowerCase().replace(/\s+/g, '-')}`}
                    />
                  )}
                </div>
                {sparkData && sparkData.length >= 2 && (
                  <Sparkline
                    data={sparkData}
                    width={64}
                    height={24}
                    data-testid={`sparkline-${m.label.toLowerCase().replace(/\s+/g, '-')}`}
                  />
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
});
