import { useState, useEffect } from "react";
import { Clock } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function SessionTracker() {
  const [sessionStart] = useState(() => {
    const stored = sessionStorage.getItem("session-start");
    if (stored) return parseInt(stored);
    const now = Date.now();
    sessionStorage.setItem("session-start", String(now));
    return now;
  });

  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - sessionStart) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [sessionStart]);

  const hours = Math.floor(elapsed / 3600);
  const minutes = Math.floor((elapsed % 3600) / 60);

  const display = hours > 0
    ? `${hours}h ${String(minutes).padStart(2, "0")}m`
    : `${minutes}m`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="hidden md:inline-flex items-center gap-1 text-[10px] text-muted-foreground font-mono tabular-nums cursor-default" data-testid="text-session-time">
          <Clock className="h-2.5 w-2.5" />
          {display}
        </span>
      </TooltipTrigger>
      <TooltipContent>Session active for {display}</TooltipContent>
    </Tooltip>
  );
}
