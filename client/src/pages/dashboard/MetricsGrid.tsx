import { memo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { AnimatedCounter } from "@/components/AnimatedCounter";
import type { LucideIcon } from "lucide-react";

interface MetricItem {
  label: string;
  value: string | number;
  icon: LucideIcon;
}

interface MetricsGridProps {
  metrics: MetricItem[];
}

export default memo(function MetricsGrid({ metrics }: MetricsGridProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {metrics.map((m) => {
        const Icon = m.icon;
        const numericValue = typeof m.value === "number" ? m.value : parseFloat(String(m.value).replace(/[^0-9.]/g, ""));
        const isNumeric = !isNaN(numericValue) && typeof m.value === "number";
        const prefix = typeof m.value === "string" && m.value.startsWith("$") ? "$" : "";
        return (
          <Card key={m.label} className="shine" data-testid={`metric-${m.label.toLowerCase().replace(/\s+/g, '-')}`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-1 mb-2 flex-wrap">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{m.label}</span>
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
              </div>
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
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
});
