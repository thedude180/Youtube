import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface TrendIndicatorProps {
  current: number;
  previous: number;
  format?: "percent" | "absolute" | "currency";
  className?: string;
  "data-testid"?: string;
}

export function TrendIndicator({
  current,
  previous,
  format = "percent",
  className = "",
  ...props
}: TrendIndicatorProps) {
  if (previous === 0 && current === 0) return null;

  const diff = current - previous;
  const pctChange = previous === 0 ? (current > 0 ? 100 : 0) : (diff / previous) * 100;
  const isUp = diff > 0;
  const isFlat = Math.abs(pctChange) < 1;

  let displayValue: string;
  if (format === "currency") {
    displayValue = `${isUp ? "+" : ""}$${Math.abs(diff).toLocaleString()}`;
  } else if (format === "absolute") {
    displayValue = `${isUp ? "+" : ""}${diff.toLocaleString()}`;
  } else {
    displayValue = `${isUp ? "+" : ""}${pctChange.toFixed(1)}%`;
  }

  if (isFlat) {
    return (
      <span className={`inline-flex items-center gap-0.5 text-[10px] text-muted-foreground ${className}`} data-testid={props["data-testid"]}>
        <Minus className="h-2.5 w-2.5" />
        <span>0%</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[10px] font-medium ${isUp ? "text-emerald-500" : "text-red-500"} ${className}`}
      data-testid={props["data-testid"]}
    >
      {isUp ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
      <span>{displayValue}</span>
    </span>
  );
}
