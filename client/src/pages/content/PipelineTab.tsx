import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { QueryErrorReset } from "@/components/QueryErrorReset";
import {
  Plus, Loader2, ChevronRight, Lightbulb, FileText, Video,
  Scissors, Eye, CalendarClock, CheckCircle2,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";

interface KanbanItem {
  id: number;
  title: string;
  stage: string;
  priority: string;
  platform: string;
  dueDate?: string;
  description?: string;
}

const STAGES = [
  { id: "idea", label: "Idea", icon: Lightbulb, color: "text-yellow-500" },
  { id: "script", label: "Script", icon: FileText, color: "text-blue-500" },
  { id: "filming", label: "Filming", icon: Video, color: "text-purple-500" },
  { id: "editing", label: "Editing", icon: Scissors, color: "text-orange-500" },
  { id: "review", label: "Review", icon: Eye, color: "text-cyan-500" },
  { id: "scheduled", label: "Scheduled", icon: CalendarClock, color: "text-emerald-500" },
  { id: "published", label: "Published", icon: CheckCircle2, color: "text-green-500" },
] as const;

const PRIORITY_COLORS: Record<string, string> = {
  high: "bg-red-500/15 text-red-400",
  medium: "bg-amber-500/15 text-amber-400",
  low: "bg-blue-500/15 text-blue-400",
};

function QuickStats({ items }: { items: KanbanItem[] }) {
  return (
    <div className="flex gap-2 flex-wrap" data-testid="kanban-quick-stats">
      {STAGES.map((stage) => {
        const count = items.filter((i) => i.stage === stage.id).length;
        const Icon = stage.icon;
        return (
          <Badge
            key={stage.id}
            variant="secondary"
            className="gap-1 no-default-hover-elevate no-default-active-elevate"
            data-testid={`stat-${stage.id}`}
          >
            <Icon className={`h-3 w-3 ${stage.color}`} />
            <span className="text-xs">{stage.label}</span>
            <span className="text-xs font-bold">{count}</span>
          </Badge>
        );
      })}
    </div>
  );
}

function KanbanCard({
  item,
  onMoveNext,
  isMoving,
}: {
  item: KanbanItem;
  onMoveNext: () => void;
  isMoving: boolean;
}) {
  const currentIdx = STAGES.findIndex((s) => s.id === item.stage);
  const canMoveNext = currentIdx < STAGES.length - 1;

  return (
    <Card data-testid={`kanban-card-${item.id}`}>
      <CardContent className="p-2 space-y-1.5">
        <p className="text-sm font-medium truncate" data-testid={`kanban-title-${item.id}`}>
          {item.title}
        </p>
        <div className="flex items-center gap-1.5 flex-wrap">
          {item.priority && (
            <Badge
              variant="secondary"
              className={`text-[10px] no-default-hover-elevate no-default-active-elevate ${PRIORITY_COLORS[item.priority] || ""}`}
              data-testid={`kanban-priority-${item.id}`}
            >
              {item.priority}
            </Badge>
          )}
          {item.platform && (
            <Badge
              variant="outline"
              className="text-[10px] no-default-hover-elevate no-default-active-elevate"
              data-testid={`kanban-platform-${item.id}`}
            >
              {item.platform}
            </Badge>
          )}
        </div>
        {item.dueDate && (
          <p className="text-[10px] text-muted-foreground" data-testid={`kanban-due-${item.id}`}>
            Due {format(new Date(item.dueDate), "MMM d")}
          </p>
        )}
        {canMoveNext && (
          <Button
            size="sm"
            variant="ghost"
            className="w-full mt-1"
            onClick={onMoveNext}
            disabled={isMoving}
            data-testid={`button-move-${item.id}`}
          >
            {isMoving ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <ChevronRight className="h-3 w-3 mr-1" />
            )}
            <span className="text-xs">{STAGES[currentIdx + 1].label}</span>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function AddItemDialog({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("medium");
  const [platform, setPlatform] = useState("youtube");
  const [dueDate, setDueDate] = useState("");

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/production/kanban", {
        title,
        stage: "idea",
        priority,
        platform,
        dueDate: dueDate || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/production/kanban"] });
      toast({ title: "Item added" });
      onClose();
    },
    onError: (error: any) => {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs">Title</Label>
        <Input
          placeholder="Content title..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="text-sm"
          data-testid="input-kanban-title"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Priority</Label>
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger data-testid="select-kanban-priority">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Platform</Label>
          <Select value={platform} onValueChange={setPlatform}>
            <SelectTrigger data-testid="select-kanban-platform">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="youtube">YouTube</SelectItem>
              <SelectItem value="tiktok">TikTok</SelectItem>
              <SelectItem value="twitch">Twitch</SelectItem>
              <SelectItem value="instagram">Instagram</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label className="text-xs">Due Date (optional)</Label>
        <Input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="text-sm"
          data-testid="input-kanban-due-date"
        />
      </div>
      <Button
        className="w-full"
        size="sm"
        onClick={() => createMutation.mutate()}
        disabled={createMutation.isPending || !title.trim()}
        data-testid="button-kanban-submit"
      >
        {createMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
        Add Item
      </Button>
    </div>
  );
}

export default function PipelineTab() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [movingId, setMovingId] = useState<number | null>(null);

  const { data: items = [], isLoading, error } = useQuery<KanbanItem[]>({
    queryKey: ["/api/production/kanban"],
    refetchInterval: 3 * 60_000,
    staleTime: 60_000,
  });

  const moveMutation = useMutation({
    mutationFn: async ({ id, stage }: { id: number; stage: string }) => {
      const res = await apiRequest("PATCH", `/api/production/kanban/${id}/stage`, { stage });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/production/kanban"] });
    },
    onError: (error: any) => {
      toast({ title: "Move failed", description: error.message, variant: "destructive" });
    },
    onSettled: () => setMovingId(null),
  });

  const handleMoveNext = (item: KanbanItem) => {
    const currentIdx = STAGES.findIndex((s) => s.id === item.stage);
    if (currentIdx < STAGES.length - 1) {
      setMovingId(item.id);
      moveMutation.mutate({ id: item.id, stage: STAGES[currentIdx + 1].id });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="flex gap-2 flex-wrap">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-20 rounded-md" />
          ))}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-md" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <QueryErrorReset
        error={error}
        queryKey={["/api/production/kanban"]}
        label="Failed to load pipeline"
      />
    );
  }

  return (
    <div className="space-y-3" data-testid="pipeline-tab">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <QuickStats items={items} />
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" data-testid="button-add-kanban-item">
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add Item
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Pipeline Item</DialogTitle>
            </DialogHeader>
            <AddItemDialog onClose={() => setDialogOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2" data-testid="kanban-board">
        {STAGES.map((stage) => {
          const stageItems = items.filter((i) => i.stage === stage.id);
          const Icon = stage.icon;
          return (
            <div key={stage.id} className="space-y-2" data-testid={`kanban-column-${stage.id}`}>
              <div className="flex items-center gap-1.5 p-1.5 rounded-md bg-muted/50">
                <Icon className={`h-3.5 w-3.5 ${stage.color}`} />
                <span className="text-xs font-semibold">{stage.label}</span>
                <Badge
                  variant="secondary"
                  className="ml-auto text-[10px] no-default-hover-elevate no-default-active-elevate"
                >
                  {stageItems.length}
                </Badge>
              </div>
              <div className="space-y-2 min-h-[120px]">
                {stageItems.length === 0 && (
                  <p className="text-[10px] text-muted-foreground text-center py-4" data-testid={`empty-${stage.id}`}>
                    No items
                  </p>
                )}
                {stageItems.map((item) => (
                  <KanbanCard
                    key={item.id}
                    item={item}
                    onMoveNext={() => handleMoveNext(item)}
                    isMoving={movingId === item.id}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
