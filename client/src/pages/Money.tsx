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
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  DollarSign, Plus, TrendingUp, CalendarDays, Receipt, ShieldCheck, Trash2, Tag,
  Calculator, FileText, AlertTriangle, CheckCircle2, Building2,
  CreditCard, Link2, Copy, Upload,
  Briefcase, Target, Sparkles, Handshake, ChevronDown, Mail, Users, Eye,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useParams, useLocation } from "wouter";
import { format } from "date-fns";
import { useState, useMemo } from "react";

type TabKey = "revenue" | "expenses" | "taxes" | "payments" | "ventures" | "goals" | "sponsors";

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

const FILTER_CATEGORIES = [
  "All", "Advertising", "Equipment", "Software", "Travel", "Home Office",
  "Education", "Professional Services", "Supplies", "Meals", "Internet/Phone",
  "Insurance", "Other",
];

const IRS_CATEGORIES = [
  { value: "advertising", label: "Advertising" },
  { value: "car_vehicle", label: "Car & Vehicle" },
  { value: "commissions", label: "Commissions" },
  { value: "equipment", label: "Equipment" },
  { value: "insurance", label: "Insurance" },
  { value: "interest", label: "Interest" },
  { value: "legal_professional", label: "Legal & Professional" },
  { value: "office_expense", label: "Office Expense" },
  { value: "rent_lease", label: "Rent & Lease" },
  { value: "repairs_maintenance", label: "Repairs & Maintenance" },
  { value: "supplies", label: "Supplies" },
  { value: "taxes_licenses", label: "Taxes & Licenses" },
  { value: "travel", label: "Travel" },
  { value: "meals", label: "Meals" },
  { value: "utilities", label: "Utilities" },
  { value: "wages", label: "Wages" },
  { value: "software_subscriptions", label: "Software & Subscriptions" },
  { value: "education_training", label: "Education & Training" },
  { value: "home_office", label: "Home Office" },
  { value: "other", label: "Other" },
];

const US_STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut",
  "Delaware", "District of Columbia", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois",
  "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts",
  "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada",
  "New Hampshire", "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota",
  "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota",
  "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington", "West Virginia",
  "Wisconsin", "Wyoming",
];

const QUARTER_INFO = [
  { label: "Q1", due: "April 15, 2026" },
  { label: "Q2", due: "June 15, 2026" },
  { label: "Q3", due: "September 15, 2026" },
  { label: "Q4", due: "January 15, 2027" },
];

const CREATOR_DEDUCTIONS = [
  "Equipment & gear (cameras, microphones, lighting)",
  "Software subscriptions (editing, analytics, scheduling)",
  "Home office expenses",
  "Internet & phone bills (business portion)",
  "Travel for content creation",
  "Professional development & courses",
  "Advertising & promotion costs",
  "Contractor & freelancer payments",
  "Music licensing & stock media",
  "Health insurance premiums (self-employed)",
];

function getEntityRecommendation(income: number) {
  if (income >= 100000) {
    return { recommended: "S-Corporation", reason: "At your income level ($100k+), an S-Corp can significantly reduce self-employment taxes through salary/distribution splitting." };
  }
  if (income >= 40000) {
    return { recommended: "LLC", reason: "With income between $40k-$100k, an LLC provides liability protection and tax flexibility without the overhead of an S-Corp." };
  }
  return { recommended: "Sole Proprietor", reason: "At your current income level (under $40k), a Sole Proprietorship keeps things simple with minimal filing requirements." };
}

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

export default function Money() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<TabKey>("revenue");

  const [revenueDialogOpen, setRevenueDialogOpen] = useState(false);
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [taxDeductible, setTaxDeductible] = useState(false);
  const [activeFilter, setActiveFilter] = useState("All");
  const [selectedState, setSelectedState] = useState("");
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [paymentUrl, setPaymentUrl] = useState("");

  const { data: revenueRecords, isLoading: revenueLoading } = useQuery<any[]>({ queryKey: ['/api/revenue'] });
  const { data: revenueSummary } = useQuery<any>({ queryKey: ['/api/revenue/summary'] });

  const { data: expenses, isLoading: expensesLoading } = useQuery<any[]>({ queryKey: ['/api/expenses'] });
  const { data: expenseSummary } = useQuery<any>({ queryKey: ['/api/expenses/summary'] });

  const { data: taxEstimates, isLoading: taxLoading } = useQuery<any[]>({ queryKey: ['/api/tax-estimates', '?year=2026'] });

  const { data: payments, isLoading: paymentsLoading } = useQuery<any[]>({ queryKey: ['/api/stripe/payments'] });

  const createRevenueMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/revenue", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/revenue'] });
      queryClient.invalidateQueries({ queryKey: ['/api/revenue/summary'] });
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/stats'] });
      setRevenueDialogOpen(false);
      toast({ title: "Revenue recorded" });
    },
  });

  const createExpenseMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/expenses", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/expenses'] });
      queryClient.invalidateQueries({ queryKey: ['/api/expenses/summary'] });
      setExpenseDialogOpen(false);
      setTaxDeductible(false);
      toast({ title: "Expense added" });
    },
  });

  const deleteExpenseMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/expenses/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/expenses'] });
      queryClient.invalidateQueries({ queryKey: ['/api/expenses/summary'] });
      toast({ title: "Expense deleted" });
    },
  });

  const importCsvMutation = useMutation({
    mutationFn: async (rows: any[]) => {
      const res = await apiRequest("POST", "/api/expenses/import-csv", { rows });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/expenses'] });
      queryClient.invalidateQueries({ queryKey: ['/api/expenses/summary'] });
      setImportDialogOpen(false);
      toast({ title: `Imported ${data.imported} expenses` });
    },
    onError: () => {
      toast({ title: "Import failed", variant: "destructive" });
    },
  });

  const analyzeMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/tax-analyze", data);
      return res.json();
    },
    onSuccess: (data) => {
      setAnalysisResult(data);
      toast({ title: "Tax analysis complete" });
    },
    onError: () => {
      toast({ title: "Analysis failed", description: "Could not complete tax analysis. Please try again.", variant: "destructive" });
    },
  });

  const createPaymentMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/stripe/create-payment-link", data);
      return res.json();
    },
    onSuccess: (data: any) => {
      setPaymentUrl(data.url || "");
      queryClient.invalidateQueries({ queryKey: ['/api/stripe/payments'] });
      toast({ title: "Payment link created" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to create payment link", description: error.message, variant: "destructive" });
    },
  });

  const totalRevenue = revenueSummary?.total || 0;
  const byPlatform = revenueSummary?.byPlatform || {};

  const { thisMonth, avgPerVideo } = useMemo(() => {
    if (!revenueRecords || revenueRecords.length === 0) return { thisMonth: 0, avgPerVideo: 0 };
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    let monthTotal = 0;
    for (const r of revenueRecords) {
      const date = r.recordedAt ? new Date(r.recordedAt) : null;
      if (date && date.getMonth() === currentMonth && date.getFullYear() === currentYear) {
        monthTotal += r.amount || 0;
      }
    }
    const avg = totalRevenue / revenueRecords.length;
    return { thisMonth: monthTotal, avgPerVideo: avg };
  }, [revenueRecords, totalRevenue]);

  const expenseTotal = expenseSummary?.total || 0;
  const expenseDeductible = expenseSummary?.deductible || 0;
  const byCategory = expenseSummary?.byCategory || {};

  const topCategory = useMemo(() => {
    const entries = Object.entries(byCategory);
    if (entries.length === 0) return "N/A";
    entries.sort((a: any, b: any) => b[1] - a[1]);
    return entries[0][0];
  }, [byCategory]);

  const filteredExpenses = useMemo(() => {
    if (!expenses) return [];
    if (activeFilter === "All") return expenses;
    const filterLower = activeFilter.toLowerCase().replace(/\//g, "_").replace(/ /g, "_");
    return expenses.filter((e: any) => {
      const cat = (e.category || e.irsCategory || "").toLowerCase();
      return cat.includes(filterLower) || filterLower.includes(cat);
    });
  }, [expenses, activeFilter]);

  const entityRec = getEntityRecommendation(totalRevenue);

  const handleCreateRevenue = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createRevenueMutation.mutate({
      platform: formData.get("platform"),
      source: formData.get("source"),
      amount: parseFloat(formData.get("amount") as string),
      period: formData.get("period"),
    });
  };

  const handleCreateExpense = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createExpenseMutation.mutate({
      description: formData.get("description"),
      amount: parseFloat(formData.get("amount") as string),
      category: formData.get("category"),
      vendor: formData.get("vendor"),
      irsCategory: formData.get("irsCategory"),
      expenseDate: formData.get("expenseDate"),
      taxDeductible,
    });
  };

  const handleCsvImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) {
        toast({ title: "CSV file is empty or invalid", variant: "destructive" });
        return;
      }
      const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
      const descIdx = headers.findIndex(h => h === "description");
      const amountIdx = headers.findIndex(h => h === "amount");
      const dateIdx = headers.findIndex(h => h.includes("posting") || h === "date");
      const rows: any[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i]);
        if (cols.length <= 1) continue;
        const amount = amountIdx >= 0 ? cols[amountIdx] : "0";
        const description = descIdx >= 0 ? cols[descIdx] : cols[0] || "Imported";
        const date = dateIdx >= 0 ? cols[dateIdx] : "";
        rows.push({
          description: description.replace(/^"|"$/g, "").trim(),
          amount: Math.abs(parseFloat(amount.replace(/[^0-9.-]/g, "")) || 0),
          date: date.replace(/^"|"$/g, "").trim(),
          vendor: description.replace(/^"|"$/g, "").trim(),
        });
      }
      if (rows.length === 0) {
        toast({ title: "No valid rows found in CSV", variant: "destructive" });
        return;
      }
      importCsvMutation.mutate(rows);
    };
    reader.readAsText(file);
  };

  const handleCreatePayment = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const dollars = parseFloat(formData.get("amount") as string);
    createPaymentMutation.mutate({
      amount: Math.round(dollars * 100),
      description: formData.get("description") || "Payment",
      customerEmail: formData.get("customerEmail") || undefined,
    });
  };

  const handleAnalyze = () => {
    analyzeMutation.mutate({
      totalRevenue,
      totalExpenses: 0,
      state: selectedState || "California",
      entityType: "Sole Proprietor",
      year: 2026,
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
  };

  const tabs: { key: TabKey; label: string }[] = [
    { key: "revenue", label: "Revenue" },
    { key: "expenses", label: "Expenses" },
    { key: "taxes", label: "Taxes" },
    { key: "payments", label: "Payments" },
    { key: "ventures", label: "Ventures" },
    { key: "goals", label: "Goals" },
    { key: "sponsors", label: "Sponsors" },
  ];

  const isLoading = (activeTab === "revenue" && revenueLoading) ||
    (activeTab === "expenses" && expensesLoading) ||
    (activeTab === "taxes" && taxLoading) ||
    (activeTab === "payments" && paymentsLoading);

  if (isLoading) {
    return (
      <div className="p-6 lg:p-8 space-y-6 max-w-5xl mx-auto">
        <Skeleton className="h-8 w-48" data-testid="skeleton-title" />
        <div className="flex items-center gap-2 flex-wrap">
          {tabs.map(t => <Skeleton key={t.key} className="h-9 w-24 rounded-md" />)}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 data-testid="text-page-title" className="text-2xl font-display font-bold">Money & Business</h1>
        <p data-testid="text-page-subtitle" className="text-sm text-muted-foreground mt-1">Revenue, expenses, taxes, ventures & deals</p>
      </div>

      <div className="flex items-center gap-2 flex-wrap" data-testid="tab-bar">
        {tabs.map(t => (
          <Button
            key={t.key}
            variant={activeTab === t.key ? "default" : "secondary"}
            onClick={() => setActiveTab(t.key)}
            data-testid={`tab-${t.key}`}
          >
            {t.label}
          </Button>
        ))}
      </div>

      {activeTab === "revenue" && (
        <div className="space-y-6">
          <div className="flex justify-between items-center gap-4 flex-wrap">
            <h2 data-testid="text-revenue-title" className="text-lg font-semibold">Revenue</h2>
            <Dialog open={revenueDialogOpen} onOpenChange={setRevenueDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-add-revenue" size="sm">
                  <Plus className="w-4 h-4 mr-1" />
                  Record Revenue
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Record Revenue</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreateRevenue} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Platform</Label>
                      <Select name="platform" defaultValue="youtube">
                        <SelectTrigger data-testid="select-revenue-platform"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="youtube">YouTube</SelectItem>
                          <SelectItem value="twitch">Twitch</SelectItem>
                          <SelectItem value="tiktok">TikTok</SelectItem>
                          <SelectItem value="kick">Kick</SelectItem>
                          <SelectItem value="instagram">Instagram</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Source</Label>
                      <Select name="source" defaultValue="adsense">
                        <SelectTrigger data-testid="select-revenue-source"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="adsense">AdSense</SelectItem>
                          <SelectItem value="sponsorship">Sponsorship</SelectItem>
                          <SelectItem value="membership">Membership</SelectItem>
                          <SelectItem value="superchat">Super Chat</SelectItem>
                          <SelectItem value="affiliate">Affiliate</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Amount ($)</Label>
                      <Input name="amount" type="number" step="0.01" required data-testid="input-revenue-amount" placeholder="0.00" />
                    </div>
                    <div>
                      <Label>Period</Label>
                      <Input name="period" data-testid="input-revenue-period" placeholder="Jan 2026" />
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={createRevenueMutation.isPending} data-testid="button-submit-revenue">
                    {createRevenueMutation.isPending ? "Saving..." : "Save"}
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
                  <span className="text-xs text-muted-foreground">Total Revenue</span>
                </div>
                <p className="text-xl font-bold" data-testid="text-total-revenue">
                  ${totalRevenue.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <CalendarDays className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">This Month</span>
                </div>
                <p className="text-xl font-bold" data-testid="text-month-revenue">
                  ${thisMonth.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Avg per Record</span>
                </div>
                <p className="text-xl font-bold" data-testid="text-avg-revenue">
                  ${(avgPerVideo || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </p>
              </CardContent>
            </Card>
          </div>

          {Object.keys(byPlatform).length > 0 && (
            <div className="flex gap-3 flex-wrap">
              {Object.entries(byPlatform)
                .sort((a: any, b: any) => b[1] - a[1])
                .map(([platform, amount]) => (
                  <Badge key={platform} variant="secondary" className="capitalize" data-testid={`badge-platform-${platform}`}>
                    {platform}: ${(amount as number).toFixed(0)}
                  </Badge>
                ))}
            </div>
          )}

          <Card>
            <CardHeader className="pb-0">
              <CardTitle className="text-base">Revenue Records</CardTitle>
            </CardHeader>
            {!revenueRecords || revenueRecords.length === 0 ? (
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <DollarSign className="w-10 h-10 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground" data-testid="text-no-revenue">No revenue recorded yet.</p>
              </CardContent>
            ) : (
              <CardContent className="p-0">
                <div className="divide-y divide-border/50">
                  {revenueRecords.map((record: any) => (
                    <div key={record.id} data-testid={`row-revenue-${record.id}`} className="px-6 py-4 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium capitalize" data-testid={`text-source-${record.id}`}>{record.source}</span>
                          <Badge variant="secondary" className="text-xs capitalize" data-testid={`badge-record-platform-${record.id}`}>{record.platform}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5" data-testid={`text-period-${record.id}`}>
                          {record.period || (record.recordedAt ? format(new Date(record.recordedAt), "MMM d, yyyy") : "")}
                        </p>
                      </div>
                      <span className="text-sm font-semibold text-emerald-400 shrink-0" data-testid={`text-amount-${record.id}`}>
                        +${record.amount?.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>
        </div>
      )}

      {activeTab === "expenses" && (
        <div className="space-y-6">
          <div className="flex justify-between items-center gap-4 flex-wrap">
            <h2 data-testid="text-expenses-title" className="text-lg font-semibold">Expense Tracker</h2>
            <div className="flex items-center gap-2 flex-wrap">
              <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
                <DialogTrigger asChild>
                  <Button data-testid="button-import-chase" size="sm" variant="secondary">
                    <Upload className="w-4 h-4 mr-1" />
                    Import from Chase
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Import Chase CSV</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Upload a CSV file exported from Chase. Expected columns: Details, Posting Date, Description, Amount, Type, Balance, Check or Slip #
                    </p>
                    <div>
                      <Label>CSV File</Label>
                      <Input
                        type="file"
                        accept=".csv"
                        onChange={handleCsvImport}
                        disabled={importCsvMutation.isPending}
                        data-testid="input-csv-file"
                      />
                    </div>
                    {importCsvMutation.isPending && (
                      <p className="text-sm text-muted-foreground" data-testid="text-importing">Importing...</p>
                    )}
                  </div>
                </DialogContent>
              </Dialog>
              <Dialog open={expenseDialogOpen} onOpenChange={(open) => { setExpenseDialogOpen(open); if (!open) setTaxDeductible(false); }}>
                <DialogTrigger asChild>
                  <Button data-testid="button-add-expense" size="sm">
                    <Plus className="w-4 h-4 mr-1" />
                    Add Expense
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Expense</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleCreateExpense} className="space-y-4">
                    <div>
                      <Label>Description</Label>
                      <Input name="description" required data-testid="input-expense-description" placeholder="What was this expense for?" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Amount ($)</Label>
                        <Input name="amount" type="number" step="0.01" required data-testid="input-expense-amount" placeholder="0.00" />
                      </div>
                      <div>
                        <Label>Vendor</Label>
                        <Input name="vendor" data-testid="input-expense-vendor" placeholder="Company name" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Category</Label>
                        <Select name="category" defaultValue="other">
                          <SelectTrigger data-testid="select-expense-category"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {FILTER_CATEGORIES.filter(c => c !== "All").map(c => (
                              <SelectItem key={c} value={c.toLowerCase().replace(/\//g, "_").replace(/ /g, "_")}>{c}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>IRS Category</Label>
                        <Select name="irsCategory" defaultValue="other">
                          <SelectTrigger data-testid="select-expense-irs-category"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {IRS_CATEGORIES.map(c => (
                              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Expense Date</Label>
                        <Input name="expenseDate" type="date" data-testid="input-expense-date" />
                      </div>
                      <div className="flex items-end gap-2 pb-1">
                        <Checkbox
                          id="taxDeductible"
                          checked={taxDeductible}
                          onCheckedChange={(checked) => setTaxDeductible(checked === true)}
                          data-testid="checkbox-tax-deductible"
                        />
                        <Label htmlFor="taxDeductible" className="cursor-pointer">Tax Deductible</Label>
                      </div>
                    </div>
                    <Button type="submit" className="w-full" disabled={createExpenseMutation.isPending} data-testid="button-submit-expense">
                      {createExpenseMutation.isPending ? "Saving..." : "Add Expense"}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Total Expenses</span>
                </div>
                <p className="text-xl font-bold" data-testid="text-total-expenses">
                  ${expenseTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Tax Deductible</span>
                </div>
                <p className="text-xl font-bold" data-testid="text-tax-deductible">
                  ${expenseDeductible.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <Tag className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Top Category</span>
                </div>
                <p className="text-xl font-bold capitalize" data-testid="text-top-category">
                  {topCategory.replace(/_/g, " ")}
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="flex gap-2 flex-wrap">
            {FILTER_CATEGORIES.map(cat => (
              <Badge
                key={cat}
                variant={activeFilter === cat ? "default" : "secondary"}
                className="cursor-pointer"
                data-testid={`badge-filter-${cat.toLowerCase().replace(/\//g, "-").replace(/ /g, "-")}`}
                onClick={() => setActiveFilter(cat)}
              >
                {cat}
              </Badge>
            ))}
          </div>

          <Card>
            <CardHeader className="pb-0">
              <CardTitle className="text-base">Expenses</CardTitle>
            </CardHeader>
            {!filteredExpenses || filteredExpenses.length === 0 ? (
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Receipt className="w-10 h-10 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground" data-testid="text-no-expenses">No expenses found.</p>
              </CardContent>
            ) : (
              <CardContent className="p-0">
                <div className="divide-y divide-border/50">
                  {filteredExpenses.map((expense: any) => (
                    <div key={expense.id} data-testid={`row-expense-${expense.id}`} className="px-6 py-4 flex items-center justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium" data-testid={`text-description-${expense.id}`}>{expense.description}</span>
                          <Badge variant="secondary" className="text-xs capitalize" data-testid={`badge-category-${expense.id}`}>
                            {(expense.category || expense.irsCategory || "other").replace(/_/g, " ")}
                          </Badge>
                          {expense.taxDeductible && (
                            <Badge variant="outline" className="text-xs" data-testid={`badge-deductible-${expense.id}`}>
                              Tax Deductible
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                          <p className="text-xs text-muted-foreground" data-testid={`text-date-${expense.id}`}>
                            {expense.expenseDate ? format(new Date(expense.expenseDate), "MMM d, yyyy") : ""}
                          </p>
                          {expense.vendor && (
                            <p className="text-xs text-muted-foreground" data-testid={`text-vendor-${expense.id}`}>
                              {expense.vendor}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-sm font-semibold" data-testid={`text-amount-${expense.id}`}>
                          ${expense.amount?.toFixed(2)}
                        </span>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => deleteExpenseMutation.mutate(expense.id)}
                          disabled={deleteExpenseMutation.isPending}
                          data-testid={`button-delete-${expense.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>
        </div>
      )}

      {activeTab === "taxes" && (
        <div className="space-y-6">
          <Card>
            <CardContent className="p-4 flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3 flex-wrap">
                <Calculator className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">AI Tax Analysis</p>
                  <p className="text-xs text-muted-foreground">Get personalized tax strategy recommendations</p>
                </div>
              </div>
              <Button
                data-testid="button-analyze-tax"
                size="sm"
                onClick={handleAnalyze}
                disabled={analyzeMutation.isPending}
              >
                {analyzeMutation.isPending ? "Analyzing..." : "Run Analysis"}
              </Button>
            </CardContent>
          </Card>

          {analysisResult && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                  <FileText className="h-4 w-4" />
                  Analysis Results
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p data-testid="text-analysis-result" className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {typeof analysisResult === "string"
                    ? analysisResult
                    : analysisResult.recommendations || analysisResult.message || JSON.stringify(analysisResult, null, 2)}
                </p>
              </CardContent>
            </Card>
          )}

          <div>
            <h2 data-testid="text-quarterly-title" className="text-lg font-semibold mb-3">Quarterly Estimates</h2>
            {(!taxEstimates || taxEstimates.length === 0) ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <Calculator className="w-10 h-10 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground" data-testid="text-no-estimates">Generate your first tax estimate</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {taxEstimates.map((est: any, idx: number) => (
                  <Card key={est.id || idx} data-testid={`card-quarter-${idx}`}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <CardTitle className="text-base">{QUARTER_INFO[idx]?.label || `Q${idx + 1}`}</CardTitle>
                        <Badge
                          variant={est.paid ? "default" : "secondary"}
                          data-testid={`badge-status-${idx}`}
                        >
                          {est.paid ? "Paid" : "Due"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{QUARTER_INFO[idx]?.due}</p>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xl font-bold mb-2" data-testid={`text-estimate-amount-${idx}`}>
                        ${(est.estimatedTax || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </p>
                      <div className="space-y-1 text-xs text-muted-foreground">
                        <div className="flex justify-between gap-2">
                          <span>Federal</span>
                          <span data-testid={`text-federal-${idx}`}>${(est.federal || 0).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between gap-2">
                          <span>State</span>
                          <span data-testid={`text-state-${idx}`}>${(est.stateTax || 0).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between gap-2">
                          <span>Self-employment</span>
                          <span data-testid={`text-se-${idx}`}>${(est.selfEmployment || 0).toFixed(2)}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                <Building2 className="h-4 w-4" />
                Entity Type Recommendation
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm text-muted-foreground">Current entity:</span>
                <Badge variant="secondary" data-testid="badge-current-entity">Sole Proprietor</Badge>
              </div>
              <div className="flex items-start gap-3">
                <TrendingUp className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-sm font-medium" data-testid="text-recommended-entity">
                    Recommended: {entityRec.recommended}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1" data-testid="text-entity-reason">
                    {entityRec.reason}
                  </p>
                </div>
              </div>
              <div className="text-xs text-muted-foreground flex items-start gap-2 mt-2">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>Consult a tax professional before changing your entity type.</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                <FileText className="h-4 w-4" />
                State-Specific Guidance
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Select value={selectedState} onValueChange={setSelectedState}>
                <SelectTrigger data-testid="select-state" className="w-full sm:w-64">
                  <SelectValue placeholder="Select a state" />
                </SelectTrigger>
                <SelectContent>
                  {US_STATES.map((state) => (
                    <SelectItem key={state} value={state}>{state}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedState && (
                <div data-testid="text-state-info" className="space-y-2 text-sm">
                  <p className="font-medium">{selectedState} Tax Information</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-muted-foreground">
                    <div>
                      <p className="font-medium text-foreground mb-1">Filing Requirements</p>
                      <p>State income tax return required if you earned income in {selectedState}. Self-employed individuals must file quarterly estimates.</p>
                    </div>
                    <div>
                      <p className="font-medium text-foreground mb-1">Tax Rates</p>
                      <p>State income tax rates vary. Check your {selectedState} Department of Revenue for current brackets and rates.</p>
                    </div>
                    <div>
                      <p className="font-medium text-foreground mb-1">Key Deadlines</p>
                      <p>Annual return: April 15, 2026. Quarterly estimates follow federal schedule.</p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                <CheckCircle2 className="h-4 w-4" />
                Common Creator Deductions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {CREATOR_DEDUCTIONS.map((deduction, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm" data-testid={`text-deduction-${idx}`}>
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span>{deduction}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "payments" && (
        <div className="space-y-6">
          <div className="flex justify-between items-center gap-4 flex-wrap">
            <h2 data-testid="text-payments-title" className="text-lg font-semibold">Stripe Payments</h2>
            <Dialog open={paymentDialogOpen} onOpenChange={(open) => { setPaymentDialogOpen(open); if (!open) setPaymentUrl(""); }}>
              <DialogTrigger asChild>
                <Button data-testid="button-create-payment-link" size="sm">
                  <Link2 className="w-4 h-4 mr-1" />
                  Create Payment Link
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Payment Link</DialogTitle>
                </DialogHeader>
                {paymentUrl ? (
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">Payment link created successfully:</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Input
                        value={paymentUrl}
                        readOnly
                        data-testid="input-payment-url"
                        className="flex-1"
                      />
                      <Button
                        size="icon"
                        variant="secondary"
                        onClick={() => copyToClipboard(paymentUrl)}
                        data-testid="button-copy-url"
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                    <Button
                      variant="secondary"
                      className="w-full"
                      onClick={() => { setPaymentUrl(""); }}
                      data-testid="button-create-another"
                    >
                      Create Another
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={handleCreatePayment} className="space-y-4">
                    <div>
                      <Label>Amount ($)</Label>
                      <Input name="amount" type="number" step="0.01" min="1" required data-testid="input-payment-amount" placeholder="0.00" />
                    </div>
                    <div>
                      <Label>Description</Label>
                      <Input name="description" required data-testid="input-payment-description" placeholder="What is this payment for?" />
                    </div>
                    <div>
                      <Label>Customer Email (optional)</Label>
                      <Input name="customerEmail" type="email" data-testid="input-payment-email" placeholder="customer@example.com" />
                    </div>
                    <Button type="submit" className="w-full" disabled={createPaymentMutation.isPending} data-testid="button-submit-payment">
                      {createPaymentMutation.isPending ? "Creating..." : "Create Payment Link"}
                    </Button>
                  </form>
                )}
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <CardHeader className="pb-0">
              <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                <CreditCard className="h-4 w-4" />
                Recent Payments
              </CardTitle>
            </CardHeader>
            {!payments || payments.length === 0 ? (
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <CreditCard className="w-10 h-10 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground" data-testid="text-no-payments">No payments yet. Create a payment link to get started.</p>
              </CardContent>
            ) : (
              <CardContent className="p-0">
                <div className="divide-y divide-border/50">
                  {payments.map((payment: any, idx: number) => (
                    <div key={payment.id || idx} data-testid={`row-payment-${payment.id || idx}`} className="px-6 py-4 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium" data-testid={`text-payment-desc-${idx}`}>
                            {payment.description || "Payment"}
                          </span>
                          <Badge
                            variant={payment.status === "succeeded" ? "default" : "secondary"}
                            className="text-xs capitalize"
                            data-testid={`badge-payment-status-${idx}`}
                          >
                            {payment.status || "pending"}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5" data-testid={`text-payment-date-${idx}`}>
                          {payment.created ? format(new Date(typeof payment.created === "number" ? payment.created * 1000 : payment.created), "MMM d, yyyy") : ""}
                        </p>
                      </div>
                      <span className="text-sm font-semibold shrink-0" data-testid={`text-payment-amount-${idx}`}>
                        ${((payment.amount || 0) / 100).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>
        </div>
      )}

      {activeTab === "ventures" && <VenturesTab />}
      {activeTab === "goals" && <GoalsTab />}
      {activeTab === "sponsors" && <SponsorsTab />}
    </div>
  );
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}