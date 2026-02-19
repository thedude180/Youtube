import { useMemo } from "react";

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  filled?: boolean;
  className?: string;
  "data-testid"?: string;
}

export function Sparkline({
  data,
  width = 80,
  height = 28,
  color = "hsl(var(--primary))",
  filled = true,
  className = "",
  ...props
}: SparklineProps) {
  const safeData = data && data.length >= 2 ? data : [];

  const path = useMemo(() => {
    if (safeData.length < 2) return "";
    const max = Math.max(...safeData, 1);
    const min = Math.min(...safeData, 0);
    const range = max - min || 1;
    const step = width / (safeData.length - 1);
    const padding = 2;
    const h = height - padding * 2;

    const points = safeData.map((v, i) => ({
      x: i * step,
      y: padding + h - ((v - min) / range) * h,
    }));

    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const cpx1 = prev.x + step * 0.4;
      const cpx2 = curr.x - step * 0.4;
      d += ` C ${cpx1} ${prev.y}, ${cpx2} ${curr.y}, ${curr.x} ${curr.y}`;
    }
    return d;
  }, [safeData, width, height]);

  const fillPath = useMemo(() => {
    if (!filled || !path) return "";
    return `${path} L ${width} ${height} L 0 ${height} Z`;
  }, [filled, path, width, height]);

  const trend = useMemo(() => {
    if (safeData.length < 2) return 0;
    const recent = safeData.slice(-3);
    const older = safeData.slice(0, 3);
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
    return olderAvg === 0 ? 0 : ((recentAvg - olderAvg) / olderAvg) * 100;
  }, [safeData]);

  const lastPointY = useMemo(() => {
    if (safeData.length < 2) return height / 2;
    const max = Math.max(...safeData, 1);
    const min = Math.min(...safeData, 0);
    const range = max - min || 1;
    const padding = 2;
    const h = height - padding * 2;
    return padding + h - ((safeData[safeData.length - 1] - min) / range) * h;
  }, [safeData, height]);

  if (safeData.length < 2) return null;

  const trendColor = trend >= 0 ? "text-emerald-500" : "text-red-500";

  return (
    <div className={`flex items-end gap-1.5 ${className}`} data-testid={props["data-testid"]}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
        {filled && fillPath && (
          <path
            d={fillPath}
            fill={`url(#sparkline-gradient-${props["data-testid"] || "default"})`}
            opacity={0.15}
          />
        )}
        <path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="drop-shadow-sm"
        />
        <circle
          cx={width}
          cy={lastPointY}
          r={2}
          fill={color}
          className="animate-pulse"
        />
        <defs>
          <linearGradient id={`sparkline-gradient-${props["data-testid"] || "default"}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.4} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
      </svg>
      {Math.abs(trend) > 0.5 && (
        <span className={`text-[10px] font-medium ${trendColor} whitespace-nowrap`}>
          {trend > 0 ? "+" : ""}{trend.toFixed(0)}%
        </span>
      )}
    </div>
  );
}
