import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Trash2, Calendar as CalendarIcon,
  ChevronLeft, ChevronRight, Video, Radio, FileText,
  Eye, Rocket, Bot, Workflow, Zap,
} from "lucide-react";
import { PlatformBadge, PlatformIcon } from "@/components/PlatformIcon";
import { QueryErrorReset } from "@/components/QueryErrorReset";
import {
  format, startOfWeek, endOfWeek, addDays, addWeeks, subWeeks,
  addMonths, subMonths, addYears, subYears,
  startOfMonth, endOfMonth, startOfYear, endOfYear,
  isToday, isSameDay, isSameMonth, isSameYear,
  eachDayOfInterval, getDay, getWeek,
} from "date-fns";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type ViewMode = "day" | "week" | "month" | "year";

interface CalendarEntry {
  id: number | string;
  title: string;
  date: Date;
  type: "schedule" | "video" | "autopilot" | "pipeline";
  pipelineType?: "vod" | "live" | "replay";
  platform?: string;
  contentType?: string;
  status?: string;
  time?: string;
  completedSteps?: number;
  totalSteps?: number;
  currentStep?: string;
  raw?: any;
}

const TYPE_ICONS: Record<string, any> = {
  video: Video,
  stream: Radio,
  post: FileText,
};

function CalendarTab() {
  const { toast } = useToast();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formType, setFormType] = useState("video");
  const [formPlatform, setFormPlatform] = useState("youtube");
  const [detailDate, setDetailDate] = useState<Date | null>(null);

  const { data: scheduleItemsData, isLoading: schedLoading, error: schedError } =
    useQuery<any[]>({ queryKey: ["/api/schedule"] });

  const { data: videosList, isLoading: vidsLoading, error: vidsError } =
    useQuery<any[]>({ queryKey: ["/api/videos"] });

  const { data: autopilotFeed, isLoading: apLoading } =
    useQuery<any[]>({ queryKey: ["/api/autopilot/calendar-feed"] });

  const { data: pipelineFeed, isLoading: pipLoading } =
    useQuery<any[]>({ queryKey: ["/api/pipelines/calendar-feed"] });

  const isLoading = schedLoading || vidsLoading || apLoading || pipLoading;

  const calendarEntries = useMemo<CalendarEntry[]>(() => {
    const entries: CalendarEntry[] = [];
    if (scheduleItemsData) {
      for (const item of scheduleItemsData) {
        entries.push({
          id: `s-${item.id}`,
          title: item.title,
          date: new Date(item.scheduledAt),
          type: "schedule",
          platform: item.platform,
          contentType: item.type,
          status: item.status,
          time: format(new Date(item.scheduledAt), "h:mm a"),
          raw: item,
        });
      }
    }
    if (videosList) {
      for (const vid of videosList) {
        const d = vid.publishedAt
          ? new Date(vid.publishedAt)
          : vid.scheduledTime
            ? new Date(vid.scheduledTime)
            : vid.createdAt
              ? new Date(vid.createdAt)
              : new Date();
        entries.push({
          id: `v-${vid.id}`,
          title: vid.title,
          date: d,
          type: "video",
          platform: vid.platform || "youtube",
          contentType: vid.type,
          status: vid.status,
          time: format(d, "h:mm a"),
          raw: vid,
        });
      }
    }
    if (autopilotFeed) {
      for (const item of autopilotFeed) {
        const d = item.date ? new Date(item.date) : new Date();
        entries.push({
          id: item.id,
          title: item.title,
          date: d,
          type: "autopilot",
          platform: item.platform,
          contentType: item.contentType,
          status: item.status,
          time: format(d, "h:mm a"),
          raw: item,
        });
      }
    }
    if (pipelineFeed) {
      for (const item of pipelineFeed) {
        const d = item.date ? new Date(item.date) : new Date();
        entries.push({
          id: item.id,
          title: item.title,
          date: d,
          type: "pipeline",
          pipelineType: item.pipelineType,
          platform: item.platform || "youtube",
          contentType: item.contentType,
          status: item.status,
          currentStep: item.currentStep,
          completedSteps: item.completedSteps,
          totalSteps: item.totalSteps,
          time: format(d, "h:mm a"),
          raw: item,
        });
      }
    }
    return entries.sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [scheduleItemsData, videosList, autopilotFeed, pipelineFeed]);

  const getEntriesForDate = (date: Date) =>
    calendarEntries.filter((e) => isSameDay(e.date, date));

  const getEntriesForMonth = (month: number, year: number) =>
    calendarEntries.filter(
      (e) => e.date.getMonth() === month && e.date.getFullYear() === year,
    );

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/schedule", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/schedule"] });
      setDialogOpen(false);
      toast({ title: "Scheduled" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/schedule/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/schedule"] });
      toast({ title: "Removed" });
    },
  });

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createMutation.mutate({
      title: fd.get("title"),
      type: formType,
      platform: formPlatform,
      scheduledAt: new Date(
        `${fd.get("date")}T${fd.get("time")}`,
      ).toISOString(),
    });
  };

  const navigateBack = () => {
    if (viewMode === "day") setCurrentDate(addDays(currentDate, -1));
    else if (viewMode === "week") setCurrentDate(subWeeks(currentDate, 1));
    else if (viewMode === "month") setCurrentDate(subMonths(currentDate, 1));
    else setCurrentDate(subYears(currentDate, 1));
  };

  const navigateForward = () => {
    if (viewMode === "day") setCurrentDate(addDays(currentDate, 1));
    else if (viewMode === "week") setCurrentDate(addWeeks(currentDate, 1));
    else if (viewMode === "month") setCurrentDate(addMonths(currentDate, 1));
    else setCurrentDate(addYears(currentDate, 1));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
    setSelectedDate(new Date());
  };

  const getHeaderLabel = () => {
    if (viewMode === "day") return format(currentDate, "EEEE, MMMM d, yyyy");
    if (viewMode === "week") {
      const ws = startOfWeek(currentDate, { weekStartsOn: 1 });
      const we = endOfWeek(currentDate, { weekStartsOn: 1 });
      return `${format(ws, "MMM d")} - ${format(we, "MMM d, yyyy")}`;
    }
    if (viewMode === "month") return format(currentDate, "MMMM yyyy");
    return format(currentDate, "yyyy");
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-20 rounded-md" />
          ))}
        </div>
        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: 35 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-md" />
          ))}
        </div>
      </div>
    );
  }

  if (schedError)
    return (
      <QueryErrorReset
        error={schedError}
        queryKey={["/api/schedule"]}
        label="Failed to load schedule"
      />
    );

  if (vidsError)
    return (
      <QueryErrorReset
        error={vidsError}
        queryKey={["/api/videos"]}
        label="Failed to load videos"
      />
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {(["day", "week", "month", "year"] as ViewMode[]).map((mode) => (
            <Button
              key={mode}
              variant={viewMode === mode ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode(mode)}
              data-testid={`button-view-${mode}`}
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </Button>
          ))}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="outline"
              onClick={navigateBack}
              data-testid="button-calendar-prev"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={goToToday}
              data-testid="button-calendar-today"
            >
              Today
            </Button>
            <Button
              size="icon"
              variant="outline"
              onClick={navigateForward}
              data-testid="button-calendar-next"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          <span
            className="text-sm font-semibold min-w-[180px] text-center"
            data-testid="text-calendar-header"
          >
            {getHeaderLabel()}
          </span>

          {viewMode !== "year" && (
            <div className="flex items-center gap-1">
              <Select
                value={String(currentDate.getMonth())}
                onValueChange={(v) => {
                  const d = new Date(currentDate);
                  d.setMonth(Number(v));
                  setCurrentDate(d);
                }}
              >
                <SelectTrigger
                  className="w-[120px]"
                  data-testid="select-calendar-month"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => (
                    <SelectItem key={i} value={String(i)}>
                      {format(new Date(2024, i, 1), "MMMM")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={String(currentDate.getFullYear())}
                onValueChange={(v) => {
                  const d = new Date(currentDate);
                  d.setFullYear(Number(v));
                  setCurrentDate(d);
                }}
              >
                <SelectTrigger
                  className="w-[90px]"
                  data-testid="select-calendar-year"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 11 }, (_, i) => {
                    const yr = new Date().getFullYear() - 3 + i;
                    return (
                      <SelectItem key={yr} value={String(yr)}>
                        {yr}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          )}

          {viewMode === "year" && (
            <Select
              value={String(currentDate.getFullYear())}
              onValueChange={(v) => {
                const d = new Date(currentDate);
                d.setFullYear(Number(v));
                setCurrentDate(d);
              }}
            >
              <SelectTrigger
                className="w-[90px]"
                data-testid="select-calendar-year-only"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 11 }, (_, i) => {
                  const yr = new Date().getFullYear() - 3 + i;
                  return (
                    <SelectItem key={yr} value={String(yr)}>
                      {yr}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          )}

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" data-testid="button-add-schedule">
                <Plus className="w-4 h-4 mr-1" />
                Schedule
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Schedule Content</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <Label>Title</Label>
                  <Input
                    name="title"
                    required
                    data-testid="input-schedule-title"
                    placeholder="Content title"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Type</Label>
                    <Select value={formType} onValueChange={setFormType}>
                      <SelectTrigger data-testid="select-schedule-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="video">Video</SelectItem>
                        <SelectItem value="stream">Stream</SelectItem>
                        <SelectItem value="post">Post</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Platform</Label>
                    <Select
                      value={formPlatform}
                      onValueChange={setFormPlatform}
                    >
                      <SelectTrigger data-testid="select-schedule-platform">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="youtube">YouTube</SelectItem>
                        <SelectItem value="twitch">Twitch</SelectItem>
                        <SelectItem value="tiktok">TikTok</SelectItem>
                        <SelectItem value="kick">Kick</SelectItem>
                        <SelectItem value="x">X</SelectItem>
                        <SelectItem value="discord">Discord</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Date</Label>
                    <Input
                      name="date"
                      type="date"
                      required
                      defaultValue={format(selectedDate, "yyyy-MM-dd")}
                      data-testid="input-schedule-date"
                    />
                  </div>
                  <div>
                    <Label>Time</Label>
                    <Input
                      name="time"
                      type="time"
                      required
                      defaultValue="15:00"
                      data-testid="input-schedule-time"
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={createMutation.isPending}
                  data-testid="button-submit-schedule"
                >
                  {createMutation.isPending ? "Saving..." : "Schedule"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {viewMode === "day" && (
        <DayView
          date={currentDate}
          entries={getEntriesForDate(currentDate)}
          onDelete={(id) => deleteMutation.mutate(id)}
        />
      )}
      {viewMode === "week" && (
        <WeekView
          date={currentDate}
          entries={calendarEntries}
          selectedDate={selectedDate}
          onSelectDate={(d) => {
            setSelectedDate(d);
            setDetailDate(d);
          }}
          onDelete={(id) => deleteMutation.mutate(id)}
        />
      )}
      {viewMode === "month" && (
        <MonthView
          date={currentDate}
          entries={calendarEntries}
          selectedDate={selectedDate}
          onSelectDate={(d) => {
            setSelectedDate(d);
            setDetailDate(d);
          }}
          onDayClick={(d) => {
            setCurrentDate(d);
            setViewMode("day");
          }}
        />
      )}
      {viewMode === "year" && (
        <YearView
          date={currentDate}
          entries={calendarEntries}
          onMonthClick={(m) => {
            const d = new Date(currentDate);
            d.setMonth(m);
            setCurrentDate(d);
            setViewMode("month");
          }}
        />
      )}

      {(viewMode === "week" || viewMode === "month") && detailDate && (
        <DetailPanel
          date={detailDate}
          entries={getEntriesForDate(detailDate)}
          onDelete={(id) => deleteMutation.mutate(id)}
          onClose={() => setDetailDate(null)}
        />
      )}
    </div>
  );
}

function EntryBadge({ entry }: { entry: CalendarEntry }) {
  const statusColor =
    entry.status === "scheduled"
      ? "bg-blue-500/15 text-blue-400"
      : entry.status === "draft" || entry.status === "ingested"
        ? "bg-amber-500/15 text-amber-400"
        : entry.status === "processing"
          ? "bg-purple-500/15 text-purple-400"
          : entry.status === "ready" || entry.status === "completed"
            ? "bg-emerald-500/15 text-emerald-400"
            : "bg-muted text-muted-foreground";

  return (
    <Badge
      variant="secondary"
      className={`text-xs no-default-hover-elevate no-default-active-elevate ${statusColor}`}
    >
      {entry.status || "pending"}
    </Badge>
  );
}

function EntryIcon({ entry }: { entry: CalendarEntry }) {
  if (entry.type === "pipeline") {
    if (entry.pipelineType === "live") {
      return <Zap className="w-3 h-3 shrink-0 text-green-400" />;
    }
    return <Workflow className="w-3 h-3 shrink-0 text-cyan-400" />;
  }
  if (entry.type === "autopilot") {
    return <Rocket className="w-3 h-3 shrink-0 text-purple-400" />;
  }
  if (entry.type === "video") {
    return <Video className="w-3 h-3 shrink-0 text-red-400" />;
  }
  const Icon = TYPE_ICONS[entry.contentType || "video"] || FileText;
  return <Icon className="w-3 h-3 shrink-0 text-blue-400" />;
}

function DayView({
  date,
  entries,
  onDelete,
}: {
  date: Date;
  entries: CalendarEntry[];
  onDelete: (id: number) => void;
}) {
  const hours = Array.from({ length: 24 }, (_, i) => i);

  return (
    <Card>
      <CardContent className="p-4">
        <h3
          className="text-sm font-semibold mb-4"
          data-testid="text-day-header"
        >
          {format(date, "EEEE, MMMM d, yyyy")}
        </h3>
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <CalendarIcon className="w-10 h-10 text-muted-foreground/20 mb-3" />
            <p className="text-sm text-muted-foreground">Nothing scheduled</p>
          </div>
        ) : (
          <div className="space-y-1">
            {hours.map((hour) => {
              const hourEntries = entries.filter(
                (e) => e.date.getHours() === hour,
              );
              if (hourEntries.length === 0 && entries.length > 5) {
                return (
                  <div
                    key={hour}
                    className="flex gap-3 min-h-[28px] group"
                    data-testid={`day-hour-${hour}`}
                  >
                    <span className="text-xs text-muted-foreground/50 w-14 pt-1 shrink-0 text-right">
                      {format(new Date(2024, 0, 1, hour), "h a")}
                    </span>
                    <div className="flex-1 border-t border-border/20" />
                  </div>
                );
              }
              return (
                <div
                  key={hour}
                  className="flex gap-3 min-h-[36px] group"
                  data-testid={`day-hour-${hour}`}
                >
                  <span className="text-xs text-muted-foreground w-14 pt-2 shrink-0 text-right">
                    {format(new Date(2024, 0, 1, hour), "h a")}
                  </span>
                  <div className="flex-1 border-t border-border/50 pt-1">
                    {hourEntries.map((entry) => (
                      <EntryRow
                        key={entry.id}
                        entry={entry}
                        onDelete={onDelete}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EntryRow({
  entry,
  onDelete,
}: {
  entry: CalendarEntry;
  onDelete: (id: number) => void;
}) {
  return (
    <div
      className="flex items-center justify-between gap-3 p-2 rounded bg-secondary/30 mb-1"
      data-testid={`entry-${entry.id}`}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <EntryIcon entry={entry} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{entry.title}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-xs text-muted-foreground">{entry.time}</span>
            {entry.platform && (
              <PlatformBadge platform={entry.platform} className="text-xs" />
            )}
            <EntryBadge entry={entry} />
            {entry.type === "video" && (
              <Badge
                variant="secondary"
                className="text-xs no-default-hover-elevate no-default-active-elevate bg-red-500/10 text-red-400"
              >
                <Video className="w-3 h-3 mr-1" />
                Upload
              </Badge>
            )}
            {entry.type === "autopilot" && (
              <Badge
                variant="secondary"
                className="text-xs no-default-hover-elevate no-default-active-elevate bg-purple-500/10 text-purple-400"
              >
                <Bot className="w-3 h-3 mr-1" />
                Autopilot
              </Badge>
            )}
            {entry.type === "pipeline" && (
              <Badge
                variant="secondary"
                className={`text-xs no-default-hover-elevate no-default-active-elevate ${
                  entry.pipelineType === "live"
                    ? "bg-green-500/10 text-green-400"
                    : entry.pipelineType === "replay"
                      ? "bg-orange-500/10 text-orange-400"
                      : "bg-cyan-500/10 text-cyan-400"
                }`}
              >
                {entry.pipelineType === "live" ? (
                  <Zap className="w-3 h-3 mr-1" />
                ) : (
                  <Workflow className="w-3 h-3 mr-1" />
                )}
                {entry.pipelineType === "live" ? "Live Pipeline" : entry.pipelineType === "replay" ? "Replay Pipeline" : "VOD Pipeline"}
              </Badge>
            )}
            {entry.type === "pipeline" && entry.completedSteps != null && entry.totalSteps && (
              <span className="text-xs text-muted-foreground">
                {entry.completedSteps}/{entry.totalSteps} steps
              </span>
            )}
          </div>
        </div>
      </div>
      {entry.type === "schedule" && entry.raw && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              data-testid={`button-delete-${entry.id}`}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove Scheduled Item</AlertDialogTitle>
              <AlertDialogDescription>
                This will remove &quot;{entry.title}&quot; from the schedule.
                This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => onDelete(entry.raw.id)}
                className="bg-destructive text-destructive-foreground"
                data-testid={`button-confirm-delete-${entry.id}`}
              >
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

function WeekView({
  date,
  entries,
  selectedDate,
  onSelectDate,
  onDelete,
}: {
  date: Date;
  entries: CalendarEntry[];
  selectedDate: Date;
  onSelectDate: (d: Date) => void;
  onDelete: (id: number) => void;
}) {
  const weekStart = startOfWeek(date, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <div className="grid grid-cols-7 gap-2">
      {weekDays.map((day) => {
        const dayEntries = entries.filter((e) => isSameDay(e.date, day));
        const today = isToday(day);
        const selected = isSameDay(day, selectedDate);
        return (
          <div
            key={day.toISOString()}
            className={`min-h-[140px] rounded-md border p-2 cursor-pointer transition-colors ${
              today
                ? "border-primary bg-primary/5"
                : selected
                  ? "border-border bg-secondary/30"
                  : "border-border"
            }`}
            onClick={() => onSelectDate(day)}
            data-testid={`calendar-day-${format(day, "yyyy-MM-dd")}`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">
                {format(day, "EEE")}
              </span>
              <span
                className={`text-xs font-medium ${
                  today
                    ? "bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center"
                    : ""
                }`}
              >
                {format(day, "d")}
              </span>
            </div>
            <div className="space-y-1">
              {dayEntries.slice(0, 3).map((entry) => (
                <div
                  key={entry.id}
                  className={`text-xs p-1 rounded truncate flex items-center gap-1 ${
                    entry.type === "pipeline" && entry.pipelineType === "live"
                      ? "bg-green-500/10 text-green-300"
                      : entry.type === "pipeline"
                        ? "bg-cyan-500/10 text-cyan-300"
                        : entry.type === "video"
                          ? "bg-red-500/10 text-red-300"
                          : entry.type === "autopilot"
                            ? "bg-purple-500/10 text-purple-300"
                            : "bg-blue-500/10 text-blue-300"
                  }`}
                  data-testid={`week-entry-${entry.id}`}
                >
                  <EntryIcon entry={entry} />
                  <span className="truncate">{entry.title}</span>
                </div>
              ))}
              {dayEntries.length > 3 && (
                <span className="text-xs text-muted-foreground">
                  +{dayEntries.length - 3} more
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MonthView({
  date,
  entries,
  selectedDate,
  onSelectDate,
  onDayClick,
}: {
  date: Date;
  entries: CalendarEntry[];
  selectedDate: Date;
  onSelectDate: (d: Date) => void;
  onDayClick: (d: Date) => void;
}) {
  const monthStart = startOfMonth(date);
  const monthEnd = endOfMonth(date);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const allDays = eachDayOfInterval({ start: calStart, end: calEnd });

  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {dayNames.map((d) => (
          <div
            key={d}
            className="text-center text-xs font-medium text-muted-foreground py-2"
          >
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {allDays.map((day) => {
          const dayEntries = entries.filter((e) => isSameDay(e.date, day));
          const inMonth = isSameMonth(day, date);
          const today = isToday(day);
          const selected = isSameDay(day, selectedDate);

          return (
            <div
              key={day.toISOString()}
              className={`min-h-[90px] rounded-md border p-1.5 cursor-pointer transition-colors ${
                !inMonth
                  ? "opacity-30 border-transparent"
                  : today
                    ? "border-primary bg-primary/5"
                    : selected
                      ? "border-border bg-secondary/30"
                      : "border-border/50"
              }`}
              onClick={() => onSelectDate(day)}
              onDoubleClick={() => onDayClick(day)}
              data-testid={`month-day-${format(day, "yyyy-MM-dd")}`}
            >
              <div className="flex items-center justify-end mb-1">
                <span
                  className={`text-xs ${
                    today
                      ? "bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center font-bold"
                      : inMonth
                        ? "font-medium"
                        : "text-muted-foreground"
                  }`}
                >
                  {format(day, "d")}
                </span>
              </div>
              <div className="space-y-0.5">
                {dayEntries.slice(0, 2).map((entry) => (
                  <div
                    key={entry.id}
                    className={`text-[10px] leading-tight px-1 py-0.5 rounded truncate ${
                      entry.type === "pipeline" && entry.pipelineType === "live"
                        ? "bg-green-500/10 text-green-300"
                        : entry.type === "pipeline"
                          ? "bg-cyan-500/10 text-cyan-300"
                          : entry.type === "video"
                            ? "bg-red-500/10 text-red-300"
                            : entry.type === "autopilot"
                              ? "bg-purple-500/10 text-purple-300"
                              : "bg-blue-500/10 text-blue-300"
                    }`}
                  >
                    {entry.title}
                  </div>
                ))}
                {dayEntries.length > 2 && (
                  <span className="text-[10px] text-muted-foreground pl-1">
                    +{dayEntries.length - 2}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function YearView({
  date,
  entries,
  onMonthClick,
}: {
  date: Date;
  entries: CalendarEntry[];
  onMonthClick: (month: number) => void;
}) {
  const year = date.getFullYear();
  const months = Array.from({ length: 12 }, (_, i) => i);
  const today = new Date();

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
      {months.map((month) => {
        const monthEntries = getMonthEntries(entries, month, year);
        const videoCount = monthEntries.filter(
          (e) => e.type === "video",
        ).length;
        const schedCount = monthEntries.filter(
          (e) => e.type === "schedule",
        ).length;
        const pipelineCount = monthEntries.filter(
          (e) => e.type === "pipeline",
        ).length;
        const isCurrentMonth =
          today.getMonth() === month && today.getFullYear() === year;

        return (
          <Card
            key={month}
            className={`cursor-pointer hover-elevate ${
              isCurrentMonth ? "border-primary" : ""
            }`}
            onClick={() => onMonthClick(month)}
            data-testid={`year-month-${month}`}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold">
                  {format(new Date(year, month, 1), "MMMM")}
                </span>
                {isCurrentMonth && (
                  <span className="w-2 h-2 rounded-full bg-primary" />
                )}
              </div>

              <MiniMonthGrid
                month={month}
                year={year}
                entries={monthEntries}
              />

              <div className="flex items-center gap-3 mt-3">
                {videoCount > 0 && (
                  <span className="text-xs flex items-center gap-1 text-red-400">
                    <Video className="w-3 h-3" />
                    {videoCount}
                  </span>
                )}
                {schedCount > 0 && (
                  <span className="text-xs flex items-center gap-1 text-blue-400">
                    <CalendarIcon className="w-3 h-3" />
                    {schedCount}
                  </span>
                )}
                {pipelineCount > 0 && (
                  <span className="text-xs flex items-center gap-1 text-cyan-400">
                    <Workflow className="w-3 h-3" />
                    {pipelineCount}
                  </span>
                )}
                {videoCount === 0 && schedCount === 0 && pipelineCount === 0 && (
                  <span className="text-xs text-muted-foreground">
                    No content
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function MiniMonthGrid({
  month,
  year,
  entries,
}: {
  month: number;
  year: number;
  entries: CalendarEntry[];
}) {
  const monthStart = startOfMonth(new Date(year, month, 1));
  const monthEnd = endOfMonth(monthStart);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const allDays = eachDayOfInterval({ start: calStart, end: calEnd });

  return (
    <div className="grid grid-cols-7 gap-px">
      {allDays.slice(0, 42).map((day) => {
        const inMonth = day.getMonth() === month;
        const hasEntries = entries.some((e) => isSameDay(e.date, day));
        const today = isToday(day);
        return (
          <div
            key={day.toISOString()}
            className={`w-full aspect-square flex items-center justify-center text-[8px] leading-none rounded-sm ${
              !inMonth
                ? "opacity-0"
                : today
                  ? "bg-primary text-primary-foreground font-bold"
                  : hasEntries
                    ? "bg-blue-500/20 text-blue-300 font-medium"
                    : "text-muted-foreground"
            }`}
          >
            {inMonth ? format(day, "d") : ""}
          </div>
        );
      })}
    </div>
  );
}

function getMonthEntries(
  entries: CalendarEntry[],
  month: number,
  year: number,
) {
  return entries.filter(
    (e) => e.date.getMonth() === month && e.date.getFullYear() === year,
  );
}

function DetailPanel({
  date,
  entries,
  onDelete,
  onClose,
}: {
  date: Date;
  entries: CalendarEntry[];
  onDelete: (id: number) => void;
  onClose: () => void;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold" data-testid="text-detail-date">
            {format(date, "EEEE, MMMM d, yyyy")}
          </h3>
          <Button
            size="sm"
            variant="ghost"
            onClick={onClose}
            data-testid="button-close-detail"
          >
            Close
          </Button>
        </div>
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6">
            <CalendarIcon className="w-8 h-8 text-muted-foreground/20 mb-2" />
            <p className="text-sm text-muted-foreground">Nothing scheduled</p>
          </div>
        ) : (
          <div className="space-y-2">
            {entries.map((entry) => (
              <EntryRow key={entry.id} entry={entry} onDelete={onDelete} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default CalendarTab;
