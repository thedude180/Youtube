import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  title: string;
  value: string | number;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  icon?: React.ElementType;
  className?: string;
  description?: string;
  "data-testid"?: string;
}

export function MetricCard({ title, value, trend, icon: Icon, className, description, "data-testid": testId }: MetricCardProps) {
  return (
    <Card data-testid={testId} className={cn("hover:shadow-md transition-shadow", className)}>
      <CardContent className="p-6">
        <div className="flex justify-between items-start mb-4">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <h3 className="text-2xl font-bold font-display tracking-tight text-foreground">{value}</h3>
          </div>
          {Icon && (
            <div className="h-10 w-10 rounded-lg bg-secondary flex items-center justify-center text-muted-foreground">
              <Icon className="h-5 w-5" />
            </div>
          )}
        </div>

        {(trend || description) && (
          <div className="flex items-center gap-2 text-xs flex-wrap">
            {trend && (
              <span
                className={cn(
                  "flex items-center gap-1 font-medium px-2 py-0.5 rounded-full bg-opacity-10",
                  trend.isPositive ? "text-green-500 bg-green-500" : "text-red-500 bg-red-500"
                )}
              >
                {trend.isPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                {Math.abs(trend.value)}%
              </span>
            )}
            {description && <span className="text-muted-foreground">{description}</span>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
