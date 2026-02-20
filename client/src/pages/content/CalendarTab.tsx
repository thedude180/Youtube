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
  ChevronLeft, ChevronRight, Video, Radio, Upload, Clock,
} from "lucide-react";
import { PlatformBadge } from "@/components/PlatformIcon";
import { QueryErrorReset } from "@/components/QueryErrorReset";
import {
  format, startOfWeek, endOfWeek, addDays, addWeeks, subWeeks,
  addMonths, subMonths, addYears, subYears,
  startOfMonth, endOfMonth,
  isToday, isSameDay, isSameMonth,
  eachDayOfInterval,
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

interface UploadEntry {
  id: string;
  title: string;
  date: Date;
  time: string;
  platform: string;
  contentType: string;
  status: string;
  canDelete?: boolean;
  rawId?: number;
}

function CalendarTab() {
  const { toast } = useToast();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formType, setFormType] = useState("video");
  const [formPlatform, setFormPlatform] = useState("youtube");
  const [detailDate, setDetailDate] = useState<Date | null>(null);

  const { data: calendarData, isLoading, error: calendarError } =
    useQuery<any[]>({ queryKey: ["/api/calendar/uploads"], refetchInterval: 30_000, staleTime: 20_000 });

  const uploads = useMemo<UploadEntry[]>(() => {
    if (!calendarData) return [];
    return calendarData
      .filter((item: any) => item.date)
      .map((item: any) => {
        const d = new Date(item.date);
        if (isNaN(d.getTime())) return null;
        return {
          id: item.id,
          title: item.title,
          date: d,
          time: format(d, "h:mm a"),
          platform: item.platform || "youtube",
          contentType: item.contentType || "video",
          status: item.status || "scheduled",
          canDelete: item.canDelete || false,
          rawId: item.rawId,
        } as UploadEntry;
      })
      .filter(Boolean) as UploadEntry[];
  }, [calendarData]);

  const getEntriesForDate = (date: Date) =>
    uploads.filter((e) => isSameDay(e.date, date));

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/schedule", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar/uploads"] });
      setDialogOpen(false);
      toast({ title: "Scheduled" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/schedule/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar/uploads"] });
      toast({ title: "Removed" });
    },
  });

  const rescheduleMutation = useMutation({
    mutationFn: async ({ id, newDate }: { id: number; newDate: string }) => {
      const res = await apiRequest("PATCH", `/api/schedule/${id}`, { scheduledAt: newDate });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar/uploads"] });
      toast({ title: "Rescheduled" });
    },
  });

  const [dragOverDate, setDragOverDate] = useState<string | null>(null);

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

  if (calendarError)
    return (
      <QueryErrorReset
        error={calendarError}
        queryKey={["/api/calendar/uploads"]}
        label="Failed to load upload schedule"
      />
    );

  const scheduledCount = uploads.filter((e) => e.status === "scheduled").length;
  const uploadedCount = uploads.filter((e) => e.status === "uploaded").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
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
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3 text-blue-400" />
              {scheduledCount} scheduled
            </span>
            <span className="flex items-center gap-1">
              <Upload className="w-3 h-3 text-emerald-400" />
              {uploadedCount} uploaded
            </span>
          </div>
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
                Schedule Upload
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Schedule Upload</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <Label>Title</Label>
                  <Input
                    name="title"
                    required
                    data-testid="input-schedule-title"
                    placeholder="Video title"
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
                    <Label>Upload Date</Label>
                    <Input
                      name="date"
                      type="date"
                      required
                      defaultValue={format(selectedDate, "yyyy-MM-dd")}
                      data-testid="input-schedule-date"
                    />
                  </div>
                  <div>
                    <Label>Upload Time</Label>
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
                  {createMutation.isPending ? "Saving..." : "Schedule Upload"}
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
          entries={uploads}
          selectedDate={selectedDate}
          onSelectDate={(d) => {
            setSelectedDate(d);
            setDetailDate(d);
          }}
          onDelete={(id) => deleteMutation.mutate(id)}
          rescheduleMutation={rescheduleMutation}
          dragOverDate={dragOverDate}
          setDragOverDate={setDragOverDate}
        />
      )}
      {viewMode === "month" && (
        <MonthView
          date={currentDate}
          entries={uploads}
          selectedDate={selectedDate}
          onSelectDate={(d) => {
            setSelectedDate(d);
            setDetailDate(d);
          }}
          onDayClick={(d) => {
            setCurrentDate(d);
            setViewMode("day");
          }}
          rescheduleMutation={rescheduleMutation}
          dragOverDate={dragOverDate}
          setDragOverDate={setDragOverDate}
        />
      )}
      {viewMode === "year" && (
        <YearView
          date={currentDate}
          entries={uploads}
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

function UploadStatusBadge({ status }: { status: string }) {
  const isUploaded = status === "uploaded";
  return (
    <Badge
      variant="secondary"
      className={`text-xs no-default-hover-elevate no-default-active-elevate ${
        isUploaded
          ? "bg-emerald-500/15 text-emerald-400"
          : "bg-blue-500/15 text-blue-400"
      }`}
    >
      {isUploaded ? (
        <Upload className="w-3 h-3 mr-1" />
      ) : (
        <Clock className="w-3 h-3 mr-1" />
      )}
      {isUploaded ? "Uploaded" : "Scheduled"}
    </Badge>
  );
}

function ContentIcon({ contentType }: { contentType: string }) {
  if (contentType === "stream") {
    return <Radio className="w-3.5 h-3.5 shrink-0 text-red-400" />;
  }
  return <Video className="w-3.5 h-3.5 shrink-0 text-red-400" />;
}

function DayView({
  date,
  entries,
  onDelete,
}: {
  date: Date;
  entries: UploadEntry[];
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
            <p className="text-sm text-muted-foreground">No uploads scheduled</p>
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
                      <UploadRow
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

function UploadRow({
  entry,
  onDelete,
}: {
  entry: UploadEntry;
  onDelete: (id: number) => void;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 p-2 rounded bg-secondary/30 mb-1 ${entry.rawId ? "cursor-grab active:cursor-grabbing" : ""}`}
      draggable={!!entry.rawId}
      onDragStart={(e) => {
        if (entry.rawId) {
          e.dataTransfer.setData("entryId", String(entry.rawId));
          e.dataTransfer.setData("entryTitle", entry.title);
          e.dataTransfer.effectAllowed = "move";
        }
      }}
      data-testid={`entry-${entry.id}`}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <ContentIcon contentType={entry.contentType} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate" data-testid={`text-title-${entry.id}`}>
            {entry.title}
          </p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-xs text-muted-foreground" data-testid={`text-time-${entry.id}`}>
              {entry.time}
            </span>
            <PlatformBadge platform={entry.platform} className="text-xs" />
            <UploadStatusBadge status={entry.status} />
          </div>
        </div>
      </div>
      {entry.canDelete && entry.rawId && (
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
              <AlertDialogTitle>Remove Scheduled Upload</AlertDialogTitle>
              <AlertDialogDescription>
                This will remove &quot;{entry.title}&quot; from the upload schedule.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => onDelete(entry.rawId!)}
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
  rescheduleMutation,
  dragOverDate,
  setDragOverDate,
}: {
  date: Date;
  entries: UploadEntry[];
  selectedDate: Date;
  onSelectDate: (d: Date) => void;
  onDelete: (id: number) => void;
  rescheduleMutation: any;
  dragOverDate: string | null;
  setDragOverDate: (d: string | null) => void;
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
            } ${dragOverDate === day.toISOString() ? "ring-2 ring-primary/50 bg-primary/5" : ""}`}
            onClick={() => onSelectDate(day)}
            onDragOver={(e) => { e.preventDefault(); setDragOverDate(day.toISOString()); }}
            onDragLeave={() => setDragOverDate(null)}
            onDrop={(e) => { e.preventDefault(); const entryId = e.dataTransfer.getData("entryId"); if (entryId) { rescheduleMutation.mutate({ id: Number(entryId), newDate: day.toISOString() }); } setDragOverDate(null); }}
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
                    entry.status === "uploaded"
                      ? "bg-emerald-500/10 text-emerald-300"
                      : "bg-blue-500/10 text-blue-300"
                  }`}
                  data-testid={`week-entry-${entry.id}`}
                >
                  <ContentIcon contentType={entry.contentType} />
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
  rescheduleMutation,
  dragOverDate,
  setDragOverDate,
}: {
  date: Date;
  entries: UploadEntry[];
  selectedDate: Date;
  onSelectDate: (d: Date) => void;
  onDayClick: (d: Date) => void;
  rescheduleMutation: any;
  dragOverDate: string | null;
  setDragOverDate: (d: string | null) => void;
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
              } ${dragOverDate === day.toISOString() ? "ring-2 ring-primary/50 bg-primary/5" : ""}`}
              onClick={() => onSelectDate(day)}
              onDoubleClick={() => onDayClick(day)}
              onDragOver={(e) => { e.preventDefault(); setDragOverDate(day.toISOString()); }}
              onDragLeave={() => setDragOverDate(null)}
              onDrop={(e) => { e.preventDefault(); const entryId = e.dataTransfer.getData("entryId"); if (entryId) { rescheduleMutation.mutate({ id: Number(entryId), newDate: day.toISOString() }); } setDragOverDate(null); }}
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
                      entry.status === "uploaded"
                        ? "bg-emerald-500/10 text-emerald-300"
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
  entries: UploadEntry[];
  onMonthClick: (month: number) => void;
}) {
  const year = date.getFullYear();
  const months = Array.from({ length: 12 }, (_, i) => i);
  const today = new Date();

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
      {months.map((month) => {
        const monthEntries = entries.filter(
          (e) => e.date.getMonth() === month && e.date.getFullYear() === year,
        );
        const scheduledCount = monthEntries.filter((e) => e.status === "scheduled").length;
        const uploadedCount = monthEntries.filter((e) => e.status === "uploaded").length;
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
                {scheduledCount > 0 && (
                  <span className="text-xs flex items-center gap-1 text-blue-400">
                    <Clock className="w-3 h-3" />
                    {scheduledCount}
                  </span>
                )}
                {uploadedCount > 0 && (
                  <span className="text-xs flex items-center gap-1 text-emerald-400">
                    <Upload className="w-3 h-3" />
                    {uploadedCount}
                  </span>
                )}
                {scheduledCount === 0 && uploadedCount === 0 && (
                  <span className="text-xs text-muted-foreground">
                    No uploads
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
  entries: UploadEntry[];
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

function DetailPanel({
  date,
  entries,
  onDelete,
  onClose,
}: {
  date: Date;
  entries: UploadEntry[];
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
            <p className="text-sm text-muted-foreground">No uploads scheduled</p>
          </div>
        ) : (
          <div className="space-y-2">
            {entries.map((entry) => (
              <UploadRow key={entry.id} entry={entry} onDelete={onDelete} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default CalendarTab;
