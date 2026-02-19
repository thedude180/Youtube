import { useState, useEffect } from "react";
import { Clock } from "lucide-react";

interface CountdownTimerProps {
  targetDate: string | Date;
  className?: string;
  compact?: boolean;
  "data-testid"?: string;
}

function getTimeLeft(target: Date) {
  const now = Date.now();
  const diff = target.getTime() - now;
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, total: 0 };

  return {
    days: Math.floor(diff / 86400000),
    hours: Math.floor((diff % 86400000) / 3600000),
    minutes: Math.floor((diff % 3600000) / 60000),
    seconds: Math.floor((diff % 60000) / 1000),
    total: diff,
  };
}

export function CountdownTimer({ targetDate, className = "", compact = false, ...props }: CountdownTimerProps) {
  const target = targetDate instanceof Date ? targetDate : new Date(targetDate);
  const isValid = !isNaN(target.getTime());
  const [timeLeft, setTimeLeft] = useState(() => isValid ? getTimeLeft(target) : { days: 0, hours: 0, minutes: 0, seconds: 0, total: 0 });

  useEffect(() => {
    if (!isValid) return;
    const interval = setInterval(() => {
      setTimeLeft(getTimeLeft(target));
    }, 1000);
    return () => clearInterval(interval);
  }, [target.getTime(), isValid]);

  if (!isValid) return null;

  if (timeLeft.total <= 0) {
    return (
      <span className={`inline-flex items-center gap-1 text-xs text-emerald-500 font-medium ${className}`} data-testid={props["data-testid"]}>
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
        </span>
        Publishing...
      </span>
    );
  }

  if (compact) {
    if (timeLeft.days > 0) {
      return <span className={`text-xs text-muted-foreground ${className}`} data-testid={props["data-testid"]}>{timeLeft.days}d {timeLeft.hours}h</span>;
    }
    return (
      <span className={`text-xs font-mono tabular-nums text-muted-foreground ${className}`} data-testid={props["data-testid"]}>
        {String(timeLeft.hours).padStart(2, "0")}:{String(timeLeft.minutes).padStart(2, "0")}:{String(timeLeft.seconds).padStart(2, "0")}
      </span>
    );
  }

  return (
    <div className={`inline-flex items-center gap-1.5 ${className}`} data-testid={props["data-testid"]}>
      <Clock className="h-3 w-3 text-muted-foreground" />
      <div className="flex items-center gap-1">
        {timeLeft.days > 0 && (
          <span className="text-xs font-medium">{timeLeft.days}<span className="text-muted-foreground">d</span></span>
        )}
        <span className="text-xs font-mono tabular-nums">
          {String(timeLeft.hours).padStart(2, "0")}
          <span className="text-muted-foreground animate-pulse">:</span>
          {String(timeLeft.minutes).padStart(2, "0")}
          <span className="text-muted-foreground animate-pulse">:</span>
          {String(timeLeft.seconds).padStart(2, "0")}
        </span>
      </div>
    </div>
  );
}
