import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Calendar } from "lucide-react";
import { PlatformBadge } from "@/components/PlatformIcon";
import { QueryErrorReset } from "@/components/QueryErrorReset";
import { format, startOfWeek, addDays, isToday, isSameDay } from "date-fns";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

function CalendarTab() {
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formType, setFormType] = useState("video");
  const [formPlatform, setFormPlatform] = useState("youtube");

  const { data: items, isLoading, error } = useQuery<any[]>({ queryKey: ['/api/schedule'] });

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
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/schedule/${id}`); },
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
      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-md" />)}
      </div>
    );
  }

  if (error) return <QueryErrorReset error={error} queryKey={["/api/schedule"]} label="Failed to load schedule" />;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" data-testid="button-add-schedule">
              <Plus className="w-4 h-4 mr-1" />Schedule
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Schedule Content</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <Label>Title</Label>
                <Input name="title" required data-testid="input-schedule-title" placeholder="Content title" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Type</Label>
                  <Select value={formType} onValueChange={setFormType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
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
                    <SelectTrigger><SelectValue /></SelectTrigger>
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
                  <Input name="date" type="date" required defaultValue={format(selectedDate, 'yyyy-MM-dd')} />
                </div>
                <div>
                  <Label>Time</Label>
                  <Input name="time" type="time" required defaultValue="15:00" />
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
              className={`min-h-[120px] rounded-md border p-2 cursor-pointer transition-colors ${
                today ? 'border-primary bg-primary/5' : selected ? 'border-border bg-secondary/30' : 'border-border'
              }`}
              onClick={() => setSelectedDate(day)}
              data-testid={`calendar-day-${format(day, 'yyyy-MM-dd')}`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">{format(day, 'EEE')}</span>
                <span className={`text-xs font-medium ${today ? 'text-primary' : ''}`}>{format(day, 'd')}</span>
              </div>
              <div className="space-y-1">
                {dayItems.map((item: any) => (
                  <div key={item.id} className="text-xs p-1 rounded bg-secondary truncate">{item.title}</div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold mb-3">{format(selectedDate, 'EEEE, MMMM d')}</h3>
          {getItemsForDate(selectedDate).length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6">
              <Calendar className="w-8 h-8 text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">Nothing scheduled</p>
            </div>
          ) : (
            <div className="space-y-2">
              {getItemsForDate(selectedDate).map((item: any) => (
                <div key={item.id} className="flex items-center justify-between gap-4 p-2 rounded bg-secondary/30">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{item.title}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-xs text-muted-foreground">{format(new Date(item.scheduledAt), "h:mm a")}</span>
                      <PlatformBadge platform={item.platform} className="text-xs" />
                    </div>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="icon" variant="ghost" data-testid={`button-delete-schedule-${item.id}`}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove Scheduled Item</AlertDialogTitle>
                        <AlertDialogDescription>This will remove "{item.title}" from the schedule. This cannot be undone.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteMutation.mutate(item.id)} className="bg-destructive text-destructive-foreground" data-testid={`button-confirm-delete-schedule-${item.id}`}>Remove</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default CalendarTab;
