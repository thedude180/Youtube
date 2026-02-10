import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format, startOfWeek, addDays, isToday, isSameDay } from "date-fns";
import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function Schedule() {
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formType, setFormType] = useState("video");
  const [formPlatform, setFormPlatform] = useState("youtube");

  const { data: items, isLoading } = useQuery<any[]>({ queryKey: ['/api/schedule'] });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/schedule", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/schedule'] });
      setDialogOpen(false);
      toast({ title: "Scheduled" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/schedule/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/schedule'] });
      toast({ title: "Removed" });
    },
  });

  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const getItemsForDate = (date: Date) =>
    (items || []).filter((item: any) => isSameDay(new Date(item.scheduledAt), date));

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createMutation.mutate({
      title: fd.get("title"),
      type: formType,
      platform: formPlatform,
      scheduledAt: new Date(`${fd.get("date")}T${fd.get("time")}`).toISOString(),
    });
  };

  if (isLoading) {
    return (
      <div className="p-6 lg:p-8 space-y-6 max-w-5xl mx-auto">
        <Skeleton className="h-8 w-32" />
        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-md" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-5xl mx-auto">
      <div className="flex justify-between items-center gap-4 flex-wrap">
        <div>
          <h1 data-testid="text-page-title" className="text-2xl font-display font-bold">Calendar</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {(items || []).filter((i: any) => i.status === 'scheduled').length} upcoming
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-schedule" size="sm">
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
                <Input name="title" required data-testid="input-schedule-title" placeholder="Content title" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Type</Label>
                  <Select value={formType} onValueChange={setFormType}>
                    <SelectTrigger data-testid="select-schedule-type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="video">Video</SelectItem>
                      <SelectItem value="stream">Stream</SelectItem>
                      <SelectItem value="post">Post</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Platform</Label>
                  <Select value={formPlatform} onValueChange={setFormPlatform}>
                    <SelectTrigger data-testid="select-schedule-platform"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="youtube">YouTube</SelectItem>
                      <SelectItem value="twitch">Twitch</SelectItem>
                      <SelectItem value="tiktok">TikTok</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Date</Label>
                  <Input name="date" type="date" required data-testid="input-schedule-date" defaultValue={format(selectedDate, 'yyyy-MM-dd')} />
                </div>
                <div>
                  <Label>Time</Label>
                  <Input name="time" type="time" required data-testid="input-schedule-time" defaultValue="15:00" />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-submit-schedule">
                {createMutation.isPending ? "Saving..." : "Schedule"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-7 gap-2">
        {weekDays.map((day) => {
          const dayItems = getItemsForDate(day);
          const today = isToday(day);
          const selected = isSameDay(day, selectedDate);
          return (
            <div
              key={day.toISOString()}
              data-testid={`calendar-day-${format(day, 'yyyy-MM-dd')}`}
              className={`min-h-[120px] rounded-md border p-2 cursor-pointer transition-colors ${
                today ? 'border-primary bg-primary/5' :
                selected ? 'border-border bg-secondary/30' :
                'border-border'
              }`}
              onClick={() => setSelectedDate(day)}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">{format(day, 'EEE')}</span>
                <span className={`text-xs font-medium ${today ? 'text-primary' : ''}`}>{format(day, 'd')}</span>
              </div>
              <div className="space-y-1">
                {dayItems.map((item: any) => (
                  <div key={item.id} className="text-xs p-1 rounded bg-secondary truncate">
                    {item.title}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div>
        <h2 className="text-lg font-display font-bold mb-3">
          {format(selectedDate, 'EEEE, MMMM d')}
        </h2>
        <Card>
          {getItemsForDate(selectedDate).length === 0 ? (
            <CardContent className="flex flex-col items-center justify-center py-8 text-center">
              <Calendar className="w-8 h-8 text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">Nothing scheduled</p>
            </CardContent>
          ) : (
            <div className="divide-y divide-border/50">
              {getItemsForDate(selectedDate).map((item: any) => (
                <div key={item.id} data-testid={`row-schedule-${item.id}`} className="p-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{item.title}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(item.scheduledAt), "h:mm a")}
                      </span>
                      <Badge variant="secondary" className="text-xs capitalize">{item.platform}</Badge>
                      <Badge variant="outline" className="text-xs capitalize">{item.type}</Badge>
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
              ))}
            </div>
          )}
        </Card>
      </div>
      <ContentIdeasSection />
    </div>
  );
}

function ContentIdeasSection() {
  const { data: ideas, isLoading } = useQuery<any[]>({ queryKey: ['/api/content-ideas'] });

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-6 w-40" />
        <div className="grid gap-2 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-md" />
          ))}
        </div>
      </div>
    );
  }

  if (!ideas || ideas.length === 0) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-display font-bold">Content Ideas</h2>
      <div className="grid gap-2 sm:grid-cols-2">
        {ideas.map((idea: any) => (
          <Card key={idea.id} data-testid={`card-content-idea-${idea.id}`} className="hover-elevate">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p data-testid={`text-idea-title-${idea.id}`} className="text-sm font-medium truncate">{idea.title}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {idea.niche && (
                      <span className="text-xs text-muted-foreground">{idea.niche}</span>
                    )}
                    <Badge variant={idea.status === 'idea' ? 'secondary' : idea.status === 'planned' ? 'default' : 'outline'} className="text-xs capitalize" data-testid={`badge-idea-status-${idea.id}`}>
                      {idea.status}
                    </Badge>
                  </div>
                  {idea.createdAt && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {format(new Date(idea.createdAt), "MMM d, yyyy")}
                    </p>
                  )}
                </div>
                <a href="/advisor">
                  <Button size="sm" variant="outline" data-testid={`button-plan-idea-${idea.id}`}>
                    Plan This
                  </Button>
                </a>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
