import { Card, CardContent } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";

interface MetricItem {
  label: string;
  value: string | number;
  icon: LucideIcon;
}

interface MetricsGridProps {
  metrics: MetricItem[];
}

export default function MetricsGrid({ metrics }: MetricsGridProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {metrics.map((m) => {
        const Icon = m.icon;
        return (
          <Card key={m.label} data-testid={`metric-${m.label.toLowerCase().replace(/\s+/g, '-')}`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-1 mb-2 flex-wrap">
                <span className="text-xs text-muted-foreground">{m.label}</span>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-xl font-bold font-display">{m.value}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
