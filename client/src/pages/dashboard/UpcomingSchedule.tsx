import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarDays, CheckCircle2, Clock } from "lucide-react";

interface ScheduleDay {
  date: string;
  longFormQueued: number;
  longFormOnYouTube: number;
  shortsQueued: number;
  shortsOnYouTube: number;
}

interface ScheduleResult {
  days: ScheduleDay[];
  targets: { shortsPerDay: number; longFormPerDay: number };
  timezone: string;
}

function shortDots(queued: number, onYouTube: number, target: number) {
  return Array.from({ length: target }, (_, i) => {
    const filled = i < onYouTube + queued;
    const live = i < onYouTube;
    return (
      <span
        key={i}
        data-testid={`short-dot-${i}`}
        className={[
          "inline-block w-2.5 h-2.5 rounded-full border",
          live
            ? "bg-red-500 border-red-500"
            : filled
            ? "bg-amber-400 border-amber-400"
            : "bg-transparent border-zinc-600",
        ].join(" ")}
      />
    );
  });
}

function LongFormIcon({ queued, onYouTube }: { queued: number; onYouTube: number }) {
  const total = queued + onYouTube;
  if (onYouTube > 0)
    return <CheckCircle2 data-testid="longform-icon-live" className="h-4 w-4 text-red-500" />;
  if (queued > 0)
    return <Clock data-testid="longform-icon-queued" className="h-4 w-4 text-amber-400" />;
  return <span data-testid="longform-icon-empty" className="inline-block w-4 h-4 rounded border border-zinc-700" />;
}

function dayLabel(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  if (date.getTime() === today.getTime()) return "Today";
  if (date.getTime() === tomorrow.getTime()) return "Tmrw";
  return date.toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric" });
}

function rowColor(day: ScheduleDay, shortTarget: number, lfTarget: number) {
  const shortsTotal = day.shortsQueued + day.shortsOnYouTube;
  const lfTotal = day.longFormQueued + day.longFormOnYouTube;
  const empty = shortsTotal === 0 && lfTotal === 0;
  const full = shortsTotal >= shortTarget && lfTotal >= lfTarget;
  if (empty) return "bg-red-950/20 border-red-900/40";
  if (full) return "bg-emerald-950/20 border-emerald-900/40";
  return "bg-amber-950/10 border-amber-900/30";
}

export default function UpcomingSchedule() {
  const { data, isLoading, isError } = useQuery<ScheduleResult>({
    queryKey: ["/api/youtube/schedule/upcoming"],
    refetchInterval: 5 * 60_000,
  });

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-zinc-400" />
          <CardTitle className="text-sm font-semibold text-zinc-200">14-Day Schedule Preview</CardTitle>
          <div className="ml-auto flex items-center gap-3 text-[10px] text-zinc-500">
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-red-500" /> Live on YouTube
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-amber-400" /> Queued
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full border border-zinc-600" /> Empty
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading && (
          <div className="space-y-1.5">
            {Array.from({ length: 7 }, (_, i) => (
              <Skeleton key={i} className="h-8 w-full rounded bg-zinc-800" />
            ))}
          </div>
        )}
        {isError && (
          <p className="text-xs text-red-400 py-4 text-center">Failed to load schedule</p>
        )}
        {data && (
          <>
            <div className="grid grid-cols-[72px_1fr_32px] gap-x-3 text-[10px] text-zinc-500 uppercase tracking-wide px-2 pb-1">
              <span>Date</span>
              <span>Shorts (3/day)</span>
              <span className="text-center">Long</span>
            </div>
            <div className="space-y-1">
              {data.days.map((day) => (
                <div
                  key={day.date}
                  data-testid={`schedule-row-${day.date}`}
                  className={[
                    "grid grid-cols-[72px_1fr_32px] gap-x-3 items-center px-2 py-1.5 rounded border text-xs",
                    rowColor(day, data.targets.shortsPerDay, data.targets.longFormPerDay),
                  ].join(" ")}
                >
                  <span className="text-zinc-300 font-medium truncate">{dayLabel(day.date)}</span>
                  <span className="flex items-center gap-1">
                    {shortDots(day.shortsQueued, day.shortsOnYouTube, data.targets.shortsPerDay)}
                    {day.shortsQueued + day.shortsOnYouTube === 0 && (
                      <span className="text-[10px] text-zinc-600 ml-1">no shorts</span>
                    )}
                    {day.shortsOnYouTube > 0 && (
                      <Badge variant="outline" className="ml-1 text-[9px] px-1 py-0 border-red-700 text-red-400">
                        {day.shortsOnYouTube} live
                      </Badge>
                    )}
                  </span>
                  <span className="flex justify-center">
                    <LongFormIcon queued={day.longFormQueued} onYouTube={day.longFormOnYouTube} />
                  </span>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-zinc-600 mt-3 text-center">
              All times CT · Red = live on YouTube · Amber = queued, uploading next run
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
