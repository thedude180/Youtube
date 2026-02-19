import { useState, useEffect, useRef } from "react";
import { ShieldCheck, Shield, ShieldAlert } from "lucide-react";

interface StealthRingProps {
  score: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
  "data-testid"?: string;
}

export function StealthRing({ score, size = 100, strokeWidth = 6, className = "", ...props }: StealthRingProps) {
  const percentage = Math.round(score * 100);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const [animatedOffset, setAnimatedOffset] = useState(circumference);
  const animRef = useRef<number>();

  const targetOffset = circumference - (percentage / 100) * circumference;

  useEffect(() => {
    const start = performance.now();
    const from = circumference;
    const to = targetOffset;
    const duration = 1200;

    const animate = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 4);
      setAnimatedOffset(from + (to - from) * eased);
      if (progress < 1) {
        animRef.current = requestAnimationFrame(animate);
      }
    };

    animRef.current = requestAnimationFrame(animate);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [targetOffset, circumference]);

  const color = percentage >= 90 ? "#22c55e" : percentage >= 70 ? "#eab308" : "#ef4444";
  const label = percentage >= 90 ? "Invisible" : percentage >= 70 ? "Low Risk" : "Detectable";
  const Icon = percentage >= 90 ? ShieldCheck : percentage >= 70 ? Shield : ShieldAlert;

  return (
    <div className={`relative inline-flex flex-col items-center ${className}`} data-testid={props["data-testid"]}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={animatedOffset}
          strokeLinecap="round"
          style={{
            filter: `drop-shadow(0 0 6px ${color}40)`,
            transition: "stroke 0.3s ease",
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold" style={{ color }}>{percentage}%</span>
      </div>
      <div className="flex items-center gap-1 mt-1.5">
        <Icon className="h-3.5 w-3.5" style={{ color }} />
        <span className="text-xs font-medium" style={{ color }}>{label}</span>
      </div>
    </div>
  );
}
