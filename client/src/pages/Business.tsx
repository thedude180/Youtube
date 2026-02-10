import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Briefcase, Plus, TrendingUp, DollarSign, Target, CheckCircle2, Trash2,
  Sparkles, CalendarDays, Handshake, ChevronDown, Mail,
  Palette, Users, Eye, Shield, Heart, BookOpen, Link as LinkIcon,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useParams, useLocation } from "wouter";

type TabKey = "ventures" | "goals" | "sponsors" | "brand" | "collabs" | "competitors" | "legal" | "wellness" | "learning";

const ventureTypes = ["All", "Merch", "Courses", "Membership", "Affiliate", "Consulting", "Podcast", "SaaS", "Events", "Licensing"] as const;

const ventureStatusColors: Record<string, string> = {
  planning: "bg-yellow-500/10 text-yellow-500",
  active: "bg-emerald-500/10 text-emerald-500",
  paused: "bg-muted-foreground/10 text-muted-foreground",
  completed: "bg-blue-500/10 text-blue-500",
};

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

const SPONSOR_STAGES = ["Prospect", "Contacted", "Negotiating", "Active", "Completed", "Declined"] as const;

const sponsorStageColors: Record<string, string> = {
  Prospect: "bg-slate-500/10 text-slate-500",
  Contacted: "bg-blue-500/10 text-blue-500",
  Negotiating: "bg-amber-500/10 text-amber-500",
  Active: "bg-emerald-500/10 text-emerald-500",
  Completed: "bg-purple-500/10 text-purple-500",
  Declined: "bg-red-500/10 text-red-500",
};

function VenturesTab() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState("All");

  const { data: ventures, isLoading } = useQuery<any[]>({ queryKey: ['/api/ventures'] });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/ventures", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ventures'] });
      setDialogOpen(false);
      toast({ title: "Venture created" });
    },
  });

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createMutation.mutate({
      name: formData.get("name"),
      type: formData.get("type"),
      description: formData.get("description"),
      status: formData.get("status"),
    });
  };

  const filtered = ventures?.filter((v: any) =>
    activeFilter === "All" ? true : v.type?.toLowerCase() === activeFilter.toLowerCase()
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex gap-2 flex-wrap">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-20 rounded-full" />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center gap-4 flex-wrap">
        <h2 data-testid="text-ventures-title" className="text-lg font-semibold">Business Ventures</h2>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-venture" size="sm">
              <Plus className="w-4 h-4 mr-1" />
              Add Venture
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Venture</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <Label>Name</Label>
                <Input name="name" required data-testid="input-venture-name" placeholder="Venture name" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Type</Label>
                  <Select name="type" defaultValue="merch">
                    <SelectTrigger data-testid="select-venture-type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="merch">Merch</SelectItem>
                      <SelectItem value="courses">Courses</SelectItem>
                      <SelectItem value="membership">Membership</SelectItem>
                      <SelectItem value="affiliate">Affiliate</SelectItem>
                      <SelectItem value="consulting">Consulting</SelectItem>
                      <SelectItem value="podcast">Podcast</SelectItem>
                      <SelectItem value="saas">SaaS</SelectItem>
                      <SelectItem value="events">Events</SelectItem>
                      <SelectItem value="licensing">Licensing</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Status</Label>
                  <Select name="status" defaultValue="planning">
                    <SelectTrigger data-testid="select-venture-status"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="planning">Planning</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="paused">Paused</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Description</Label>
                <Input name="description" data-testid="input-venture-description" placeholder="Brief description" />
              </div>
              <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-submit-venture">
                {createMutation.isPending ? "Creating..." : "Create Venture"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-2 flex-wrap">
        {ventureTypes.map((type) => (
          <Badge
            key={type}
            variant={activeFilter === type ? "default" : "secondary"}
            className="cursor-pointer"
            data-testid={`filter-venture-${type.toLowerCase()}`}
            onClick={() => setActiveFilter(type)}
          >
            {type}
          </Badge>
        ))}
      </div>

      {!filtered || filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Briefcase className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium mb-1" data-testid="text-empty-ventures">Launch your first business venture</p>
            <p className="text-xs text-muted-foreground max-w-sm">
              Start tracking your creator business ventures - merch lines, online courses, consulting services, memberships, and more.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((venture: any) => {
            const revenue = venture.revenue || 0;
            const expenses = venture.expenses || 0;
            const pnl = revenue - expenses;
            return (
              <Card key={venture.id} data-testid={`card-venture-${venture.id}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <CardTitle className="text-base">{venture.name}</CardTitle>
                    <div className="flex items-center gap-1 flex-wrap">
                      <Badge variant="secondary" className="text-xs capitalize" data-testid={`badge-venture-type-${venture.id}`}>
                        {venture.type}
                      </Badge>
                      <Badge
                        variant="secondary"
                        className={`text-xs capitalize no-default-hover-elevate no-default-active-elevate ${ventureStatusColors[venture.status] || ""}`}
                        data-testid={`badge-venture-status-${venture.id}`}
                      >
                        {venture.status}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {venture.description && (
                    <p className="text-sm text-muted-foreground" data-testid={`text-venture-description-${venture.id}`}>
                      {venture.description}
                    </p>
                  )}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1 flex-wrap">
                        <DollarSign className="h-3 w-3 text-muted-foreground" />
                        <p className="text-xs text-muted-foreground">Revenue</p>
                      </div>
                      <p className="text-sm font-medium" data-testid={`text-venture-revenue-${venture.id}`}>
                        ${revenue.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1 flex-wrap">
                        <TrendingUp className="h-3 w-3 text-muted-foreground" />
                        <p className="text-xs text-muted-foreground">Expenses</p>
                      </div>
                      <p className="text-sm font-medium" data-testid={`text-venture-expenses-${venture.id}`}>
                        ${expenses.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-xs text-muted-foreground">P&L</p>
                      <p className={`text-sm font-semibold ${pnl >= 0 ? "text-emerald-400" : "text-red-400"}`} data-testid={`text-venture-pnl-${venture.id}`}>
                        {pnl >= 0 ? "+" : ""}${pnl.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function GoalsTab() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [category, setCategory] = useState("Revenue");
  const [unit, setUnit] = useState("USD");

  const { data: goals, isLoading } = useQuery<any[]>({ queryKey: ["/api/goals"] });

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
      <div className="space-y-6">
        <div className="grid gap-4">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
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

      {!goals || goals.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Target className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground" data-testid="text-empty-goals">Set your first business goal to track progress</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
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
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => deleteMutation.mutate(goal.id)}
                      data-testid={`button-delete-goal-${goal.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
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
                        {goal.aiRecommendations.map((rec: string, i: number) => (
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

function SponsorsTab() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [status, setStatus] = useState("Prospect");
  const [filterStage, setFilterStage] = useState<string | null>(null);

  const { data: deals, isLoading } = useQuery<any[]>({ queryKey: ["/api/sponsorship-deals"] });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/sponsorship-deals", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sponsorship-deals"] });
      setDialogOpen(false);
      toast({ title: "Deal added" });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await apiRequest("PATCH", `/api/sponsorship-deals/${id}`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sponsorship-deals"] });
      toast({ title: "Status updated" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/sponsorship-deals/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sponsorship-deals"] });
      toast({ title: "Deal deleted" });
    },
  });

  const { totalPipeline, activeCount, completedTotal } = useMemo(() => {
    if (!deals) return { totalPipeline: 0, activeCount: 0, completedTotal: 0 };
    let total = 0, active = 0, completed = 0;
    for (const d of deals) {
      const val = d.dealValue || 0;
      total += val;
      if (d.status === "Active") { active++; }
      if (d.status === "Completed") { completed += val; }
    }
    return { totalPipeline: total, activeCount: active, completedTotal: completed };
  }, [deals]);

  const filtered = filterStage ? deals?.filter((d: any) => d.status === filterStage) : deals;

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createMutation.mutate({
      brandName: formData.get("brandName"),
      dealValue: parseFloat(formData.get("dealValue") as string) || 0,
      status,
      contactEmail: formData.get("contactEmail") || null,
      notes: formData.get("notes") || null,
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center gap-4 flex-wrap">
        <h2 data-testid="text-sponsors-title" className="text-lg font-semibold">Sponsorship Pipeline</h2>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-deal" size="sm">
              <Plus className="w-4 h-4 mr-1" />
              Add Deal
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Sponsorship Deal</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <Label>Brand Name</Label>
                <Input name="brandName" required data-testid="input-deal-brand" placeholder="e.g. Acme Corp" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Deal Value ($)</Label>
                  <Input name="dealValue" type="number" step="0.01" required data-testid="input-deal-value" placeholder="5000" />
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger data-testid="select-deal-status"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SPONSOR_STAGES.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Contact Email</Label>
                <Input name="contactEmail" type="email" data-testid="input-deal-email" placeholder="contact@brand.com" />
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea name="notes" data-testid="input-deal-notes" placeholder="Any additional details..." className="resize-none" />
              </div>
              <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-submit-deal">
                {createMutation.isPending ? "Saving..." : "Add Deal"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Total Pipeline</span>
            </div>
            <p className="text-xl font-bold" data-testid="text-total-pipeline">
              ${totalPipeline.toLocaleString("en-US", { minimumFractionDigits: 0 })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Active Deals</span>
            </div>
            <p className="text-xl font-bold" data-testid="text-active-deals">{activeCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Completed Total</span>
            </div>
            <p className="text-xl font-bold" data-testid="text-completed-total">
              ${completedTotal.toLocaleString("en-US", { minimumFractionDigits: 0 })}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Badge
          variant={filterStage === null ? "default" : "secondary"}
          className="cursor-pointer"
          onClick={() => setFilterStage(null)}
          data-testid="filter-sponsor-all"
        >
          All
        </Badge>
        {SPONSOR_STAGES.map((stage) => (
          <Badge
            key={stage}
            variant={filterStage === stage ? "default" : "secondary"}
            className="cursor-pointer"
            onClick={() => setFilterStage(filterStage === stage ? null : stage)}
            data-testid={`filter-sponsor-${stage.toLowerCase()}`}
          >
            {stage}
          </Badge>
        ))}
      </div>

      {!filtered || filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Handshake className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground" data-testid="text-empty-deals">No sponsorship deals yet. Add your first deal to start tracking.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filtered.map((deal: any) => (
            <Card key={deal.id} data-testid={`card-deal-${deal.id}`}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="space-y-1">
                    <CardTitle className="text-base" data-testid={`text-deal-brand-${deal.id}`}>{deal.brandName}</CardTitle>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-emerald-400" data-testid={`text-deal-value-${deal.id}`}>
                        ${(deal.dealValue || 0).toLocaleString()}
                      </span>
                      <Badge
                        variant="secondary"
                        className={sponsorStageColors[deal.status] || ""}
                        data-testid={`badge-deal-status-${deal.id}`}
                      >
                        {deal.status}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-wrap">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="outline" data-testid={`button-change-status-${deal.id}`}>
                          Status
                          <ChevronDown className="w-3 h-3 ml-1" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        {SPONSOR_STAGES.map((s) => (
                          <DropdownMenuItem
                            key={s}
                            onClick={() => updateStatusMutation.mutate({ id: deal.id, status: s })}
                            data-testid={`menu-status-${s.toLowerCase()}-${deal.id}`}
                          >
                            {s}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => deleteMutation.mutate(deal.id)}
                      data-testid={`button-delete-deal-${deal.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {deal.contactEmail && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground" data-testid={`text-deal-email-${deal.id}`}>
                    <Mail className="w-3 h-3" />
                    {deal.contactEmail}
                  </div>
                )}
                {(deal.startDate || deal.endDate) && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground" data-testid={`text-deal-dates-${deal.id}`}>
                    <CalendarDays className="w-3 h-3" />
                    {deal.startDate ? new Date(deal.startDate).toLocaleDateString() : "TBD"}
                    {" - "}
                    {deal.endDate ? new Date(deal.endDate).toLocaleDateString() : "TBD"}
                  </div>
                )}
                {deal.deliverables && deal.deliverables.length > 0 && (
                  <div className="text-xs text-muted-foreground" data-testid={`text-deal-deliverables-${deal.id}`}>
                    <span className="font-medium">Deliverables:</span> {deal.deliverables.join(", ")}
                  </div>
                )}
                {deal.notes && (
                  <p className="text-xs text-muted-foreground" data-testid={`text-deal-notes-${deal.id}`}>{deal.notes}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

const ASSET_TYPES = ["color", "logo", "font", "tone"] as const;
const assetTypeLabels: Record<string, string> = { color: "Colors", logo: "Logos", font: "Fonts", tone: "Tone of Voice" };
const assetTypeIcons: Record<string, string> = { color: "bg-gradient-to-br from-purple-500 to-pink-500", logo: "bg-gradient-to-br from-blue-500 to-cyan-500", font: "bg-gradient-to-br from-amber-500 to-orange-500", tone: "bg-gradient-to-br from-emerald-500 to-teal-500" };

function BrandTab() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [assetType, setAssetType] = useState<string>("color");
  const [filterType, setFilterType] = useState<string | null>(null);

  const { data: assets, isLoading } = useQuery<any[]>({ queryKey: ['/api/brand-assets'] });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/brand-assets", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/brand-assets'] });
      setDialogOpen(false);
      toast({ title: "Brand asset added" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/brand-assets/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/brand-assets'] });
      toast({ title: "Asset removed" });
    },
  });

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const metadata: any = {};
    if (assetType === "color") metadata.hex = formData.get("value");
    if (assetType === "font") { metadata.fontFamily = formData.get("value"); metadata.fontWeight = formData.get("fontWeight") || "400"; }
    if (assetType === "logo") metadata.url = formData.get("value");
    if (assetType === "tone") metadata.usage = formData.get("usage") || "";
    createMutation.mutate({
      assetType,
      name: formData.get("name"),
      value: formData.get("value"),
      metadata,
    });
  };

  const filtered = filterType ? assets?.filter((a: any) => a.assetType === filterType) : assets;
  const colorAssets = filtered?.filter((a: any) => a.assetType === "color") || [];
  const otherAssets = filtered?.filter((a: any) => a.assetType !== "color") || [];

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-24 rounded-xl" /><Skeleton className="h-40 rounded-xl" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center gap-4 flex-wrap">
        <h2 data-testid="text-brand-title" className="text-lg font-semibold">Brand Kit</h2>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-brand-asset" size="sm"><Plus className="w-4 h-4 mr-1" />Add Asset</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Brand Asset</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <Label>Asset Type</Label>
                <Select value={assetType} onValueChange={setAssetType}>
                  <SelectTrigger data-testid="select-asset-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ASSET_TYPES.map((t) => <SelectItem key={t} value={t}>{assetTypeLabels[t]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Name</Label>
                <Input name="name" required data-testid="input-asset-name" placeholder={assetType === "color" ? "Primary Blue" : assetType === "font" ? "Heading Font" : assetType === "logo" ? "Main Logo" : "Brand Voice"} />
              </div>
              <div>
                <Label>{assetType === "color" ? "Hex Color" : assetType === "font" ? "Font Family" : assetType === "logo" ? "Logo URL" : "Voice Description"}</Label>
                {assetType === "color" ? (
                  <div className="flex items-center gap-3">
                    <input type="color" name="value" defaultValue="#6366f1" className="h-9 w-12 rounded-md border cursor-pointer" data-testid="input-asset-color" />
                    <Input name="valueName" placeholder="#6366f1" className="flex-1" readOnly />
                  </div>
                ) : assetType === "tone" ? (
                  <Textarea name="value" required data-testid="input-asset-value" placeholder="Professional yet approachable, uses humor sparingly..." className="resize-none" />
                ) : (
                  <Input name="value" required data-testid="input-asset-value" placeholder={assetType === "font" ? "Inter, sans-serif" : "https://example.com/logo.png"} />
                )}
              </div>
              {assetType === "font" && (
                <div>
                  <Label>Font Weight</Label>
                  <Select name="fontWeight" defaultValue="400">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="300">Light (300)</SelectItem>
                      <SelectItem value="400">Regular (400)</SelectItem>
                      <SelectItem value="500">Medium (500)</SelectItem>
                      <SelectItem value="600">Semibold (600)</SelectItem>
                      <SelectItem value="700">Bold (700)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              {assetType === "tone" && (
                <div>
                  <Label>Usage Context</Label>
                  <Input name="usage" data-testid="input-asset-usage" placeholder="Social media, YouTube descriptions, emails..." />
                </div>
              )}
              <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-submit-brand-asset">
                {createMutation.isPending ? "Adding..." : "Add Asset"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Badge variant={filterType === null ? "default" : "secondary"} className="cursor-pointer" onClick={() => setFilterType(null)} data-testid="filter-brand-all">All</Badge>
        {ASSET_TYPES.map((t) => (
          <Badge key={t} variant={filterType === t ? "default" : "secondary"} className="cursor-pointer" onClick={() => setFilterType(filterType === t ? null : t)} data-testid={`filter-brand-${t}`}>
            {assetTypeLabels[t]}
          </Badge>
        ))}
      </div>

      {(!filtered || filtered.length === 0) ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Palette className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium mb-1" data-testid="text-empty-brand">Build your brand identity</p>
            <p className="text-xs text-muted-foreground">Add your brand colors, logos, fonts, and voice guidelines</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {colorAssets.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-3">Color Palette</p>
              <div className="flex gap-3 flex-wrap">
                {colorAssets.map((asset: any) => (
                  <div key={asset.id} data-testid={`card-brand-asset-${asset.id}`} className="group relative">
                    <div className="w-20 h-20 rounded-md border" style={{ backgroundColor: asset.value }} />
                    <p className="text-xs font-medium mt-1 text-center truncate w-20">{asset.name}</p>
                    <p className="text-xs text-muted-foreground text-center">{asset.value}</p>
                    <Button size="icon" variant="ghost" className="absolute -top-2 -right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => deleteMutation.mutate(asset.id)} data-testid={`button-delete-brand-${asset.id}`}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {otherAssets.length > 0 && (
            <div className="grid gap-3">
              {otherAssets.map((asset: any) => (
                <Card key={asset.id} data-testid={`card-brand-asset-${asset.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-md ${assetTypeIcons[asset.assetType] || "bg-muted"}`} />
                        <div>
                          <p className="text-sm font-medium">{asset.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {asset.assetType === "font" ? asset.metadata?.fontFamily || asset.value : asset.assetType === "tone" ? (asset.value?.substring(0, 80) + (asset.value?.length > 80 ? "..." : "")) : asset.value}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary" className="capitalize text-xs">{assetTypeLabels[asset.assetType]}</Badge>
                        <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(asset.id)} data-testid={`button-delete-brand-${asset.id}`}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const COLLAB_STATUSES = ["suggested", "contacted", "active", "completed", "declined"] as const;
const collabStatusColors: Record<string, string> = {
  suggested: "bg-blue-500/10 text-blue-500",
  contacted: "bg-amber-500/10 text-amber-500",
  active: "bg-emerald-500/10 text-emerald-500",
  completed: "bg-purple-500/10 text-purple-500",
  declined: "bg-red-500/10 text-red-500",
};

function CollabsTab() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);

  const { data: leads, isLoading } = useQuery<any[]>({ queryKey: ['/api/collaboration-leads'] });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/collaboration-leads", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/collaboration-leads'] });
      setDialogOpen(false);
      toast({ title: "Collaboration lead added" });
    },
  });

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createMutation.mutate({
      creatorName: formData.get("creatorName"),
      platform: formData.get("platform") || "YouTube",
      channelUrl: formData.get("channelUrl") || null,
      status: formData.get("status") || "suggested",
      audienceOverlap: parseFloat(formData.get("audienceOverlap") as string) || null,
      notes: formData.get("notes") || null,
      aiSuggested: false,
    });
  };

  const filtered = filterStatus ? leads?.filter((l: any) => l.status === filterStatus) : leads;
  const aiSuggestedCount = leads?.filter((l: any) => l.aiSuggested)?.length || 0;

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-24 rounded-xl" /><Skeleton className="h-40 rounded-xl" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center gap-4 flex-wrap">
        <div>
          <h2 data-testid="text-collabs-title" className="text-lg font-semibold">Collaborations</h2>
          {aiSuggestedCount > 0 && (
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><Sparkles className="w-3 h-3" />{aiSuggestedCount} AI-suggested partner{aiSuggestedCount !== 1 ? "s" : ""}</p>
          )}
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-collab" size="sm"><Plus className="w-4 h-4 mr-1" />Add Lead</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Collaboration Lead</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <Label>Creator Name</Label>
                <Input name="creatorName" required data-testid="input-collab-name" placeholder="Creator name or channel" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Platform</Label>
                  <Select name="platform" defaultValue="YouTube">
                    <SelectTrigger data-testid="select-collab-platform"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="YouTube">YouTube</SelectItem>
                      <SelectItem value="TikTok">TikTok</SelectItem>
                      <SelectItem value="Instagram">Instagram</SelectItem>
                      <SelectItem value="Twitter">Twitter</SelectItem>
                      <SelectItem value="Twitch">Twitch</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Status</Label>
                  <Select name="status" defaultValue="suggested">
                    <SelectTrigger data-testid="select-collab-status"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {COLLAB_STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Channel URL</Label>
                <Input name="channelUrl" data-testid="input-collab-url" placeholder="https://youtube.com/@creator" />
              </div>
              <div>
                <Label>Audience Overlap (%)</Label>
                <Input name="audienceOverlap" type="number" min="0" max="100" step="0.1" data-testid="input-collab-overlap" placeholder="e.g. 35" />
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea name="notes" data-testid="input-collab-notes" placeholder="Potential collab ideas..." className="resize-none" />
              </div>
              <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-submit-collab">
                {createMutation.isPending ? "Adding..." : "Add Lead"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Badge variant={filterStatus === null ? "default" : "secondary"} className="cursor-pointer" onClick={() => setFilterStatus(null)} data-testid="filter-collab-all">All ({leads?.length || 0})</Badge>
        {COLLAB_STATUSES.map((s) => {
          const count = leads?.filter((l: any) => l.status === s)?.length || 0;
          return (
            <Badge key={s} variant={filterStatus === s ? "default" : "secondary"} className="cursor-pointer capitalize" onClick={() => setFilterStatus(filterStatus === s ? null : s)} data-testid={`filter-collab-${s}`}>
              {s} ({count})
            </Badge>
          );
        })}
      </div>

      {(!filtered || filtered.length === 0) ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Users className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium mb-1" data-testid="text-empty-collabs">No collaboration leads yet</p>
            <p className="text-xs text-muted-foreground">Add creators you want to collaborate with or let AI suggest partners</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((lead: any) => (
            <Card key={lead.id} data-testid={`card-collab-${lead.id}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <Users className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium" data-testid={`text-collab-name-${lead.id}`}>{lead.creatorName}</p>
                        {lead.aiSuggested && <Badge variant="secondary" className="text-xs bg-purple-500/10 text-purple-400"><Sparkles className="w-3 h-3 mr-1" />AI Pick</Badge>}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                        {lead.platform && <span>{lead.platform}</span>}
                        {lead.audienceOverlap != null && <span>{lead.audienceOverlap}% overlap</span>}
                        {lead.contactedAt && <span>Contacted {new Date(lead.contactedAt).toLocaleDateString()}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary" className={`capitalize text-xs no-default-hover-elevate no-default-active-elevate ${collabStatusColors[lead.status] || ""}`} data-testid={`badge-collab-status-${lead.id}`}>
                      {lead.status}
                    </Badge>
                    {lead.channelUrl && (
                      <a href={lead.channelUrl} target="_blank" rel="noopener noreferrer">
                        <Button size="icon" variant="ghost" data-testid={`button-visit-collab-${lead.id}`}><LinkIcon className="w-4 h-4" /></Button>
                      </a>
                    )}
                  </div>
                </div>
                {lead.notes && <p className="text-xs text-muted-foreground mt-2 pl-13">{lead.notes}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function CompetitorsTab() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: competitors, isLoading } = useQuery<any[]>({ queryKey: ['/api/competitors'] });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/competitors", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/competitors'] });
      setDialogOpen(false);
      toast({ title: "Competitor added" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/competitors/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/competitors'] });
      toast({ title: "Competitor removed" });
    },
  });

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const strengthsRaw = (formData.get("strengths") as string) || "";
    const oppsRaw = (formData.get("opportunities") as string) || "";
    createMutation.mutate({
      competitorName: formData.get("competitorName"),
      platform: formData.get("platform") || "YouTube",
      channelUrl: formData.get("channelUrl") || null,
      subscribers: parseInt(formData.get("subscribers") as string) || null,
      avgViews: parseInt(formData.get("avgViews") as string) || null,
      uploadFrequency: formData.get("uploadFrequency") || null,
      strengths: strengthsRaw ? strengthsRaw.split(",").map((s: string) => s.trim()).filter(Boolean) : [],
      opportunities: oppsRaw ? oppsRaw.split(",").map((s: string) => s.trim()).filter(Boolean) : [],
    });
  };

  const totalSubs = competitors?.reduce((sum: number, c: any) => sum + (c.subscribers || 0), 0) || 0;
  const avgViewsAll = competitors?.length ? Math.round(competitors.reduce((sum: number, c: any) => sum + (c.avgViews || 0), 0) / competitors.length) : 0;

  if (isLoading) return <div className="space-y-4"><div className="grid grid-cols-2 gap-4"><Skeleton className="h-24 rounded-xl" /><Skeleton className="h-24 rounded-xl" /></div><Skeleton className="h-40 rounded-xl" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center gap-4 flex-wrap">
        <h2 data-testid="text-competitors-title" className="text-lg font-semibold">Competitor Analysis</h2>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-competitor" size="sm"><Plus className="w-4 h-4 mr-1" />Track Competitor</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Track a Competitor</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <Label>Channel/Creator Name</Label>
                <Input name="competitorName" required data-testid="input-competitor-name" placeholder="Competitor name" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Platform</Label>
                  <Select name="platform" defaultValue="YouTube">
                    <SelectTrigger data-testid="select-competitor-platform"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="YouTube">YouTube</SelectItem>
                      <SelectItem value="TikTok">TikTok</SelectItem>
                      <SelectItem value="Instagram">Instagram</SelectItem>
                      <SelectItem value="Twitch">Twitch</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Upload Frequency</Label>
                  <Select name="uploadFrequency" defaultValue="weekly">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="biweekly">Bi-weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Channel URL</Label>
                <Input name="channelUrl" data-testid="input-competitor-url" placeholder="https://youtube.com/@competitor" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Subscribers</Label>
                  <Input name="subscribers" type="number" data-testid="input-competitor-subs" placeholder="100000" />
                </div>
                <div>
                  <Label>Avg Views</Label>
                  <Input name="avgViews" type="number" data-testid="input-competitor-views" placeholder="50000" />
                </div>
              </div>
              <div>
                <Label>Strengths (comma-separated)</Label>
                <Input name="strengths" data-testid="input-competitor-strengths" placeholder="Great thumbnails, consistent uploads" />
              </div>
              <div>
                <Label>Opportunities (comma-separated)</Label>
                <Input name="opportunities" data-testid="input-competitor-opps" placeholder="Weak SEO, no shorts strategy" />
              </div>
              <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-submit-competitor">
                {createMutation.isPending ? "Adding..." : "Track Competitor"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {competitors && competitors.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1">Tracking</p>
              <p className="text-xl font-bold" data-testid="text-competitor-count">{competitors.length} competitor{competitors.length !== 1 ? "s" : ""}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1">Combined Subscribers</p>
              <p className="text-xl font-bold" data-testid="text-competitor-total-subs">{totalSubs >= 1000 ? `${(totalSubs / 1000).toFixed(totalSubs >= 10000 ? 0 : 1)}K` : totalSubs}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1">Avg Views (across all)</p>
              <p className="text-xl font-bold" data-testid="text-competitor-avg-views">{avgViewsAll >= 1000 ? `${(avgViewsAll / 1000).toFixed(avgViewsAll >= 10000 ? 0 : 1)}K` : avgViewsAll}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {(!competitors || competitors.length === 0) ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Eye className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium mb-1" data-testid="text-empty-competitors">No competitors tracked yet</p>
            <p className="text-xs text-muted-foreground">Add competitors to monitor their strategy and find your edge</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {competitors.map((comp: any) => (
            <Card key={comp.id} data-testid={`card-competitor-${comp.id}`}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="space-y-1">
                    <CardTitle className="text-base" data-testid={`text-competitor-name-${comp.id}`}>{comp.competitorName}</CardTitle>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                      <Badge variant="secondary" className="text-xs">{comp.platform}</Badge>
                      {comp.uploadFrequency && <span className="capitalize">{comp.uploadFrequency} uploads</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-wrap">
                    {comp.channelUrl && (
                      <a href={comp.channelUrl} target="_blank" rel="noopener noreferrer">
                        <Button size="icon" variant="ghost"><LinkIcon className="w-4 h-4" /></Button>
                      </a>
                    )}
                    <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(comp.id)} data-testid={`button-delete-competitor-${comp.id}`}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  {comp.subscribers != null && (
                    <div>
                      <p className="text-xs text-muted-foreground">Subscribers</p>
                      <p className="text-sm font-semibold" data-testid={`text-competitor-subs-${comp.id}`}>{comp.subscribers >= 1000 ? `${(comp.subscribers / 1000).toFixed(comp.subscribers >= 10000 ? 0 : 1)}K` : comp.subscribers}</p>
                    </div>
                  )}
                  {comp.avgViews != null && (
                    <div>
                      <p className="text-xs text-muted-foreground">Avg Views</p>
                      <p className="text-sm font-semibold" data-testid={`text-competitor-views-${comp.id}`}>{comp.avgViews >= 1000 ? `${(comp.avgViews / 1000).toFixed(comp.avgViews >= 10000 ? 0 : 1)}K` : comp.avgViews}</p>
                    </div>
                  )}
                </div>
                {comp.strengths && comp.strengths.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Strengths</p>
                    <div className="flex gap-1.5 flex-wrap">
                      {comp.strengths.map((s: string, i: number) => (
                        <Badge key={i} variant="secondary" className="text-xs bg-emerald-500/10 text-emerald-500 no-default-hover-elevate no-default-active-elevate">{s}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {comp.opportunities && comp.opportunities.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Your Opportunities</p>
                    <div className="flex gap-1.5 flex-wrap">
                      {comp.opportunities.map((o: string, i: number) => (
                        <Badge key={i} variant="secondary" className="text-xs bg-amber-500/10 text-amber-500 no-default-hover-elevate no-default-active-elevate">{o}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

const ENTITY_TYPES = ["sole_proprietor", "llc", "s_corp", "c_corp", "partnership"] as const;
const entityTypeLabels: Record<string, string> = { sole_proprietor: "Sole Proprietor", llc: "LLC", s_corp: "S-Corp", c_corp: "C-Corp", partnership: "Partnership" };
const FORMATION_STEPS = [
  { key: "entity", label: "Choose Entity Type", desc: "Select your business structure" },
  { key: "ein", label: "Get EIN", desc: "Apply for Employer Identification Number" },
  { key: "state", label: "State Registration", desc: "File with your state" },
  { key: "bank", label: "Business Bank Account", desc: "Open a dedicated account" },
  { key: "insurance", label: "Business Insurance", desc: "Get coverage for your business" },
  { key: "trademark", label: "Trademark", desc: "Protect your brand name" },
];

function LegalTab() {
  const { data: ventures } = useQuery<any[]>({ queryKey: ['/api/ventures'] });
  const { data: taxEstimates } = useQuery<any[]>({ queryKey: ['/api/tax-estimates'] });

  const [completedSteps, setCompletedSteps] = useState<string[]>(() => {
    const stored = localStorage.getItem("legalFormationSteps");
    return stored ? JSON.parse(stored) : [];
  });

  const toggleStep = (key: string) => {
    setCompletedSteps((prev: string[]) => {
      const next = prev.includes(key) ? prev.filter((k: string) => k !== key) : [...prev, key];
      localStorage.setItem("legalFormationSteps", JSON.stringify(next));
      return next;
    });
  };

  const completionPct = Math.round((completedSteps.length / FORMATION_STEPS.length) * 100);

  const activeVenture = ventures?.find((v: any) => v.status === "active");
  const entityType = activeVenture?.metadata?.entityType || activeVenture?.type || null;

  const upcomingTax = taxEstimates?.find((t: any) => !t.paid && t.dueDate && new Date(t.dueDate) > new Date());

  return (
    <div className="space-y-6">
      <h2 data-testid="text-legal-title" className="text-lg font-semibold">Legal & Formation</h2>

      <Card className={completionPct === 100 ? "border-emerald-500/30 bg-emerald-500/5" : completionPct > 50 ? "border-amber-500/30 bg-amber-500/5" : ""}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-4 flex-wrap mb-3">
            <div>
              <p className="text-sm font-medium" data-testid="text-formation-status">
                {completionPct === 100 ? "Formation Complete" : `Formation Progress: ${completionPct}%`}
              </p>
              <p className="text-xs text-muted-foreground">
                {completedSteps.length} of {FORMATION_STEPS.length} steps done
              </p>
            </div>
            {entityType && <Badge variant="secondary" className="text-xs">{entityTypeLabels[entityType] || entityType}</Badge>}
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${completionPct}%` }} data-testid="bar-formation-progress" />
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {FORMATION_STEPS.map((step) => {
          const done = completedSteps.includes(step.key);
          return (
            <Card key={step.key} className={`cursor-pointer hover-elevate ${done ? "border-emerald-500/20" : ""}`} onClick={() => toggleStep(step.key)} data-testid={`card-formation-step-${step.key}`}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${done ? "border-emerald-500 bg-emerald-500" : "border-muted-foreground/30"}`}>
                    {done && <CheckCircle2 className="w-4 h-4 text-white" />}
                  </div>
                  <div>
                    <p className={`text-sm font-medium ${done ? "line-through text-muted-foreground" : ""}`}>{step.label}</p>
                    <p className="text-xs text-muted-foreground">{step.desc}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {upcomingTax && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <CalendarDays className="w-4 h-4 text-amber-500" />
              <p className="text-sm font-medium">Upcoming Tax Payment</p>
            </div>
            <p className="text-xs text-muted-foreground" data-testid="text-upcoming-tax">
              {upcomingTax.quarter} {upcomingTax.year} — Est. ${(upcomingTax.estimatedTax || 0).toLocaleString()} due {upcomingTax.dueDate ? new Date(upcomingTax.dueDate).toLocaleDateString() : "TBD"}
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <Shield className="w-4 h-4 text-muted-foreground" />
            <p className="text-sm font-medium">Compliance Reminders</p>
          </div>
          <div className="space-y-2">
            {[
              { label: "Annual Report Filing", status: completedSteps.includes("state") ? "done" : "pending" },
              { label: "Quarterly Tax Estimates", status: upcomingTax ? "upcoming" : "done" },
              { label: "Business License Renewal", status: completedSteps.includes("ein") ? "done" : "pending" },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between gap-2 flex-wrap" data-testid={`compliance-${item.label.toLowerCase().replace(/\s+/g, '-')}`}>
                <span className="text-xs">{item.label}</span>
                <Badge variant="secondary" className={`text-xs no-default-hover-elevate no-default-active-elevate ${item.status === "done" ? "bg-emerald-500/10 text-emerald-500" : item.status === "upcoming" ? "bg-amber-500/10 text-amber-500" : "bg-muted-foreground/10 text-muted-foreground"}`}>
                  {item.status === "done" ? "Complete" : item.status === "upcoming" ? "Due Soon" : "Pending"}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

const MOOD_LABELS = ["Terrible", "Bad", "Okay", "Good", "Great"];
const ENERGY_LABELS = ["Exhausted", "Low", "Moderate", "High", "Energized"];
const STRESS_LABELS = ["Relaxed", "Low", "Moderate", "High", "Overwhelmed"];

function WellnessTab() {
  const { toast } = useToast();
  const [mood, setMood] = useState(3);
  const [energy, setEnergy] = useState(3);
  const [stress, setStress] = useState(2);
  const [showCheckin, setShowCheckin] = useState(false);

  const { data: checks, isLoading } = useQuery<any[]>({ queryKey: ['/api/wellness'] });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/wellness", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/wellness'] });
      setShowCheckin(false);
      toast({ title: "Check-in saved" });
    },
  });

  const handleCheckin = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createMutation.mutate({
      mood, energy, stress,
      hoursWorked: parseFloat(formData.get("hoursWorked") as string) || null,
      notes: formData.get("notes") || null,
    });
  };

  const todayCheck = checks?.[0];
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const checkedInToday = todayCheck && new Date(todayCheck.createdAt) >= todayStart;

  const recentChecks = checks?.slice(0, 7) || [];
  const avgMood = recentChecks.length ? (recentChecks.reduce((s: number, c: any) => s + c.mood, 0) / recentChecks.length).toFixed(1) : "—";
  const avgEnergy = recentChecks.length ? (recentChecks.reduce((s: number, c: any) => s + c.energy, 0) / recentChecks.length).toFixed(1) : "—";
  const avgStress = recentChecks.length ? (recentChecks.reduce((s: number, c: any) => s + c.stress, 0) / recentChecks.length).toFixed(1) : "—";

  const streak = (() => {
    if (!checks?.length) return 0;
    let count = 0;
    const now = new Date();
    for (let i = 0; i < Math.min(checks.length, 30); i++) {
      const checkDate = new Date(checks[i].createdAt);
      const daysDiff = Math.floor((now.getTime() - checkDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysDiff <= count + 1) count++;
      else break;
    }
    return count;
  })();

  const moodColor = (val: number) => val <= 1 ? "text-red-400" : val <= 2 ? "text-amber-400" : val <= 3 ? "text-yellow-400" : "text-emerald-400";
  const stressColor = (val: number) => val >= 4 ? "text-red-400" : val >= 3 ? "text-amber-400" : "text-emerald-400";

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-32 rounded-xl" /><Skeleton className="h-40 rounded-xl" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center gap-4 flex-wrap">
        <h2 data-testid="text-wellness-title" className="text-lg font-semibold">Creator Wellness</h2>
        {!showCheckin && (
          <Button data-testid="button-checkin" size="sm" onClick={() => setShowCheckin(true)}>
            <Heart className="w-4 h-4 mr-1" />
            {checkedInToday ? "Check In Again" : "Daily Check-In"}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className={checkedInToday ? "border-emerald-500/30 bg-emerald-500/5" : ""}>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">Today</p>
            <p className="text-lg font-bold" data-testid="text-wellness-today">{checkedInToday ? MOOD_LABELS[todayCheck.mood - 1] : "Not yet"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">7-Day Mood</p>
            <p className="text-lg font-bold" data-testid="text-wellness-avg-mood">{avgMood}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">7-Day Energy</p>
            <p className="text-lg font-bold" data-testid="text-wellness-avg-energy">{avgEnergy}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">Streak</p>
            <p className="text-lg font-bold" data-testid="text-wellness-streak">{streak} day{streak !== 1 ? "s" : ""}</p>
          </CardContent>
        </Card>
      </div>

      {showCheckin && (
        <Card>
          <CardContent className="p-6">
            <form onSubmit={handleCheckin} className="space-y-5">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <Label>Mood</Label>
                  <span className={`text-sm font-medium ${moodColor(mood)}`}>{MOOD_LABELS[mood - 1]}</span>
                </div>
                <input type="range" min="1" max="5" value={mood} onChange={(e) => setMood(Number(e.target.value))} className="w-full accent-primary" data-testid="slider-mood" />
                <div className="flex justify-between text-xs text-muted-foreground mt-1"><span>Terrible</span><span>Great</span></div>
              </div>
              <div>
                <div className="flex justify-between items-center mb-2">
                  <Label>Energy</Label>
                  <span className={`text-sm font-medium ${moodColor(energy)}`}>{ENERGY_LABELS[energy - 1]}</span>
                </div>
                <input type="range" min="1" max="5" value={energy} onChange={(e) => setEnergy(Number(e.target.value))} className="w-full accent-primary" data-testid="slider-energy" />
                <div className="flex justify-between text-xs text-muted-foreground mt-1"><span>Exhausted</span><span>Energized</span></div>
              </div>
              <div>
                <div className="flex justify-between items-center mb-2">
                  <Label>Stress</Label>
                  <span className={`text-sm font-medium ${stressColor(stress)}`}>{STRESS_LABELS[stress - 1]}</span>
                </div>
                <input type="range" min="1" max="5" value={stress} onChange={(e) => setStress(Number(e.target.value))} className="w-full accent-primary" data-testid="slider-stress" />
                <div className="flex justify-between text-xs text-muted-foreground mt-1"><span>Relaxed</span><span>Overwhelmed</span></div>
              </div>
              <div>
                <Label>Hours Worked Today</Label>
                <Input name="hoursWorked" type="number" step="0.5" min="0" max="24" data-testid="input-hours-worked" placeholder="e.g. 8" />
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea name="notes" data-testid="input-wellness-notes" placeholder="How are you feeling?" className="resize-none" />
              </div>
              <div className="flex gap-3">
                <Button type="submit" className="flex-1" disabled={createMutation.isPending} data-testid="button-submit-checkin">
                  {createMutation.isPending ? "Saving..." : "Save Check-In"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowCheckin(false)}>Cancel</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {todayCheck?.aiRecommendation && (
        <Card className="border-purple-500/20 bg-purple-500/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <Sparkles className="w-4 h-4 text-purple-400" />
              <p className="text-sm font-medium">AI Recommendation</p>
            </div>
            <p className="text-sm text-muted-foreground" data-testid="text-ai-wellness-rec">{todayCheck.aiRecommendation}</p>
          </CardContent>
        </Card>
      )}

      {recentChecks.length > 0 && (
        <div>
          <p className="text-sm font-medium mb-3">Recent Check-Ins</p>
          <div className="space-y-2">
            {recentChecks.map((check: any) => (
              <Card key={check.id} data-testid={`card-wellness-${check.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-4 flex-wrap">
                      <span className="text-xs text-muted-foreground w-20 shrink-0">
                        {new Date(check.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </span>
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className={`text-xs font-medium ${moodColor(check.mood)}`}>Mood: {check.mood}/5</span>
                        <span className={`text-xs font-medium ${moodColor(check.energy)}`}>Energy: {check.energy}/5</span>
                        <span className={`text-xs font-medium ${stressColor(check.stress)}`}>Stress: {check.stress}/5</span>
                      </div>
                    </div>
                    {check.hoursWorked != null && (
                      <span className="text-xs text-muted-foreground">{check.hoursWorked}h worked</span>
                    )}
                  </div>
                  {check.notes && <p className="text-xs text-muted-foreground mt-2">{check.notes}</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const insightCategoryColors: Record<string, string> = {
  content: "bg-purple-500/10 text-purple-500",
  audience: "bg-blue-500/10 text-blue-500",
  growth: "bg-emerald-500/10 text-emerald-500",
  revenue: "bg-amber-500/10 text-amber-500",
  seo: "bg-cyan-500/10 text-cyan-500",
  engagement: "bg-pink-500/10 text-pink-500",
};

function LearningTab() {
  const { data: insights, isLoading } = useQuery<any[]>({ queryKey: ['/api/learning-insights'] });
  const [filterCategory, setFilterCategory] = useState<string | null>(null);

  const categories = useMemo(() => {
    if (!insights) return [];
    const cats = new Set(insights.map((i: any) => i.category));
    return Array.from(cats).sort();
  }, [insights]);

  const filtered = filterCategory ? insights?.filter((i: any) => i.category === filterCategory) : insights;

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-24 rounded-xl" /><Skeleton className="h-40 rounded-xl" /><Skeleton className="h-40 rounded-xl" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 data-testid="text-learning-title" className="text-lg font-semibold">Learning Hub</h2>
        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
          <Sparkles className="w-3 h-3" />
          AI-discovered insights from your content performance
        </p>
      </div>

      {insights && insights.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">Total Insights</p>
              <p className="text-xl font-bold" data-testid="text-learning-total">{insights.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">Categories</p>
              <p className="text-xl font-bold" data-testid="text-learning-categories">{categories.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">Avg Confidence</p>
              <p className="text-xl font-bold" data-testid="text-learning-confidence">
                {(insights.reduce((s: number, i: any) => s + (i.confidence || 0), 0) / insights.length * 100).toFixed(0)}%
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {categories.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <Badge variant={filterCategory === null ? "default" : "secondary"} className="cursor-pointer" onClick={() => setFilterCategory(null)} data-testid="filter-learning-all">All</Badge>
          {categories.map((cat: string) => (
            <Badge key={cat} variant={filterCategory === cat ? "default" : "secondary"} className="cursor-pointer capitalize" onClick={() => setFilterCategory(filterCategory === cat ? null : cat)} data-testid={`filter-learning-${cat}`}>
              {cat}
            </Badge>
          ))}
        </div>
      )}

      {(!filtered || filtered.length === 0) ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <BookOpen className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium mb-1" data-testid="text-empty-learning">No insights yet</p>
            <p className="text-xs text-muted-foreground">AI will analyze your content and discover patterns over time</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filtered.map((insight: any) => (
            <Card key={insight.id} data-testid={`card-insight-${insight.id}`}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="space-y-1">
                    <CardTitle className="text-base" data-testid={`text-insight-pattern-${insight.id}`}>{insight.pattern}</CardTitle>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary" className={`text-xs capitalize no-default-hover-elevate no-default-active-elevate ${insightCategoryColors[insight.category] || ""}`}>
                        {insight.category}
                      </Badge>
                      {insight.sampleSize > 0 && (
                        <span className="text-xs text-muted-foreground">{insight.sampleSize} samples</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Confidence</p>
                    <p className="text-sm font-bold" data-testid={`text-insight-confidence-${insight.id}`}>{((insight.confidence || 0) * 100).toFixed(0)}%</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${(insight.confidence || 0) > 0.7 ? "bg-emerald-500" : (insight.confidence || 0) > 0.4 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${(insight.confidence || 0) * 100}%` }} />
                </div>

                {insight.data?.finding && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-0.5">Finding</p>
                    <p className="text-sm">{insight.data.finding}</p>
                  </div>
                )}
                {insight.data?.recommendation && (
                  <div className="bg-muted/50 rounded-md p-3">
                    <div className="flex items-center gap-1 mb-1">
                      <Sparkles className="w-3 h-3 text-purple-400" />
                      <p className="text-xs font-medium">Recommendation</p>
                    </div>
                    <p className="text-sm" data-testid={`text-insight-rec-${insight.id}`}>{insight.data.recommendation}</p>
                  </div>
                )}
                {insight.data?.evidence && insight.data.evidence.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Evidence</p>
                    <ul className="text-xs text-muted-foreground space-y-0.5 pl-4 list-disc">
                      {insight.data.evidence.map((ev: string, i: number) => <li key={i}>{ev}</li>)}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

const VALID_TABS: TabKey[] = ["ventures", "goals", "sponsors", "brand", "collabs", "competitors", "legal", "wellness", "learning"];

const TAB_LABELS: Record<TabKey, string> = {
  ventures: "Ventures",
  goals: "Goals",
  sponsors: "Sponsors",
  brand: "Brand",
  collabs: "Collabs",
  competitors: "Competitors",
  legal: "Legal",
  wellness: "Wellness",
  learning: "Learning",
};

const TAB_GROUPS: { label: string; tabs: TabKey[] }[] = [
  { label: "Business", tabs: ["ventures", "goals", "sponsors"] },
  { label: "Growth", tabs: ["brand", "collabs", "competitors"] },
  { label: "More", tabs: ["legal", "wellness", "learning"] },
];

export default function Business() {
  const params = useParams<{ tab?: string }>();
  const [, setLocation] = useLocation();
  const activeTab: TabKey = VALID_TABS.includes(params.tab as TabKey) ? (params.tab as TabKey) : "ventures";

  const handleTabClick = (tab: TabKey) => {
    if (tab === "ventures") {
      setLocation("/business");
    } else {
      setLocation(`/business/${tab}`);
    }
  };

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 data-testid="text-page-title" className="text-2xl font-display font-bold">Business Hub</h1>
        <p data-testid="text-page-subtitle" className="text-sm text-muted-foreground">Your ventures, growth, and business operations in one place</p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {TAB_GROUPS.map((group, gi) => (
          <div key={group.label} className="flex items-center gap-2 flex-wrap">
            {gi > 0 && <span className="text-xs text-muted-foreground mx-1">|</span>}
            <span className="text-xs text-muted-foreground">{group.label}</span>
            {group.tabs.map((tab) => (
              <Button
                key={tab}
                variant={activeTab === tab ? "default" : "secondary"}
                size="sm"
                onClick={() => handleTabClick(tab)}
                data-testid={`tab-${tab}`}
              >
                {TAB_LABELS[tab]}
              </Button>
            ))}
          </div>
        ))}
      </div>

      {activeTab === "ventures" && <VenturesTab />}
      {activeTab === "goals" && <GoalsTab />}
      {activeTab === "sponsors" && <SponsorsTab />}
      {activeTab === "brand" && <BrandTab />}
      {activeTab === "collabs" && <CollabsTab />}
      {activeTab === "competitors" && <CompetitorsTab />}
      {activeTab === "legal" && <LegalTab />}
      {activeTab === "wellness" && <WellnessTab />}
      {activeTab === "learning" && <LearningTab />}
    </div>
  );
}
