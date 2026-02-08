import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Calendar, Plus, Clock, Film, Radio, FileText, Trash2, CheckCircle2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format, startOfWeek, addDays, isToday, isSameDay, isFuture } from "date-fns";
import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const TYPE_ICONS: Record<string, any> = {
  video: Film, stream: Radio, post: FileText,
};

const TYPE_COLORS: Record<string, string> = {
  video: "bg-red-500/10 text-red-400 border-red-500/20",
  stream: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  post: "bg-blue-500/10 text-blue-400 border-blue-500/20",
};

const STATUS_COLORS: Record<string, string> = {
  scheduled: "default",
  completed: "secondary",
  cancelled: "outline",
};

export default function Schedule() {
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: items, isLoading } = useQuery<any[]>({ queryKey: ['/api/schedule'] });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/schedule", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/schedule'] });
      setDialogOpen(false);
      toast({ title: "Scheduled", description: "Item added to your content calendar" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/schedule/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/schedule'] });
      toast({ title: "Removed", description: "Schedule item deleted" });
    },
  });

  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const getItemsForDate = (date: Date) => {
    if (!items) return [];
    return items.filter((item: any) => {
      const itemDate = new Date(item.scheduledAt);
      return isSameDay(itemDate, date);
    });
  };

  const upcoming = (items || [])
    .filter((item: any) => isFuture(new Date(item.scheduledAt)) && item.status === 'scheduled')
    .sort((a: any, b: any) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
    .slice(0, 10);

  const completedCount = (items || []).filter((i: any) => i.status === 'completed').length;
  const scheduledCount = (items || []).filter((i: any) => i.status === 'scheduled').length;

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const dateStr = formData.get("date") as string;
    const timeStr = formData.get("time") as string;
    const scheduledAt = new Date(`${dateStr}T${timeStr}`);

    createMutation.mutate({
      title: formData.get("title"),
      type: formData.get("type"),
      platform: formData.get("platform") || "youtube",
      scheduledAt: scheduledAt.toISOString(),
      metadata: { autoPublish: true, aiOptimized: true },
    });
  };

  if (isLoading) return <ScheduleSkeleton />;

  return (
    <div className="p-8 space-y-8 max-w-[1600px] mx-auto animate-in fade-in duration-500">
      <div className="flex justify-between items-end gap-4 flex-wrap">
        <div>
          <h1 data-testid="text-page-title" className="text-3xl font-display font-bold">Content Calendar</h1>
          <p className="text-muted-foreground mt-2">AI-optimized publishing schedule across all platforms</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="px-3 py-1.5">
            <Clock className="w-3.5 h-3.5 mr-1.5" />
            {scheduledCount} Upcoming
          </Badge>
          <Badge variant="outline" className="px-3 py-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
            {completedCount} Completed
          </Badge>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-schedule">
                <Plus className="w-4 h-4 mr-2" />
                Schedule
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Schedule Content</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <Label htmlFor="title">Title</Label>
                  <Input id="title" name="title" required data-testid="input-schedule-title" placeholder="Content title" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="type">Type</Label>
                    <Select name="type" defaultValue="video">
                      <SelectTrigger data-testid="select-schedule-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="video">Video</SelectItem>
                        <SelectItem value="stream">Stream</SelectItem>
                        <SelectItem value="post">Community Post</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="platform">Platform</Label>
                    <Select name="platform" defaultValue="youtube">
                      <SelectTrigger data-testid="select-schedule-platform">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="youtube">YouTube</SelectItem>
                        <SelectItem value="twitch">Twitch</SelectItem>
                        <SelectItem value="tiktok">TikTok</SelectItem>
                        <SelectItem value="kick">Kick</SelectItem>
                        <SelectItem value="x">X/Twitter</SelectItem>
                        <SelectItem value="instagram">Instagram</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="date">Date</Label>
                    <Input id="date" name="date" type="date" required data-testid="input-schedule-date"
                      defaultValue={format(selectedDate, 'yyyy-MM-dd')}
                    />
                  </div>
                  <div>
                    <Label htmlFor="time">Time</Label>
                    <Input id="time" name="time" type="time" required data-testid="input-schedule-time" defaultValue="15:00" />
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-submit-schedule">
                  {createMutation.isPending ? "Scheduling..." : "Add to Calendar"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2">
        {weekDays.map((day) => {
          const dayItems = getItemsForDate(day);
          const today = isToday(day);
          return (
            <div
              key={day.toISOString()}
              data-testid={`calendar-day-${format(day, 'yyyy-MM-dd')}`}
              className={`min-h-[160px] rounded-lg border p-3 cursor-pointer transition-colors ${
                today ? 'border-primary bg-primary/5' :
                isSameDay(day, selectedDate) ? 'border-primary/50 bg-secondary/50' :
                'border-border'
              }`}
              onClick={() => setSelectedDate(day)}
            >
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-medium ${today ? 'text-primary' : 'text-muted-foreground'}`}>
                  {format(day, 'EEE')}
                </span>
                <span className={`text-sm font-bold ${today ? 'text-primary' : ''}`}>
                  {format(day, 'd')}
                </span>
              </div>
              <div className="space-y-1">
                {dayItems.map((item: any) => {
                  const TypeIcon = TYPE_ICONS[item.type] || FileText;
                  const colorClass = TYPE_COLORS[item.type] || TYPE_COLORS.post;
                  return (
                    <div key={item.id} className={`text-xs p-1.5 rounded border ${colorClass} truncate flex items-center gap-1`}>
                      <TypeIcon className="w-3 h-3 shrink-0" />
                      <span className="truncate">{item.title}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-4">
          <h2 className="text-xl font-bold font-display">Upcoming</h2>
          <Card>
            {upcoming.length === 0 ? (
              <CardContent className="p-12 text-center text-muted-foreground">
                <Calendar className="w-12 h-12 mx-auto opacity-20 mb-4" />
                <p>Nothing scheduled yet.</p>
                <p className="text-sm opacity-60">Use the button above to schedule content.</p>
              </CardContent>
            ) : (
              <div className="divide-y divide-border/50">
                {upcoming.map((item: any) => {
                  const TypeIcon = TYPE_ICONS[item.type] || FileText;
                  const colorClass = TYPE_COLORS[item.type] || TYPE_COLORS.post;
                  return (
                    <div key={item.id} data-testid={`row-schedule-${item.id}`} className="p-4 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`p-2 rounded-lg shrink-0 ${colorClass.split(' ').slice(0, 2).join(' ')}`}>
                          <TypeIcon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{item.title}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(item.scheduledAt), "MMM d, h:mm a")}
                            </span>
                            <Badge variant="secondary" className="text-[10px] py-0">{item.platform}</Badge>
                          </div>
                        </div>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        data-testid={`button-delete-schedule-${item.id}`}
                        onClick={() => deleteMutation.mutate(item.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <h2 className="text-xl font-bold font-display">
            {format(selectedDate, 'EEEE, MMMM d')}
          </h2>
          <Card>
            {getItemsForDate(selectedDate).length === 0 ? (
              <CardContent className="p-12 text-center text-muted-foreground">
                <Clock className="w-12 h-12 mx-auto opacity-20 mb-4" />
                <p>Nothing scheduled for this day.</p>
              </CardContent>
            ) : (
              <div className="divide-y divide-border/50">
                {getItemsForDate(selectedDate).map((item: any) => {
                  const TypeIcon = TYPE_ICONS[item.type] || FileText;
                  return (
                    <div key={item.id} className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <TypeIcon className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium text-sm">{item.title}</span>
                        <Badge variant={(STATUS_COLORS[item.status] || "default") as any}>{item.status}</Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{format(new Date(item.scheduledAt), "h:mm a")}</span>
                        <span>{item.platform}</span>
                        <span className="capitalize">{item.type}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function ScheduleSkeleton() {
  return (
    <div className="p-8 space-y-8">
      <Skeleton className="h-10 w-48" />
      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-40 rounded-lg" />
        ))}
      </div>
    </div>
  );
}
