import { useState, useEffect, useMemo } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { format } from "date-fns";

function getRelativeTime(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function getUpdateInterval(date: Date): number {
  const diff = Date.now() - date.getTime();
  if (diff < 60000) return 10000;
  if (diff < 3600000) return 60000;
  return 300000;
}

interface LiveTimestampProps {
  date: string | Date;
  className?: string;
  showTooltip?: boolean;
  "data-testid"?: string;
}

export function LiveTimestamp({ date, className, showTooltip = true, ...props }: LiveTimestampProps) {
  const dateObj = useMemo(() => (date instanceof Date ? date : new Date(date)), [date]);
  const [text, setText] = useState(() => getRelativeTime(dateObj));

  useEffect(() => {
    const tick = () => setText(getRelativeTime(dateObj));
    tick();
    const interval = setInterval(tick, getUpdateInterval(dateObj));
    return () => clearInterval(interval);
  }, [dateObj]);

  const fullDate = useMemo(() => format(dateObj, "PPpp"), [dateObj]);

  const el = (
    <time
      dateTime={dateObj.toISOString()}
      className={className || "text-xs text-muted-foreground tabular-nums"}
      data-testid={props["data-testid"]}
    >
      {text}
    </time>
  );

  if (!showTooltip) return el;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{el}</TooltipTrigger>
      <TooltipContent>{fullDate}</TooltipContent>
    </Tooltip>
  );
}
