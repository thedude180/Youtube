import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { safeArray } from "@/lib/safe-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Plus, TrendingUp, CalendarDays, Target, Sparkles, CheckCircle2, Trash2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { EmptyState } from "@/components/EmptyState";
import { QueryErrorReset } from "@/components/QueryErrorReset";

function formatValue(value: number, unit: string): string {
  if (unit === "USD") return `$${value.toLocaleString()}`;
  if (unit === "subscribers" && value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}K ${unit}`;
  if (unit === "views" && value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}K ${unit}`;
  return `${value.toLocaleString()} ${unit}`;
}

const goalCategoryColors: Record<string, string> = {
  Revenue: "bg-emerald-500/10 text-emerald-500",
  Growth: "bg-blue-500/10 text-blue-500",
  Content: "bg-purple-500/10 text-purple-500",
  Audience: "bg-orange-500/10 text-orange-500",
  Business: "bg-amber-500/10 text-amber-500",
};

const goalStatusVariant: Record<string, "default" | "secondary" | "outline"> = {
  active: "default",
  completed: "secondary",
  paused: "outline",
};

export default function GoalsTab() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [category, setCategory] = useState("Revenue");
  const [unit, setUnit] = useState("USD");

  const { data: rawGoals, isLoading, error } = useQuery<any[]>({ queryKey: ["/api/goals"], refetchInterval: 5 * 60_000, staleTime: 3 * 60_000 });
  const goals = safeArray(rawGoals);

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/goals", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/goals"] });
      setDialogOpen(false);
      toast({ title: "Goal created" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/goals/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/goals"] });
      toast({ title: "Goal deleted" });
    },
  });

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createMutation.mutate({
      title: formData.get("title"),
      category,
      targetValue: parseFloat(formData.get("targetValue") as string),
      unit,
      deadline: formData.get("deadline") || null,
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="grid gap-2">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error) return <QueryErrorReset error={error} queryKey={["/api/goals"]} label="Failed to load goals" />;

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center gap-4 flex-wrap">
        <h2 data-testid="text-goals-title" className="text-lg font-semibold">Business Goals</h2>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-set-goal" size="sm">
              <Plus className="w-4 h-4 mr-1" />
              Set Goal
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Set a New Goal</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <Label>Title</Label>
                <Input name="title" required data-testid="input-goal-title" placeholder="e.g. Reach 100K subscribers" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Category</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger data-testid="select-goal-category"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Revenue">Revenue</SelectItem>
                      <SelectItem value="Growth">Growth</SelectItem>
                      <SelectItem value="Content">Content</SelectItem>
                      <SelectItem value="Audience">Audience</SelectItem>
                      <SelectItem value="Business">Business</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Unit</Label>
                  <Select value={unit} onValueChange={setUnit}>
                    <SelectTrigger data-testid="select-goal-unit"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="subscribers">Subscribers</SelectItem>
                      <SelectItem value="views">Views</SelectItem>
                      <SelectItem value="videos">Videos</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Target Value</Label>
                  <Input name="targetValue" type="number" step="1" required data-testid="input-goal-target" placeholder="10000" />
                </div>
                <div>
                  <Label>Deadline</Label>
                  <Input name="deadline" type="date" data-testid="input-goal-deadline" />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-submit-goal">
                {createMutation.isPending ? "Creating..." : "Create Goal"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {goals.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={Target}
              title="Set your first goal"
              description="Track business goals with measurable targets - subscribers, revenue, views, and more."
              tips={[
                "Choose a metric you want to improve (revenue, subscribers, etc.)",
                "Set a realistic target and deadline",
                "AI will track your progress and suggest adjustments",
              ]}
              data-testid="empty-state-goals"
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-2">
          {goals.map((goal: any) => {
            const current = goal.currentValue || 0;
            const target = goal.targetValue || 1;
            const pct = Math.min(Math.round((current / target) * 100), 100);

            return (
              <Card key={goal.id} data-testid={`card-goal-${goal.id}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="space-y-1">
                      <CardTitle className="text-base" data-testid={`text-goal-title-${goal.id}`}>{goal.title}</CardTitle>
                      <div className="flex items-center gap-2 flex-wrap">
                        {goal.category && (
                          <Badge
                            variant="secondary"
                            className={goalCategoryColors[goal.category] || ""}
                            data-testid={`badge-goal-category-${goal.id}`}
                          >
                            {goal.category}
                          </Badge>
                        )}
                        <Badge
                          variant={goalStatusVariant[goal.status] || "outline"}
                          data-testid={`badge-goal-status-${goal.id}`}
                        >
                          {goal.status === "active" && <TrendingUp className="w-3 h-3 mr-1" />}
                          {goal.status === "completed" && <CheckCircle2 className="w-3 h-3 mr-1" />}
                          {goal.status}
                        </Badge>
                      </div>
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon" variant="ghost" data-testid={`button-delete-goal-${goal.id}`}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Goal</AlertDialogTitle>
                          <AlertDialogDescription>Are you sure you want to delete "{goal.title}"? This cannot be undone.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction data-testid={`button-confirm-delete-goal-${goal.id}`} onClick={() => deleteMutation.mutate(goal.id)}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <div className="flex justify-between items-center text-sm mb-1">
                      <span className="text-muted-foreground" data-testid={`text-goal-progress-${goal.id}`}>
                        {formatValue(current, goal.unit || "USD")} / {formatValue(target, goal.unit || "USD")}
                      </span>
                      <span className="font-medium" data-testid={`text-goal-pct-${goal.id}`}>{pct}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${pct}%` }}
                        data-testid={`bar-goal-progress-${goal.id}`}
                      />
                    </div>
                  </div>

                  {goal.deadline && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground" data-testid={`text-goal-deadline-${goal.id}`}>
                      <CalendarDays className="w-3 h-3" />
                      Deadline: {new Date(goal.deadline).toLocaleDateString()}
                    </div>
                  )}

                  {goal.aiRecommendations && goal.aiRecommendations.length > 0 && (
                    <div className="space-y-1 pt-1">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Sparkles className="w-3 h-3" />
                        AI Recommendations
                      </div>
                      <ul className="text-xs text-muted-foreground space-y-0.5 pl-4 list-disc" data-testid={`list-goal-recommendations-${goal.id}`}>
                        {safeArray<string>(goal?.aiRecommendations).map((rec, i) => (
                          <li key={i}>{rec}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
