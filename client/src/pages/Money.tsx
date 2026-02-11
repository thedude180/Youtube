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
  Briefcase, Target, Sparkles, Handshake, ChevronDown, ChevronUp, Mail, Users, Eye,
  Loader2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useParams, useLocation } from "wouter";
import { format } from "date-fns";
import { useState, useMemo, useEffect } from "react";

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
  const [aiSponsorship, setAiSponsorship] = useState<any>(null);
  const [aiSponsorshipLoading, setAiSponsorshipLoading] = useState(false);
  const [aiMediaKit, setAiMediaKit] = useState<any>(null);
  const [aiMediaKitLoading, setAiMediaKitLoading] = useState(false);

  useEffect(() => {
    const cachedSponsor = sessionStorage.getItem("aiSponsorshipManager");
    if (cachedSponsor) {
      try { setAiSponsorship(JSON.parse(cachedSponsor)); } catch {}
    } else {
      setAiSponsorshipLoading(true);
      apiRequest("POST", "/api/ai/sponsorship-manager", {})
        .then(res => res.json())
        .then(data => {
          setAiSponsorship(data);
          sessionStorage.setItem("aiSponsorshipManager", JSON.stringify(data));
        })
        .catch(() => {})
        .finally(() => setAiSponsorshipLoading(false));
    }
    const cachedKit = sessionStorage.getItem("aiMediaKit");
    if (cachedKit) {
      try { setAiMediaKit(JSON.parse(cachedKit)); } catch {}
    } else {
      setAiMediaKitLoading(true);
      apiRequest("POST", "/api/ai/media-kit", {})
        .then(res => res.json())
        .then(data => {
          setAiMediaKit(data);
          sessionStorage.setItem("aiMediaKit", JSON.stringify(data));
        })
        .catch(() => {})
        .finally(() => setAiMediaKitLoading(false));
    }
  }, []);

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

  const copyToClipboardSponsors = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
  };

  return (
    <div className="space-y-6">
      {aiSponsorshipLoading && (
        <Card data-testid="card-ai-sponsorship-loading">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <Skeleton className="h-5 w-48" />
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Skeleton className="h-16 rounded-md" />
              <Skeleton className="h-16 rounded-md" />
              <Skeleton className="h-16 rounded-md" />
            </div>
          </CardContent>
        </Card>
      )}

      {aiSponsorship && !aiSponsorshipLoading && (
        <Card data-testid="card-ai-sponsorship">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <Sparkles className="h-4 w-4 text-purple-400" />
                <CardTitle className="text-base">AI Sponsorship Manager</CardTitle>
              </div>
              <Badge variant="secondary" className="no-default-hover-elevate no-default-active-elevate" data-testid="badge-ai-sponsorship-auto">
                Auto-generated
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {aiSponsorship.rateCard && (
              <div data-testid="section-rate-card">
                <p className="text-xs font-medium text-muted-foreground mb-2">Rate Card</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {aiSponsorship.rateCard.preRoll != null && (
                    <div className="space-y-0.5">
                      <p className="text-xs text-muted-foreground">Pre-Roll</p>
                      <p className="text-sm font-medium" data-testid="text-rate-preroll">${Number(aiSponsorship.rateCard.preRoll).toLocaleString()}</p>
                    </div>
                  )}
                  {aiSponsorship.rateCard.midRoll != null && (
                    <div className="space-y-0.5">
                      <p className="text-xs text-muted-foreground">Mid-Roll</p>
                      <p className="text-sm font-medium" data-testid="text-rate-midroll">${Number(aiSponsorship.rateCard.midRoll).toLocaleString()}</p>
                    </div>
                  )}
                  {aiSponsorship.rateCard.dedicated != null && (
                    <div className="space-y-0.5">
                      <p className="text-xs text-muted-foreground">Dedicated</p>
                      <p className="text-sm font-medium" data-testid="text-rate-dedicated">${Number(aiSponsorship.rateCard.dedicated).toLocaleString()}</p>
                    </div>
                  )}
                  {aiSponsorship.rateCard.integration != null && (
                    <div className="space-y-0.5">
                      <p className="text-xs text-muted-foreground">Integration</p>
                      <p className="text-sm font-medium" data-testid="text-rate-integration">${Number(aiSponsorship.rateCard.integration).toLocaleString()}</p>
                    </div>
                  )}
                  {aiSponsorship.rateCard.shortsMention != null && (
                    <div className="space-y-0.5">
                      <p className="text-xs text-muted-foreground">Shorts Mention</p>
                      <p className="text-sm font-medium" data-testid="text-rate-shorts">${Number(aiSponsorship.rateCard.shortsMention).toLocaleString()}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {aiSponsorship.prospectBrands && aiSponsorship.prospectBrands.length > 0 && (
              <div data-testid="section-prospect-brands">
                <p className="text-xs font-medium text-muted-foreground mb-2">Prospect Brands</p>
                <div className="space-y-2">
                  {aiSponsorship.prospectBrands.map((brand: any, idx: number) => (
                    <div key={idx} className="flex items-start justify-between gap-2" data-testid={`prospect-brand-${idx}`}>
                      <div className="min-w-0">
                        <p className="text-sm font-medium" data-testid={`text-brand-name-${idx}`}>{brand.brand || brand.name}</p>
                        <p className="text-xs text-muted-foreground" data-testid={`text-brand-pitch-${idx}`}>{brand.pitchAngle}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 flex-wrap">
                        {brand.fitLevel && (
                          <Badge variant="secondary" className={`text-xs no-default-hover-elevate no-default-active-elevate ${
                            brand.fitLevel === "high" ? "bg-emerald-500/10 text-emerald-500" :
                            brand.fitLevel === "medium" ? "bg-amber-500/10 text-amber-500" :
                            "bg-muted-foreground/10 text-muted-foreground"
                          }`} data-testid={`badge-brand-fit-${idx}`}>
                            {brand.fitLevel}
                          </Badge>
                        )}
                        {brand.estimatedBudget != null && (
                          <span className="text-xs text-muted-foreground" data-testid={`text-brand-budget-${idx}`}>
                            ${Number(brand.estimatedBudget).toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {aiSponsorship.outreachTemplate && (
              <div data-testid="section-outreach-template">
                <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                  <p className="text-xs font-medium text-muted-foreground">Outreach Email Template</p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyToClipboardSponsors(aiSponsorship.outreachTemplate)}
                    data-testid="button-copy-outreach"
                  >
                    <Copy className="w-3 h-3 mr-1" />
                    Copy
                  </Button>
                </div>
                <div className="text-xs text-muted-foreground whitespace-pre-wrap bg-muted/50 rounded-md p-3" data-testid="text-outreach-template">
                  {aiSponsorship.outreachTemplate}
                </div>
              </div>
            )}

            {aiSponsorship.pricingStrategy && (
              <div data-testid="section-pricing-strategy">
                <p className="text-xs font-medium text-muted-foreground mb-1">Pricing Strategy</p>
                <p className="text-sm text-muted-foreground" data-testid="text-pricing-strategy">{aiSponsorship.pricingStrategy}</p>
              </div>
            )}

            {aiSponsorship.redFlags && aiSponsorship.redFlags.length > 0 && (
              <div data-testid="section-red-flags">
                <p className="text-xs font-medium text-muted-foreground mb-1">Red Flags to Avoid</p>
                <div className="space-y-1">
                  {aiSponsorship.redFlags.map((flag: string, idx: number) => (
                    <div key={idx} className="flex items-start gap-2" data-testid={`red-flag-${idx}`}>
                      <AlertTriangle className="h-3 w-3 text-red-400 shrink-0 mt-0.5" />
                      <p className="text-sm text-muted-foreground">{flag}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {aiMediaKitLoading && (
        <Card data-testid="card-ai-media-kit-loading">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <Skeleton className="h-5 w-40" />
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
            <div className="grid grid-cols-2 gap-3">
              <Skeleton className="h-16 rounded-md" />
              <Skeleton className="h-16 rounded-md" />
            </div>
          </CardContent>
        </Card>
      )}

      {aiMediaKit && !aiMediaKitLoading && (
        <Card data-testid="card-ai-media-kit">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <Sparkles className="h-4 w-4 text-purple-400" />
                <CardTitle className="text-base">AI Media Kit</CardTitle>
              </div>
              <Badge variant="secondary" className="no-default-hover-elevate no-default-active-elevate" data-testid="badge-ai-media-kit-auto">
                Auto-generated
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {aiMediaKit.headline && (
              <div data-testid="section-media-headline">
                <p className="text-sm font-semibold" data-testid="text-media-headline">{aiMediaKit.headline}</p>
                {aiMediaKit.bio && (
                  <p className="text-xs text-muted-foreground mt-1" data-testid="text-media-bio">{aiMediaKit.bio}</p>
                )}
              </div>
            )}

            {aiMediaKit.keyMetrics && aiMediaKit.keyMetrics.length > 0 && (
              <div data-testid="section-key-metrics">
                <p className="text-xs font-medium text-muted-foreground mb-2">Key Metrics</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {aiMediaKit.keyMetrics.map((metric: any, idx: number) => (
                    <div key={idx} className="space-y-0.5" data-testid={`metric-${idx}`}>
                      <p className="text-xs text-muted-foreground">{metric.label}</p>
                      <p className="text-sm font-medium">{metric.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {aiMediaKit.audienceDemographics && (
              <div data-testid="section-audience-demographics">
                <p className="text-xs font-medium text-muted-foreground mb-2">Audience Demographics</p>
                <div className="grid grid-cols-2 gap-2">
                  {aiMediaKit.audienceDemographics.ageRange && (
                    <div className="space-y-0.5">
                      <p className="text-xs text-muted-foreground">Age Range</p>
                      <p className="text-sm font-medium" data-testid="text-audience-age">{aiMediaKit.audienceDemographics.ageRange}</p>
                    </div>
                  )}
                  {aiMediaKit.audienceDemographics.gender && (
                    <div className="space-y-0.5">
                      <p className="text-xs text-muted-foreground">Gender</p>
                      <p className="text-sm font-medium" data-testid="text-audience-gender">{aiMediaKit.audienceDemographics.gender}</p>
                    </div>
                  )}
                  {aiMediaKit.audienceDemographics.topCountries && (
                    <div className="space-y-0.5">
                      <p className="text-xs text-muted-foreground">Top Countries</p>
                      <p className="text-sm font-medium" data-testid="text-audience-countries">
                        {Array.isArray(aiMediaKit.audienceDemographics.topCountries)
                          ? aiMediaKit.audienceDemographics.topCountries.join(", ")
                          : aiMediaKit.audienceDemographics.topCountries}
                      </p>
                    </div>
                  )}
                  {aiMediaKit.audienceDemographics.interests && (
                    <div className="space-y-0.5">
                      <p className="text-xs text-muted-foreground">Interests</p>
                      <p className="text-sm font-medium" data-testid="text-audience-interests">
                        {Array.isArray(aiMediaKit.audienceDemographics.interests)
                          ? aiMediaKit.audienceDemographics.interests.join(", ")
                          : aiMediaKit.audienceDemographics.interests}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {aiMediaKit.sponsorshipPackages && aiMediaKit.sponsorshipPackages.length > 0 && (
              <div data-testid="section-sponsorship-packages">
                <p className="text-xs font-medium text-muted-foreground mb-2">Sponsorship Packages</p>
                <div className="space-y-2">
                  {aiMediaKit.sponsorshipPackages.map((pkg: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between gap-2" data-testid={`package-${idx}`}>
                      <div className="min-w-0">
                        <p className="text-sm font-medium" data-testid={`text-package-name-${idx}`}>{pkg.name}</p>
                        {pkg.description && (
                          <p className="text-xs text-muted-foreground">{pkg.description}</p>
                        )}
                      </div>
                      {pkg.price != null && (
                        <span className="text-sm font-semibold text-emerald-400 shrink-0" data-testid={`text-package-price-${idx}`}>
                          ${Number(pkg.price).toLocaleString()}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
  const [aiInsights, setAiInsights] = useState<any>(null);
  const [aiInsightsLoading, setAiInsightsLoading] = useState(false);
  const [aiPLReport, setAiPLReport] = useState<any>(null);
  const [aiPLReportLoading, setAiPLReportLoading] = useState(false);

  const [showMonetizationAI, setShowMonetizationAI] = useState(false);
  const [showBusinessAI, setShowBusinessAI] = useState(false);
  const [aiAdRevenue, setAiAdRevenue] = useState<any>(null);
  const [aiAdRevenueLoading, setAiAdRevenueLoading] = useState(false);
  const [aiAdPlace, setAiAdPlace] = useState<any>(null);
  const [aiAdPlaceLoading, setAiAdPlaceLoading] = useState(false);
  const [aiCPM, setAiCPM] = useState<any>(null);
  const [aiCPMLoading, setAiCPMLoading] = useState(false);
  const [aiSponsorPrice, setAiSponsorPrice] = useState<any>(null);
  const [aiSponsorPriceLoading, setAiSponsorPriceLoading] = useState(false);
  const [aiSponsorOutreach, setAiSponsorOutreach] = useState<any>(null);
  const [aiSponsorOutreachLoading, setAiSponsorOutreachLoading] = useState(false);
  const [aiSponsorNeg, setAiSponsorNeg] = useState<any>(null);
  const [aiSponsorNegLoading, setAiSponsorNegLoading] = useState(false);
  const [aiSponsorDeliv, setAiSponsorDeliv] = useState<any>(null);
  const [aiSponsorDelivLoading, setAiSponsorDelivLoading] = useState(false);
  const [aiAffiliate, setAiAffiliate] = useState<any>(null);
  const [aiAffiliateLoading, setAiAffiliateLoading] = useState(false);
  const [aiMerch, setAiMerch] = useState<any>(null);
  const [aiMerchLoading, setAiMerchLoading] = useState(false);
  const [aiMemberTiers, setAiMemberTiers] = useState<any>(null);
  const [aiMemberTiersLoading, setAiMemberTiersLoading] = useState(false);
  const [aiDigitalProd, setAiDigitalProd] = useState<any>(null);
  const [aiDigitalProdLoading, setAiDigitalProdLoading] = useState(false);
  const [aiCourse, setAiCourse] = useState<any>(null);
  const [aiCourseLoading, setAiCourseLoading] = useState(false);
  const [aiPatreon, setAiPatreon] = useState<any>(null);
  const [aiPatreonLoading, setAiPatreonLoading] = useState(false);
  const [aiSuperChat, setAiSuperChat] = useState<any>(null);
  const [aiSuperChatLoading, setAiSuperChatLoading] = useState(false);
  const [aiMemberGrowth, setAiMemberGrowth] = useState<any>(null);
  const [aiMemberGrowthLoading, setAiMemberGrowthLoading] = useState(false);
  const [aiRevStreams, setAiRevStreams] = useState<any>(null);
  const [aiRevStreamsLoading, setAiRevStreamsLoading] = useState(false);
  const [aiInvoice, setAiInvoice] = useState<any>(null);
  const [aiInvoiceLoading, setAiInvoiceLoading] = useState(false);
  const [aiContract, setAiContract] = useState<any>(null);
  const [aiContractLoading, setAiContractLoading] = useState(false);
  const [aiTaxDeduct, setAiTaxDeduct] = useState<any>(null);
  const [aiTaxDeductLoading, setAiTaxDeductLoading] = useState(false);
  const [aiQuarterlyTax, setAiQuarterlyTax] = useState<any>(null);
  const [aiQuarterlyTaxLoading, setAiQuarterlyTaxLoading] = useState(false);
  const [aiBrandDeal, setAiBrandDeal] = useState<any>(null);
  const [aiBrandDealLoading, setAiBrandDealLoading] = useState(false);
  const [aiMediaKitEnh, setAiMediaKitEnh] = useState<any>(null);
  const [aiMediaKitEnhLoading, setAiMediaKitEnhLoading] = useState(false);
  const [aiRateCard, setAiRateCard] = useState<any>(null);
  const [aiRateCardLoading, setAiRateCardLoading] = useState(false);
  const [aiSponsorROI, setAiSponsorROI] = useState<any>(null);
  const [aiSponsorROILoading, setAiSponsorROILoading] = useState(false);
  const [aiPassiveIncome, setAiPassiveIncome] = useState<any>(null);
  const [aiPassiveIncomeLoading, setAiPassiveIncomeLoading] = useState(false);
  const [aiPricing, setAiPricing] = useState<any>(null);
  const [aiPricingLoading, setAiPricingLoading] = useState(false);
  const [aiRevAttrib, setAiRevAttrib] = useState<any>(null);
  const [aiRevAttribLoading, setAiRevAttribLoading] = useState(false);
  const [aiDonation, setAiDonation] = useState<any>(null);
  const [aiDonationLoading, setAiDonationLoading] = useState(false);
  const [aiCrowdfund, setAiCrowdfund] = useState<any>(null);
  const [aiCrowdfundLoading, setAiCrowdfundLoading] = useState(false);
  const [aiLicensing, setAiLicensing] = useState<any>(null);
  const [aiLicensingLoading, setAiLicensingLoading] = useState(false);
  const [aiBookDeal, setAiBookDeal] = useState<any>(null);
  const [aiBookDealLoading, setAiBookDealLoading] = useState(false);
  const [aiSpeakFees, setAiSpeakFees] = useState<any>(null);
  const [aiSpeakFeesLoading, setAiSpeakFeesLoading] = useState(false);
  const [aiConsulting, setAiConsulting] = useState<any>(null);
  const [aiConsultingLoading, setAiConsultingLoading] = useState(false);
  const [aiExpenseAI, setAiExpenseAI] = useState<any>(null);
  const [aiExpenseAILoading, setAiExpenseAILoading] = useState(false);
  const [aiProfitMargin, setAiProfitMargin] = useState<any>(null);
  const [aiProfitMarginLoading, setAiProfitMarginLoading] = useState(false);
  const [aiCashFlow, setAiCashFlow] = useState<any>(null);
  const [aiCashFlowLoading, setAiCashFlowLoading] = useState(false);
  const [aiPayGateway, setAiPayGateway] = useState<any>(null);
  const [aiPayGatewayLoading, setAiPayGatewayLoading] = useState(false);
  const [aiSubBox, setAiSubBox] = useState<any>(null);
  const [aiSubBoxLoading, setAiSubBoxLoading] = useState(false);
  const [aiNFT, setAiNFT] = useState<any>(null);
  const [aiNFTLoading, setAiNFTLoading] = useState(false);
  const [aiRevGoals, setAiRevGoals] = useState<any>(null);
  const [aiRevGoalsLoading, setAiRevGoalsLoading] = useState(false);

  const [showEcommerceAI, setShowEcommerceAI] = useState(false);
  const [aiSocProof, setAiSocProof] = useState<any>(null);
  const [aiSocProofLoading, setAiSocProofLoading] = useState(false);
  const [aiTestVid, setAiTestVid] = useState<any>(null);
  const [aiTestVidLoading, setAiTestVidLoading] = useState(false);
  const [aiCaseVid, setAiCaseVid] = useState<any>(null);
  const [aiCaseVidLoading, setAiCaseVidLoading] = useState(false);
  const [aiBeforeAfter, setAiBeforeAfter] = useState<any>(null);
  const [aiBeforeAfterLoading, setAiBeforeAfterLoading] = useState(false);
  const [aiInflScore, setAiInflScore] = useState<any>(null);
  const [aiInflScoreLoading, setAiInflScoreLoading] = useState(false);
  const [aiCredibility, setAiCredibility] = useState<any>(null);
  const [aiCredibilityLoading, setAiCredibilityLoading] = useState(false);
  const [aiReviewMgr, setAiReviewMgr] = useState<any>(null);
  const [aiReviewMgrLoading, setAiReviewMgrLoading] = useState(false);
  const [aiRefPage, setAiRefPage] = useState<any>(null);
  const [aiRefPageLoading, setAiRefPageLoading] = useState(false);
  const [aiEcomStore, setAiEcomStore] = useState<any>(null);
  const [aiEcomStoreLoading, setAiEcomStoreLoading] = useState(false);
  const [aiDropship, setAiDropship] = useState<any>(null);
  const [aiDropshipLoading, setAiDropshipLoading] = useState(false);
  const [aiPOD, setAiPOD] = useState<any>(null);
  const [aiPODLoading, setAiPODLoading] = useState(false);
  const [aiDigDownload, setAiDigDownload] = useState<any>(null);
  const [aiDigDownloadLoading, setAiDigDownloadLoading] = useState(false);
  const [aiAffPage, setAiAffPage] = useState<any>(null);
  const [aiAffPageLoading, setAiAffPageLoading] = useState(false);
  const [aiUpsell, setAiUpsell] = useState<any>(null);
  const [aiUpsellLoading, setAiUpsellLoading] = useState(false);
  const [aiCartRecov, setAiCartRecov] = useState<any>(null);
  const [aiCartRecovLoading, setAiCartRecovLoading] = useState(false);
  const [aiCustJourney, setAiCustJourney] = useState<any>(null);
  const [aiCustJourneyLoading, setAiCustJourneyLoading] = useState(false);
  const [aiProdBundle, setAiProdBundle] = useState<any>(null);
  const [aiProdBundleLoading, setAiProdBundleLoading] = useState(false);
  const [aiFlashSale, setAiFlashSale] = useState<any>(null);
  const [aiFlashSaleLoading, setAiFlashSaleLoading] = useState(false);
  const [aiLoyaltyRew, setAiLoyaltyRew] = useState<any>(null);
  const [aiLoyaltyRewLoading, setAiLoyaltyRewLoading] = useState(false);
  const [aiSubModel, setAiSubModel] = useState<any>(null);
  const [aiSubModelLoading, setAiSubModelLoading] = useState(false);
  const [aiPricePg, setAiPricePg] = useState<any>(null);
  const [aiPricePgLoading, setAiPricePgLoading] = useState(false);
  const [aiCheckout, setAiCheckout] = useState<any>(null);
  const [aiCheckoutLoading, setAiCheckoutLoading] = useState(false);
  const [aiInventory, setAiInventory] = useState<any>(null);
  const [aiInventoryLoading, setAiInventoryLoading] = useState(false);
  const [aiShipping, setAiShipping] = useState<any>(null);
  const [aiShippingLoading, setAiShippingLoading] = useState(false);

  useEffect(() => {
    if (activeTab !== "revenue") return;
    const cached = sessionStorage.getItem("aiFinancialInsights");
    if (cached) {
      try { setAiInsights(JSON.parse(cached)); } catch {}
    } else {
      setAiInsightsLoading(true);
      apiRequest("POST", "/api/ai/financial-insights")
        .then(res => res.json())
        .then(data => {
          setAiInsights(data);
          sessionStorage.setItem("aiFinancialInsights", JSON.stringify(data));
        })
        .catch(() => {})
        .finally(() => setAiInsightsLoading(false));
    }
    const cachedPL = sessionStorage.getItem("aiPLReport");
    if (cachedPL) {
      try { setAiPLReport(JSON.parse(cachedPL)); } catch {}
    } else {
      setAiPLReportLoading(true);
      apiRequest("POST", "/api/ai/pl-report", {})
        .then(res => res.json())
        .then(data => {
          setAiPLReport(data);
          sessionStorage.setItem("aiPLReport", JSON.stringify(data));
        })
        .catch(() => {})
        .finally(() => setAiPLReportLoading(false));
    }
  }, [activeTab]);

  useEffect(() => {
    const cached = sessionStorage.getItem("ai_ad_revenue");
    if (cached) { try { setAiAdRevenue(JSON.parse(cached)); return; } catch {} }
    setAiAdRevenueLoading(true);
    apiRequest("POST", "/api/ai/ad-revenue", {}).then(r => r.json()).then(d => { setAiAdRevenue(d); sessionStorage.setItem("ai_ad_revenue", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiAdRevenueLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_ad_place");
    if (cached) { try { setAiAdPlace(JSON.parse(cached)); return; } catch {} }
    setAiAdPlaceLoading(true);
    apiRequest("POST", "/api/ai/ad-placement", {}).then(r => r.json()).then(d => { setAiAdPlace(d); sessionStorage.setItem("ai_ad_place", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiAdPlaceLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_cpm");
    if (cached) { try { setAiCPM(JSON.parse(cached)); return; } catch {} }
    setAiCPMLoading(true);
    apiRequest("POST", "/api/ai/cpm-maximizer", {}).then(r => r.json()).then(d => { setAiCPM(d); sessionStorage.setItem("ai_cpm", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiCPMLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_sponsor_price");
    if (cached) { try { setAiSponsorPrice(JSON.parse(cached)); return; } catch {} }
    setAiSponsorPriceLoading(true);
    apiRequest("POST", "/api/ai/sponsor-pricing", {}).then(r => r.json()).then(d => { setAiSponsorPrice(d); sessionStorage.setItem("ai_sponsor_price", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiSponsorPriceLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_sponsor_outreach");
    if (cached) { try { setAiSponsorOutreach(JSON.parse(cached)); return; } catch {} }
    setAiSponsorOutreachLoading(true);
    apiRequest("POST", "/api/ai/sponsor-outreach", {}).then(r => r.json()).then(d => { setAiSponsorOutreach(d); sessionStorage.setItem("ai_sponsor_outreach", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiSponsorOutreachLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_sponsor_neg");
    if (cached) { try { setAiSponsorNeg(JSON.parse(cached)); return; } catch {} }
    setAiSponsorNegLoading(true);
    apiRequest("POST", "/api/ai/sponsor-negotiation", {}).then(r => r.json()).then(d => { setAiSponsorNeg(d); sessionStorage.setItem("ai_sponsor_neg", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiSponsorNegLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_sponsor_deliv");
    if (cached) { try { setAiSponsorDeliv(JSON.parse(cached)); return; } catch {} }
    setAiSponsorDelivLoading(true);
    apiRequest("POST", "/api/ai/sponsor-deliverables", {}).then(r => r.json()).then(d => { setAiSponsorDeliv(d); sessionStorage.setItem("ai_sponsor_deliv", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiSponsorDelivLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_affiliate");
    if (cached) { try { setAiAffiliate(JSON.parse(cached)); return; } catch {} }
    setAiAffiliateLoading(true);
    apiRequest("POST", "/api/ai/affiliate-optimizer", {}).then(r => r.json()).then(d => { setAiAffiliate(d); sessionStorage.setItem("ai_affiliate", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiAffiliateLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_merch");
    if (cached) { try { setAiMerch(JSON.parse(cached)); return; } catch {} }
    setAiMerchLoading(true);
    apiRequest("POST", "/api/ai/merchandise", {}).then(r => r.json()).then(d => { setAiMerch(d); sessionStorage.setItem("ai_merch", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiMerchLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_member_tiers");
    if (cached) { try { setAiMemberTiers(JSON.parse(cached)); return; } catch {} }
    setAiMemberTiersLoading(true);
    apiRequest("POST", "/api/ai/membership-tiers", {}).then(r => r.json()).then(d => { setAiMemberTiers(d); sessionStorage.setItem("ai_member_tiers", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiMemberTiersLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_digital_prod");
    if (cached) { try { setAiDigitalProd(JSON.parse(cached)); return; } catch {} }
    setAiDigitalProdLoading(true);
    apiRequest("POST", "/api/ai/digital-products", {}).then(r => r.json()).then(d => { setAiDigitalProd(d); sessionStorage.setItem("ai_digital_prod", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiDigitalProdLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_course");
    if (cached) { try { setAiCourse(JSON.parse(cached)); return; } catch {} }
    setAiCourseLoading(true);
    apiRequest("POST", "/api/ai/course-builder", {}).then(r => r.json()).then(d => { setAiCourse(d); sessionStorage.setItem("ai_course", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiCourseLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_patreon");
    if (cached) { try { setAiPatreon(JSON.parse(cached)); return; } catch {} }
    setAiPatreonLoading(true);
    apiRequest("POST", "/api/ai/patreon", {}).then(r => r.json()).then(d => { setAiPatreon(d); sessionStorage.setItem("ai_patreon", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiPatreonLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_super_chat");
    if (cached) { try { setAiSuperChat(JSON.parse(cached)); return; } catch {} }
    setAiSuperChatLoading(true);
    apiRequest("POST", "/api/ai/super-chat", {}).then(r => r.json()).then(d => { setAiSuperChat(d); sessionStorage.setItem("ai_super_chat", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiSuperChatLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_member_growth");
    if (cached) { try { setAiMemberGrowth(JSON.parse(cached)); return; } catch {} }
    setAiMemberGrowthLoading(true);
    apiRequest("POST", "/api/ai/membership-growth", {}).then(r => r.json()).then(d => { setAiMemberGrowth(d); sessionStorage.setItem("ai_member_growth", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiMemberGrowthLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_rev_streams");
    if (cached) { try { setAiRevStreams(JSON.parse(cached)); return; } catch {} }
    setAiRevStreamsLoading(true);
    apiRequest("POST", "/api/ai/revenue-streams", {}).then(r => r.json()).then(d => { setAiRevStreams(d); sessionStorage.setItem("ai_rev_streams", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiRevStreamsLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_invoice");
    if (cached) { try { setAiInvoice(JSON.parse(cached)); return; } catch {} }
    setAiInvoiceLoading(true);
    apiRequest("POST", "/api/ai/invoice", {}).then(r => r.json()).then(d => { setAiInvoice(d); sessionStorage.setItem("ai_invoice", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiInvoiceLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_contract");
    if (cached) { try { setAiContract(JSON.parse(cached)); return; } catch {} }
    setAiContractLoading(true);
    apiRequest("POST", "/api/ai/contract-review", {}).then(r => r.json()).then(d => { setAiContract(d); sessionStorage.setItem("ai_contract", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiContractLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_tax_deduct");
    if (cached) { try { setAiTaxDeduct(JSON.parse(cached)); return; } catch {} }
    setAiTaxDeductLoading(true);
    apiRequest("POST", "/api/ai/tax-deductions", {}).then(r => r.json()).then(d => { setAiTaxDeduct(d); sessionStorage.setItem("ai_tax_deduct", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiTaxDeductLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_quarterly_tax");
    if (cached) { try { setAiQuarterlyTax(JSON.parse(cached)); return; } catch {} }
    setAiQuarterlyTaxLoading(true);
    apiRequest("POST", "/api/ai/quarterly-tax", {}).then(r => r.json()).then(d => { setAiQuarterlyTax(d); sessionStorage.setItem("ai_quarterly_tax", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiQuarterlyTaxLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_brand_deal");
    if (cached) { try { setAiBrandDeal(JSON.parse(cached)); return; } catch {} }
    setAiBrandDealLoading(true);
    apiRequest("POST", "/api/ai/brand-deal", {}).then(r => r.json()).then(d => { setAiBrandDeal(d); sessionStorage.setItem("ai_brand_deal", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiBrandDealLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_media_kit_enh");
    if (cached) { try { setAiMediaKitEnh(JSON.parse(cached)); return; } catch {} }
    setAiMediaKitEnhLoading(true);
    apiRequest("POST", "/api/ai/media-kit-enhance", {}).then(r => r.json()).then(d => { setAiMediaKitEnh(d); sessionStorage.setItem("ai_media_kit_enh", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiMediaKitEnhLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_rate_card");
    if (cached) { try { setAiRateCard(JSON.parse(cached)); return; } catch {} }
    setAiRateCardLoading(true);
    apiRequest("POST", "/api/ai/rate-card", {}).then(r => r.json()).then(d => { setAiRateCard(d); sessionStorage.setItem("ai_rate_card", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiRateCardLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_sponsor_roi");
    if (cached) { try { setAiSponsorROI(JSON.parse(cached)); return; } catch {} }
    setAiSponsorROILoading(true);
    apiRequest("POST", "/api/ai/sponsor-roi", {}).then(r => r.json()).then(d => { setAiSponsorROI(d); sessionStorage.setItem("ai_sponsor_roi", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiSponsorROILoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_passive_income");
    if (cached) { try { setAiPassiveIncome(JSON.parse(cached)); return; } catch {} }
    setAiPassiveIncomeLoading(true);
    apiRequest("POST", "/api/ai/passive-income", {}).then(r => r.json()).then(d => { setAiPassiveIncome(d); sessionStorage.setItem("ai_passive_income", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiPassiveIncomeLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_pricing");
    if (cached) { try { setAiPricing(JSON.parse(cached)); return; } catch {} }
    setAiPricingLoading(true);
    apiRequest("POST", "/api/ai/pricing-strategy", {}).then(r => r.json()).then(d => { setAiPricing(d); sessionStorage.setItem("ai_pricing", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiPricingLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_rev_attrib");
    if (cached) { try { setAiRevAttrib(JSON.parse(cached)); return; } catch {} }
    setAiRevAttribLoading(true);
    apiRequest("POST", "/api/ai/revenue-attribution", {}).then(r => r.json()).then(d => { setAiRevAttrib(d); sessionStorage.setItem("ai_rev_attrib", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiRevAttribLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_donation");
    if (cached) { try { setAiDonation(JSON.parse(cached)); return; } catch {} }
    setAiDonationLoading(true);
    apiRequest("POST", "/api/ai/donation-optimizer", {}).then(r => r.json()).then(d => { setAiDonation(d); sessionStorage.setItem("ai_donation", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiDonationLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_crowdfund");
    if (cached) { try { setAiCrowdfund(JSON.parse(cached)); return; } catch {} }
    setAiCrowdfundLoading(true);
    apiRequest("POST", "/api/ai/crowdfunding", {}).then(r => r.json()).then(d => { setAiCrowdfund(d); sessionStorage.setItem("ai_crowdfund", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiCrowdfundLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_licensing");
    if (cached) { try { setAiLicensing(JSON.parse(cached)); return; } catch {} }
    setAiLicensingLoading(true);
    apiRequest("POST", "/api/ai/licensing", {}).then(r => r.json()).then(d => { setAiLicensing(d); sessionStorage.setItem("ai_licensing", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiLicensingLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_book_deal");
    if (cached) { try { setAiBookDeal(JSON.parse(cached)); return; } catch {} }
    setAiBookDealLoading(true);
    apiRequest("POST", "/api/ai/book-deal", {}).then(r => r.json()).then(d => { setAiBookDeal(d); sessionStorage.setItem("ai_book_deal", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiBookDealLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_speak_fees");
    if (cached) { try { setAiSpeakFees(JSON.parse(cached)); return; } catch {} }
    setAiSpeakFeesLoading(true);
    apiRequest("POST", "/api/ai/speaking-fees", {}).then(r => r.json()).then(d => { setAiSpeakFees(d); sessionStorage.setItem("ai_speak_fees", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiSpeakFeesLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_consulting");
    if (cached) { try { setAiConsulting(JSON.parse(cached)); return; } catch {} }
    setAiConsultingLoading(true);
    apiRequest("POST", "/api/ai/consulting", {}).then(r => r.json()).then(d => { setAiConsulting(d); sessionStorage.setItem("ai_consulting", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiConsultingLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_expense_ai");
    if (cached) { try { setAiExpenseAI(JSON.parse(cached)); return; } catch {} }
    setAiExpenseAILoading(true);
    apiRequest("POST", "/api/ai/expense-tracker-ai", {}).then(r => r.json()).then(d => { setAiExpenseAI(d); sessionStorage.setItem("ai_expense_ai", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiExpenseAILoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_profit_margin");
    if (cached) { try { setAiProfitMargin(JSON.parse(cached)); return; } catch {} }
    setAiProfitMarginLoading(true);
    apiRequest("POST", "/api/ai/profit-margin", {}).then(r => r.json()).then(d => { setAiProfitMargin(d); sessionStorage.setItem("ai_profit_margin", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiProfitMarginLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_cash_flow");
    if (cached) { try { setAiCashFlow(JSON.parse(cached)); return; } catch {} }
    setAiCashFlowLoading(true);
    apiRequest("POST", "/api/ai/cash-flow", {}).then(r => r.json()).then(d => { setAiCashFlow(d); sessionStorage.setItem("ai_cash_flow", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiCashFlowLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_pay_gateway");
    if (cached) { try { setAiPayGateway(JSON.parse(cached)); return; } catch {} }
    setAiPayGatewayLoading(true);
    apiRequest("POST", "/api/ai/payment-gateway", {}).then(r => r.json()).then(d => { setAiPayGateway(d); sessionStorage.setItem("ai_pay_gateway", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiPayGatewayLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_sub_box");
    if (cached) { try { setAiSubBox(JSON.parse(cached)); return; } catch {} }
    setAiSubBoxLoading(true);
    apiRequest("POST", "/api/ai/subscription-box", {}).then(r => r.json()).then(d => { setAiSubBox(d); sessionStorage.setItem("ai_sub_box", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiSubBoxLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_nft");
    if (cached) { try { setAiNFT(JSON.parse(cached)); return; } catch {} }
    setAiNFTLoading(true);
    apiRequest("POST", "/api/ai/nft-advisor", {}).then(r => r.json()).then(d => { setAiNFT(d); sessionStorage.setItem("ai_nft", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiNFTLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_rev_goals");
    if (cached) { try { setAiRevGoals(JSON.parse(cached)); return; } catch {} }
    setAiRevGoalsLoading(true);
    apiRequest("POST", "/api/ai/revenue-goals", {}).then(r => r.json()).then(d => { setAiRevGoals(d); sessionStorage.setItem("ai_rev_goals", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiRevGoalsLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_soc_proof");
    if (cached) { try { setAiSocProof(JSON.parse(cached)); return; } catch {} }
    setAiSocProofLoading(true);
    apiRequest("POST", "/api/ai/social-proof", {}).then(r => r.json()).then(d => { setAiSocProof(d); sessionStorage.setItem("ai_soc_proof", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiSocProofLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_test_vid");
    if (cached) { try { setAiTestVid(JSON.parse(cached)); return; } catch {} }
    setAiTestVidLoading(true);
    apiRequest("POST", "/api/ai/testimonial-video", {}).then(r => r.json()).then(d => { setAiTestVid(d); sessionStorage.setItem("ai_test_vid", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiTestVidLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_case_vid");
    if (cached) { try { setAiCaseVid(JSON.parse(cached)); return; } catch {} }
    setAiCaseVidLoading(true);
    apiRequest("POST", "/api/ai/case-study-video", {}).then(r => r.json()).then(d => { setAiCaseVid(d); sessionStorage.setItem("ai_case_vid", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiCaseVidLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_before_after");
    if (cached) { try { setAiBeforeAfter(JSON.parse(cached)); return; } catch {} }
    setAiBeforeAfterLoading(true);
    apiRequest("POST", "/api/ai/before-after", {}).then(r => r.json()).then(d => { setAiBeforeAfter(d); sessionStorage.setItem("ai_before_after", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiBeforeAfterLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_infl_score");
    if (cached) { try { setAiInflScore(JSON.parse(cached)); return; } catch {} }
    setAiInflScoreLoading(true);
    apiRequest("POST", "/api/ai/influencer-score", {}).then(r => r.json()).then(d => { setAiInflScore(d); sessionStorage.setItem("ai_infl_score", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiInflScoreLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_credibility");
    if (cached) { try { setAiCredibility(JSON.parse(cached)); return; } catch {} }
    setAiCredibilityLoading(true);
    apiRequest("POST", "/api/ai/credibility", {}).then(r => r.json()).then(d => { setAiCredibility(d); sessionStorage.setItem("ai_credibility", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiCredibilityLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_review_mgr");
    if (cached) { try { setAiReviewMgr(JSON.parse(cached)); return; } catch {} }
    setAiReviewMgrLoading(true);
    apiRequest("POST", "/api/ai/review-manager", {}).then(r => r.json()).then(d => { setAiReviewMgr(d); sessionStorage.setItem("ai_review_mgr", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiReviewMgrLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_ref_page");
    if (cached) { try { setAiRefPage(JSON.parse(cached)); return; } catch {} }
    setAiRefPageLoading(true);
    apiRequest("POST", "/api/ai/reference-page", {}).then(r => r.json()).then(d => { setAiRefPage(d); sessionStorage.setItem("ai_ref_page", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiRefPageLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_ecom_store");
    if (cached) { try { setAiEcomStore(JSON.parse(cached)); return; } catch {} }
    setAiEcomStoreLoading(true);
    apiRequest("POST", "/api/ai/ecommerce-store", {}).then(r => r.json()).then(d => { setAiEcomStore(d); sessionStorage.setItem("ai_ecom_store", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiEcomStoreLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_dropship");
    if (cached) { try { setAiDropship(JSON.parse(cached)); return; } catch {} }
    setAiDropshipLoading(true);
    apiRequest("POST", "/api/ai/dropshipping", {}).then(r => r.json()).then(d => { setAiDropship(d); sessionStorage.setItem("ai_dropship", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiDropshipLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_pod");
    if (cached) { try { setAiPOD(JSON.parse(cached)); return; } catch {} }
    setAiPODLoading(true);
    apiRequest("POST", "/api/ai/print-on-demand", {}).then(r => r.json()).then(d => { setAiPOD(d); sessionStorage.setItem("ai_pod", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiPODLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_dig_download");
    if (cached) { try { setAiDigDownload(JSON.parse(cached)); return; } catch {} }
    setAiDigDownloadLoading(true);
    apiRequest("POST", "/api/ai/digital-download", {}).then(r => r.json()).then(d => { setAiDigDownload(d); sessionStorage.setItem("ai_dig_download", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiDigDownloadLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_aff_page");
    if (cached) { try { setAiAffPage(JSON.parse(cached)); return; } catch {} }
    setAiAffPageLoading(true);
    apiRequest("POST", "/api/ai/affiliate-page", {}).then(r => r.json()).then(d => { setAiAffPage(d); sessionStorage.setItem("ai_aff_page", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiAffPageLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_upsell");
    if (cached) { try { setAiUpsell(JSON.parse(cached)); return; } catch {} }
    setAiUpsellLoading(true);
    apiRequest("POST", "/api/ai/upsell", {}).then(r => r.json()).then(d => { setAiUpsell(d); sessionStorage.setItem("ai_upsell", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiUpsellLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_cart_recov");
    if (cached) { try { setAiCartRecov(JSON.parse(cached)); return; } catch {} }
    setAiCartRecovLoading(true);
    apiRequest("POST", "/api/ai/cart-recovery", {}).then(r => r.json()).then(d => { setAiCartRecov(d); sessionStorage.setItem("ai_cart_recov", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiCartRecovLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_cust_journey");
    if (cached) { try { setAiCustJourney(JSON.parse(cached)); return; } catch {} }
    setAiCustJourneyLoading(true);
    apiRequest("POST", "/api/ai/customer-journey", {}).then(r => r.json()).then(d => { setAiCustJourney(d); sessionStorage.setItem("ai_cust_journey", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiCustJourneyLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_prod_bundle");
    if (cached) { try { setAiProdBundle(JSON.parse(cached)); return; } catch {} }
    setAiProdBundleLoading(true);
    apiRequest("POST", "/api/ai/product-bundle", {}).then(r => r.json()).then(d => { setAiProdBundle(d); sessionStorage.setItem("ai_prod_bundle", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiProdBundleLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_flash_sale");
    if (cached) { try { setAiFlashSale(JSON.parse(cached)); return; } catch {} }
    setAiFlashSaleLoading(true);
    apiRequest("POST", "/api/ai/flash-sale", {}).then(r => r.json()).then(d => { setAiFlashSale(d); sessionStorage.setItem("ai_flash_sale", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiFlashSaleLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_loyalty_rew");
    if (cached) { try { setAiLoyaltyRew(JSON.parse(cached)); return; } catch {} }
    setAiLoyaltyRewLoading(true);
    apiRequest("POST", "/api/ai/loyalty-rewards", {}).then(r => r.json()).then(d => { setAiLoyaltyRew(d); sessionStorage.setItem("ai_loyalty_rew", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiLoyaltyRewLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_sub_model");
    if (cached) { try { setAiSubModel(JSON.parse(cached)); return; } catch {} }
    setAiSubModelLoading(true);
    apiRequest("POST", "/api/ai/subscription-model", {}).then(r => r.json()).then(d => { setAiSubModel(d); sessionStorage.setItem("ai_sub_model", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiSubModelLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_price_pg");
    if (cached) { try { setAiPricePg(JSON.parse(cached)); return; } catch {} }
    setAiPricePgLoading(true);
    apiRequest("POST", "/api/ai/pricing-page", {}).then(r => r.json()).then(d => { setAiPricePg(d); sessionStorage.setItem("ai_price_pg", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiPricePgLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_checkout");
    if (cached) { try { setAiCheckout(JSON.parse(cached)); return; } catch {} }
    setAiCheckoutLoading(true);
    apiRequest("POST", "/api/ai/checkout", {}).then(r => r.json()).then(d => { setAiCheckout(d); sessionStorage.setItem("ai_checkout", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiCheckoutLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_inventory");
    if (cached) { try { setAiInventory(JSON.parse(cached)); return; } catch {} }
    setAiInventoryLoading(true);
    apiRequest("POST", "/api/ai/inventory", {}).then(r => r.json()).then(d => { setAiInventory(d); sessionStorage.setItem("ai_inventory", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiInventoryLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_shipping");
    if (cached) { try { setAiShipping(JSON.parse(cached)); return; } catch {} }
    setAiShippingLoading(true);
    apiRequest("POST", "/api/ai/shipping", {}).then(r => r.json()).then(d => { setAiShipping(d); sessionStorage.setItem("ai_shipping", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiShippingLoading(false));
  }, []);

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

  const renderMoneyAIList = (arr: any[] | undefined, limit = 5) => {
    if (!arr || !Array.isArray(arr) || arr.length === 0) return null;
    return arr.slice(0, limit).map((item: any, i: number) => (
      <p key={i}>{typeof item === "string" ? item : item.title || item.name || item.description || item.text || item.label || JSON.stringify(item)}</p>
    ));
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

          {aiInsightsLoading && (
            <Card data-testid="card-ai-financial-insights-loading">
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  <Skeleton className="h-5 w-48" />
                </div>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Skeleton className="h-16 rounded-md" />
                  <Skeleton className="h-16 rounded-md" />
                  <Skeleton className="h-16 rounded-md" />
                </div>
              </CardContent>
            </Card>
          )}

          {aiInsights && !aiInsightsLoading && (
            <Card data-testid="card-ai-financial-insights">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <CardTitle className="text-base">AI Financial Insights</CardTitle>
                  </div>
                  {aiInsights.healthScore != null && (
                    <Badge
                      variant="secondary"
                      className={`no-default-hover-elevate no-default-active-elevate ${
                        aiInsights.healthScore >= 80 ? "bg-emerald-500/10 text-emerald-500" :
                        aiInsights.healthScore >= 50 ? "bg-amber-500/10 text-amber-500" :
                        "bg-red-500/10 text-red-500"
                      }`}
                      data-testid="badge-health-score"
                    >
                      Health Score: {aiInsights.healthScore}/100
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {aiInsights.summary && (
                  <p className="text-sm text-muted-foreground" data-testid="text-ai-summary">
                    {aiInsights.summary}
                  </p>
                )}

                {aiInsights.insights && aiInsights.insights.length > 0 && (
                  <div className="space-y-2" data-testid="list-ai-insights">
                    {aiInsights.insights.map((insight: any, idx: number) => {
                      const typeColor = insight.type === "positive" ? "bg-emerald-500/10 text-emerald-500" :
                        insight.type === "warning" ? "bg-amber-500/10 text-amber-500" :
                        "bg-purple-500/10 text-purple-500";
                      return (
                        <div key={idx} className="flex items-start gap-3" data-testid={`insight-item-${idx}`}>
                          <Badge
                            variant="secondary"
                            className={`text-xs capitalize shrink-0 mt-0.5 no-default-hover-elevate no-default-active-elevate ${typeColor}`}
                            data-testid={`badge-insight-type-${idx}`}
                          >
                            {insight.type}
                          </Badge>
                          <div className="min-w-0">
                            <p className="text-sm font-medium" data-testid={`text-insight-title-${idx}`}>{insight.title}</p>
                            <p className="text-xs text-muted-foreground" data-testid={`text-insight-desc-${idx}`}>{insight.description}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {aiInsights.forecast && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" data-testid="section-forecast">
                    {aiInsights.forecast.nextMonth != null && (
                      <div className="space-y-0.5">
                        <p className="text-xs text-muted-foreground">Next Month</p>
                        <p className="text-sm font-medium" data-testid="text-forecast-next-month">
                          ${Number(aiInsights.forecast.nextMonth).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                    )}
                    {aiInsights.forecast.nextQuarter != null && (
                      <div className="space-y-0.5">
                        <p className="text-xs text-muted-foreground">Next Quarter</p>
                        <p className="text-sm font-medium" data-testid="text-forecast-next-quarter">
                          ${Number(aiInsights.forecast.nextQuarter).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                    )}
                    {aiInsights.forecast.yearEnd != null && (
                      <div className="space-y-0.5">
                        <p className="text-xs text-muted-foreground">Year End</p>
                        <p className="text-sm font-medium" data-testid="text-forecast-year-end">
                          ${Number(aiInsights.forecast.yearEnd).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {aiInsights.recommendations && aiInsights.recommendations.length > 0 && (
                  <div className="space-y-1" data-testid="list-recommendations">
                    <p className="text-xs font-medium text-muted-foreground">Recommendations</p>
                    {aiInsights.recommendations.map((rec: string, idx: number) => (
                      <div key={idx} className="flex items-start gap-2" data-testid={`recommendation-item-${idx}`}>
                        <CheckCircle2 className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
                        <p className="text-sm text-muted-foreground">{rec}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {aiPLReportLoading && (
            <Card data-testid="card-ai-pl-report-loading">
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  <Skeleton className="h-5 w-40" />
                </div>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Skeleton className="h-16 rounded-md" />
                  <Skeleton className="h-16 rounded-md" />
                  <Skeleton className="h-16 rounded-md" />
                </div>
              </CardContent>
            </Card>
          )}

          {aiPLReport && !aiPLReportLoading && (
            <Card data-testid="card-ai-pl-report">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <CardTitle className="text-base">AI P&L Report</CardTitle>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {aiPLReport.healthGrade && (
                      <Badge
                        variant="secondary"
                        className={`no-default-hover-elevate no-default-active-elevate ${
                          ["A", "A+", "A-"].includes(aiPLReport.healthGrade) ? "bg-emerald-500/10 text-emerald-500" :
                          ["B", "B+", "B-"].includes(aiPLReport.healthGrade) ? "bg-blue-500/10 text-blue-500" :
                          ["C", "C+", "C-"].includes(aiPLReport.healthGrade) ? "bg-amber-500/10 text-amber-500" :
                          "bg-red-500/10 text-red-500"
                        }`}
                        data-testid="badge-health-grade"
                      >
                        Grade: {aiPLReport.healthGrade}
                      </Badge>
                    )}
                    <Badge variant="secondary" className="no-default-hover-elevate no-default-active-elevate" data-testid="badge-ai-pl-auto">
                      Auto-generated
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {aiPLReport.executiveSummary && (
                  <p className="text-sm text-muted-foreground" data-testid="text-pl-executive-summary">
                    {aiPLReport.executiveSummary}
                  </p>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {aiPLReport.profitMargin != null && (
                    <div className="space-y-0.5" data-testid="section-profit-margin">
                      <p className="text-xs text-muted-foreground">Profit Margin</p>
                      <p className={`text-sm font-semibold ${Number(aiPLReport.profitMargin) >= 0 ? "text-emerald-400" : "text-red-400"}`} data-testid="text-profit-margin">
                        {Number(aiPLReport.profitMargin).toFixed(1)}%
                      </p>
                    </div>
                  )}
                  {aiPLReport.topRevenueStream && (
                    <div className="space-y-0.5" data-testid="section-top-revenue">
                      <p className="text-xs text-muted-foreground">Top Revenue Stream</p>
                      <p className="text-sm font-medium" data-testid="text-top-revenue-stream">{aiPLReport.topRevenueStream}</p>
                    </div>
                  )}
                  {aiPLReport.biggestExpense && (
                    <div className="space-y-0.5" data-testid="section-biggest-expense">
                      <p className="text-xs text-muted-foreground">Biggest Expense</p>
                      <p className="text-sm font-medium" data-testid="text-biggest-expense">{aiPLReport.biggestExpense}</p>
                    </div>
                  )}
                </div>

                {aiPLReport.costCuttingOpportunities && aiPLReport.costCuttingOpportunities.length > 0 && (
                  <div data-testid="section-cost-cutting">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Cost Cutting Opportunities</p>
                    <div className="space-y-1">
                      {aiPLReport.costCuttingOpportunities.map((item: string, idx: number) => (
                        <div key={idx} className="flex items-start gap-2" data-testid={`cost-cutting-${idx}`}>
                          <AlertTriangle className="h-3 w-3 text-amber-400 shrink-0 mt-0.5" />
                          <p className="text-sm text-muted-foreground">{item}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {aiPLReport.growthOpportunities && aiPLReport.growthOpportunities.length > 0 && (
                  <div data-testid="section-growth-opportunities">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Growth Opportunities</p>
                    <div className="space-y-1">
                      {aiPLReport.growthOpportunities.map((item: string, idx: number) => (
                        <div key={idx} className="flex items-start gap-2" data-testid={`growth-opportunity-${idx}`}>
                          <TrendingUp className="h-3 w-3 text-emerald-400 shrink-0 mt-0.5" />
                          <p className="text-sm text-muted-foreground">{item}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {aiPLReport.quarterlyProjection && (
                  <div data-testid="section-quarterly-projection">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Quarterly Projection</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {aiPLReport.quarterlyProjection.q1 != null && (
                        <div className="space-y-0.5">
                          <p className="text-xs text-muted-foreground">Q1</p>
                          <p className="text-sm font-medium" data-testid="text-projection-q1">${Number(aiPLReport.quarterlyProjection.q1).toLocaleString()}</p>
                        </div>
                      )}
                      {aiPLReport.quarterlyProjection.q2 != null && (
                        <div className="space-y-0.5">
                          <p className="text-xs text-muted-foreground">Q2</p>
                          <p className="text-sm font-medium" data-testid="text-projection-q2">${Number(aiPLReport.quarterlyProjection.q2).toLocaleString()}</p>
                        </div>
                      )}
                      {aiPLReport.quarterlyProjection.q3 != null && (
                        <div className="space-y-0.5">
                          <p className="text-xs text-muted-foreground">Q3</p>
                          <p className="text-sm font-medium" data-testid="text-projection-q3">${Number(aiPLReport.quarterlyProjection.q3).toLocaleString()}</p>
                        </div>
                      )}
                      {aiPLReport.quarterlyProjection.q4 != null && (
                        <div className="space-y-0.5">
                          <p className="text-xs text-muted-foreground">Q4</p>
                          <p className="text-sm font-medium" data-testid="text-projection-q4">${Number(aiPLReport.quarterlyProjection.q4).toLocaleString()}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

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

      <div className="border rounded-md overflow-visible">
        <button
          className="flex items-center gap-2 w-full p-4 text-left"
          onClick={() => setShowMonetizationAI(!showMonetizationAI)}
          data-testid="button-toggle-monetization-ai"
        >
          <Sparkles className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-semibold">AI Monetization Engine</span>
          <Badge variant="outline" className="text-[10px]">20 tools</Badge>
          {showMonetizationAI ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showMonetizationAI && (
          <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(aiAdRevenueLoading || aiAdRevenue) && (
              <Card data-testid="card-ai-ad-revenue">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Ad Revenue</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiAdRevenueLoading ? <Skeleton className="h-24 w-full" /> : aiAdRevenue && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiAdRevenue.strategies || aiAdRevenue.tips || aiAdRevenue.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiAdPlaceLoading || aiAdPlace) && (
              <Card data-testid="card-ai-ad-place">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Ad Placement</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiAdPlaceLoading ? <Skeleton className="h-24 w-full" /> : aiAdPlace && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiAdPlace.placements || aiAdPlace.tips || aiAdPlace.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCPMLoading || aiCPM) && (
              <Card data-testid="card-ai-cpm">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI CPM Maximizer</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCPMLoading ? <Skeleton className="h-24 w-full" /> : aiCPM && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiCPM.strategies || aiCPM.tips || aiCPM.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiSponsorPriceLoading || aiSponsorPrice) && (
              <Card data-testid="card-ai-sponsor-price">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Sponsor Pricing</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiSponsorPriceLoading ? <Skeleton className="h-24 w-full" /> : aiSponsorPrice && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiSponsorPrice.pricing || aiSponsorPrice.rates || aiSponsorPrice.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiSponsorOutreachLoading || aiSponsorOutreach) && (
              <Card data-testid="card-ai-sponsor-outreach">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Sponsor Outreach</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiSponsorOutreachLoading ? <Skeleton className="h-24 w-full" /> : aiSponsorOutreach && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiSponsorOutreach.templates || aiSponsorOutreach.emails || aiSponsorOutreach.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiSponsorNegLoading || aiSponsorNeg) && (
              <Card data-testid="card-ai-sponsor-neg">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Sponsor Negotiation</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiSponsorNegLoading ? <Skeleton className="h-24 w-full" /> : aiSponsorNeg && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiSponsorNeg.tactics || aiSponsorNeg.tips || aiSponsorNeg.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiSponsorDelivLoading || aiSponsorDeliv) && (
              <Card data-testid="card-ai-sponsor-deliv">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Sponsor Deliverables</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiSponsorDelivLoading ? <Skeleton className="h-24 w-full" /> : aiSponsorDeliv && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiSponsorDeliv.deliverables || aiSponsorDeliv.checklist || aiSponsorDeliv.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiAffiliateLoading || aiAffiliate) && (
              <Card data-testid="card-ai-affiliate">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Affiliate Optimizer</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiAffiliateLoading ? <Skeleton className="h-24 w-full" /> : aiAffiliate && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiAffiliate.programs || aiAffiliate.strategies || aiAffiliate.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiMerchLoading || aiMerch) && (
              <Card data-testid="card-ai-merch">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Merchandise</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiMerchLoading ? <Skeleton className="h-24 w-full" /> : aiMerch && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiMerch.products || aiMerch.ideas || aiMerch.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiMemberTiersLoading || aiMemberTiers) && (
              <Card data-testid="card-ai-member-tiers">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Membership Tiers</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiMemberTiersLoading ? <Skeleton className="h-24 w-full" /> : aiMemberTiers && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiMemberTiers.tiers || aiMemberTiers.plans || aiMemberTiers.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiDigitalProdLoading || aiDigitalProd) && (
              <Card data-testid="card-ai-digital-prod">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Digital Products</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiDigitalProdLoading ? <Skeleton className="h-24 w-full" /> : aiDigitalProd && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiDigitalProd.products || aiDigitalProd.ideas || aiDigitalProd.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCourseLoading || aiCourse) && (
              <Card data-testid="card-ai-course">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Course Builder</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCourseLoading ? <Skeleton className="h-24 w-full" /> : aiCourse && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiCourse.modules || aiCourse.outline || aiCourse.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiPatreonLoading || aiPatreon) && (
              <Card data-testid="card-ai-patreon">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Patreon Optimizer</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiPatreonLoading ? <Skeleton className="h-24 w-full" /> : aiPatreon && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiPatreon.tiers || aiPatreon.strategies || aiPatreon.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiSuperChatLoading || aiSuperChat) && (
              <Card data-testid="card-ai-super-chat">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Super Chat</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiSuperChatLoading ? <Skeleton className="h-24 w-full" /> : aiSuperChat && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiSuperChat.strategies || aiSuperChat.tips || aiSuperChat.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiMemberGrowthLoading || aiMemberGrowth) && (
              <Card data-testid="card-ai-member-growth">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Membership Growth</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiMemberGrowthLoading ? <Skeleton className="h-24 w-full" /> : aiMemberGrowth && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiMemberGrowth.strategies || aiMemberGrowth.tactics || aiMemberGrowth.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiRevStreamsLoading || aiRevStreams) && (
              <Card data-testid="card-ai-rev-streams">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Revenue Streams</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiRevStreamsLoading ? <Skeleton className="h-24 w-full" /> : aiRevStreams && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiRevStreams.streams || aiRevStreams.ideas || aiRevStreams.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiInvoiceLoading || aiInvoice) && (
              <Card data-testid="card-ai-invoice">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Invoice Generator</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiInvoiceLoading ? <Skeleton className="h-24 w-full" /> : aiInvoice && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiInvoice.templates || aiInvoice.tips || aiInvoice.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiContractLoading || aiContract) && (
              <Card data-testid="card-ai-contract">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Contract Review</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiContractLoading ? <Skeleton className="h-24 w-full" /> : aiContract && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiContract.clauses || aiContract.flags || aiContract.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiTaxDeductLoading || aiTaxDeduct) && (
              <Card data-testid="card-ai-tax-deduct">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Tax Deductions</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiTaxDeductLoading ? <Skeleton className="h-24 w-full" /> : aiTaxDeduct && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiTaxDeduct.deductions || aiTaxDeduct.categories || aiTaxDeduct.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiQuarterlyTaxLoading || aiQuarterlyTax) && (
              <Card data-testid="card-ai-quarterly-tax">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Quarterly Tax</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiQuarterlyTaxLoading ? <Skeleton className="h-24 w-full" /> : aiQuarterlyTax && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiQuarterlyTax.estimates || aiQuarterlyTax.schedule || aiQuarterlyTax.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>

      <div className="border rounded-md overflow-visible">
        <button
          className="flex items-center gap-2 w-full p-4 text-left"
          onClick={() => setShowBusinessAI(!showBusinessAI)}
          data-testid="button-toggle-business-ai"
        >
          <Sparkles className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-semibold">AI Business & Revenue Suite</span>
          <Badge variant="outline" className="text-[10px]">20 tools</Badge>
          {showBusinessAI ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showBusinessAI && (
          <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(aiBrandDealLoading || aiBrandDeal) && (
              <Card data-testid="card-ai-brand-deal">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Brand Deal</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiBrandDealLoading ? <Skeleton className="h-24 w-full" /> : aiBrandDeal && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiBrandDeal.evaluation || aiBrandDeal.deals || aiBrandDeal.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiMediaKitEnhLoading || aiMediaKitEnh) && (
              <Card data-testid="card-ai-media-kit-enh">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Media Kit Enhance</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiMediaKitEnhLoading ? <Skeleton className="h-24 w-full" /> : aiMediaKitEnh && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiMediaKitEnh.sections || aiMediaKitEnh.improvements || aiMediaKitEnh.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiRateCardLoading || aiRateCard) && (
              <Card data-testid="card-ai-rate-card">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Rate Card</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiRateCardLoading ? <Skeleton className="h-24 w-full" /> : aiRateCard && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiRateCard.rates || aiRateCard.packages || aiRateCard.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiSponsorROILoading || aiSponsorROI) && (
              <Card data-testid="card-ai-sponsor-roi">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Sponsor ROI</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiSponsorROILoading ? <Skeleton className="h-24 w-full" /> : aiSponsorROI && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiSponsorROI.metrics || aiSponsorROI.analysis || aiSponsorROI.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiPassiveIncomeLoading || aiPassiveIncome) && (
              <Card data-testid="card-ai-passive-income">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Passive Income</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiPassiveIncomeLoading ? <Skeleton className="h-24 w-full" /> : aiPassiveIncome && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiPassiveIncome.streams || aiPassiveIncome.ideas || aiPassiveIncome.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiPricingLoading || aiPricing) && (
              <Card data-testid="card-ai-pricing">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Pricing Strategy</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiPricingLoading ? <Skeleton className="h-24 w-full" /> : aiPricing && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiPricing.strategies || aiPricing.models || aiPricing.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiRevAttribLoading || aiRevAttrib) && (
              <Card data-testid="card-ai-rev-attrib">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Revenue Attribution</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiRevAttribLoading ? <Skeleton className="h-24 w-full" /> : aiRevAttrib && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiRevAttrib.sources || aiRevAttrib.attribution || aiRevAttrib.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiDonationLoading || aiDonation) && (
              <Card data-testid="card-ai-donation">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Donation Optimizer</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiDonationLoading ? <Skeleton className="h-24 w-full" /> : aiDonation && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiDonation.strategies || aiDonation.platforms || aiDonation.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCrowdfundLoading || aiCrowdfund) && (
              <Card data-testid="card-ai-crowdfund">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Crowdfunding</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCrowdfundLoading ? <Skeleton className="h-24 w-full" /> : aiCrowdfund && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiCrowdfund.campaigns || aiCrowdfund.strategies || aiCrowdfund.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiLicensingLoading || aiLicensing) && (
              <Card data-testid="card-ai-licensing">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Licensing</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiLicensingLoading ? <Skeleton className="h-24 w-full" /> : aiLicensing && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiLicensing.opportunities || aiLicensing.deals || aiLicensing.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiBookDealLoading || aiBookDeal) && (
              <Card data-testid="card-ai-book-deal">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Book Deal</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiBookDealLoading ? <Skeleton className="h-24 w-full" /> : aiBookDeal && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiBookDeal.proposals || aiBookDeal.publishers || aiBookDeal.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiSpeakFeesLoading || aiSpeakFees) && (
              <Card data-testid="card-ai-speak-fees">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Speaking Fees</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiSpeakFeesLoading ? <Skeleton className="h-24 w-full" /> : aiSpeakFees && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiSpeakFees.rates || aiSpeakFees.tiers || aiSpeakFees.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiConsultingLoading || aiConsulting) && (
              <Card data-testid="card-ai-consulting">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Consulting</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiConsultingLoading ? <Skeleton className="h-24 w-full" /> : aiConsulting && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiConsulting.packages || aiConsulting.services || aiConsulting.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiExpenseAILoading || aiExpenseAI) && (
              <Card data-testid="card-ai-expense-ai">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Expense Tracker</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiExpenseAILoading ? <Skeleton className="h-24 w-full" /> : aiExpenseAI && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiExpenseAI.insights || aiExpenseAI.categories || aiExpenseAI.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiProfitMarginLoading || aiProfitMargin) && (
              <Card data-testid="card-ai-profit-margin">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Profit Margin</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiProfitMarginLoading ? <Skeleton className="h-24 w-full" /> : aiProfitMargin && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiProfitMargin.analysis || aiProfitMargin.margins || aiProfitMargin.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCashFlowLoading || aiCashFlow) && (
              <Card data-testid="card-ai-cash-flow">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Cash Flow</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCashFlowLoading ? <Skeleton className="h-24 w-full" /> : aiCashFlow && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiCashFlow.forecast || aiCashFlow.projections || aiCashFlow.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiPayGatewayLoading || aiPayGateway) && (
              <Card data-testid="card-ai-pay-gateway">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Payment Gateway</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiPayGatewayLoading ? <Skeleton className="h-24 w-full" /> : aiPayGateway && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiPayGateway.gateways || aiPayGateway.comparison || aiPayGateway.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiSubBoxLoading || aiSubBox) && (
              <Card data-testid="card-ai-sub-box">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Subscription Box</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiSubBoxLoading ? <Skeleton className="h-24 w-full" /> : aiSubBox && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiSubBox.concepts || aiSubBox.items || aiSubBox.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiNFTLoading || aiNFT) && (
              <Card data-testid="card-ai-nft">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI NFT Advisor</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiNFTLoading ? <Skeleton className="h-24 w-full" /> : aiNFT && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiNFT.strategies || aiNFT.collections || aiNFT.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiRevGoalsLoading || aiRevGoals) && (
              <Card data-testid="card-ai-rev-goals">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Revenue Goals</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiRevGoalsLoading ? <Skeleton className="h-24 w-full" /> : aiRevGoals && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiRevGoals.goals || aiRevGoals.milestones || aiRevGoals.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>

      <div className="border rounded-md overflow-visible">
        <button
          className="flex items-center gap-2 w-full p-4 text-left"
          onClick={() => setShowEcommerceAI(!showEcommerceAI)}
          data-testid="button-toggle-ecommerce-ai"
        >
          <Sparkles className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-semibold">AI Social Proof & Ecommerce Suite</span>
          <Badge variant="outline" className="text-[10px]">24 tools</Badge>
          {showEcommerceAI ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showEcommerceAI && (
          <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(aiSocProofLoading || aiSocProof) && (
              <Card data-testid="card-ai-soc-proof">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Social Proof</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiSocProofLoading ? <Skeleton className="h-24 w-full" /> : aiSocProof && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiSocProof.elements || aiSocProof.strategies || aiSocProof.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiTestVidLoading || aiTestVid) && (
              <Card data-testid="card-ai-test-vid">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Testimonial Video</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiTestVidLoading ? <Skeleton className="h-24 w-full" /> : aiTestVid && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiTestVid.scripts || aiTestVid.templates || aiTestVid.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCaseVidLoading || aiCaseVid) && (
              <Card data-testid="card-ai-case-vid">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Case Study Video</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCaseVidLoading ? <Skeleton className="h-24 w-full" /> : aiCaseVid && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiCaseVid.studies || aiCaseVid.templates || aiCaseVid.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiBeforeAfterLoading || aiBeforeAfter) && (
              <Card data-testid="card-ai-before-after">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Before & After</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiBeforeAfterLoading ? <Skeleton className="h-24 w-full" /> : aiBeforeAfter && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiBeforeAfter.comparisons || aiBeforeAfter.templates || aiBeforeAfter.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiInflScoreLoading || aiInflScore) && (
              <Card data-testid="card-ai-infl-score">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Influencer Score</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiInflScoreLoading ? <Skeleton className="h-24 w-full" /> : aiInflScore && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiInflScore.scores || aiInflScore.metrics || aiInflScore.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCredibilityLoading || aiCredibility) && (
              <Card data-testid="card-ai-credibility">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Credibility</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCredibilityLoading ? <Skeleton className="h-24 w-full" /> : aiCredibility && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiCredibility.factors || aiCredibility.tips || aiCredibility.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiReviewMgrLoading || aiReviewMgr) && (
              <Card data-testid="card-ai-review-mgr">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Review Manager</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiReviewMgrLoading ? <Skeleton className="h-24 w-full" /> : aiReviewMgr && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiReviewMgr.reviews || aiReviewMgr.responses || aiReviewMgr.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiRefPageLoading || aiRefPage) && (
              <Card data-testid="card-ai-ref-page">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Reference Page</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiRefPageLoading ? <Skeleton className="h-24 w-full" /> : aiRefPage && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiRefPage.references || aiRefPage.layout || aiRefPage.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiEcomStoreLoading || aiEcomStore) && (
              <Card data-testid="card-ai-ecom-store">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Ecommerce Store</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiEcomStoreLoading ? <Skeleton className="h-24 w-full" /> : aiEcomStore && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiEcomStore.setup || aiEcomStore.products || aiEcomStore.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiDropshipLoading || aiDropship) && (
              <Card data-testid="card-ai-dropship">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Dropshipping</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiDropshipLoading ? <Skeleton className="h-24 w-full" /> : aiDropship && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiDropship.products || aiDropship.suppliers || aiDropship.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiPODLoading || aiPOD) && (
              <Card data-testid="card-ai-pod">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Print on Demand</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiPODLoading ? <Skeleton className="h-24 w-full" /> : aiPOD && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiPOD.designs || aiPOD.products || aiPOD.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiDigDownloadLoading || aiDigDownload) && (
              <Card data-testid="card-ai-dig-download">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Digital Download</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiDigDownloadLoading ? <Skeleton className="h-24 w-full" /> : aiDigDownload && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiDigDownload.products || aiDigDownload.ideas || aiDigDownload.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiAffPageLoading || aiAffPage) && (
              <Card data-testid="card-ai-aff-page">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Affiliate Page</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiAffPageLoading ? <Skeleton className="h-24 w-full" /> : aiAffPage && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiAffPage.programs || aiAffPage.links || aiAffPage.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiUpsellLoading || aiUpsell) && (
              <Card data-testid="card-ai-upsell">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Upsell</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiUpsellLoading ? <Skeleton className="h-24 w-full" /> : aiUpsell && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiUpsell.strategies || aiUpsell.offers || aiUpsell.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCartRecovLoading || aiCartRecov) && (
              <Card data-testid="card-ai-cart-recov">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Cart Recovery</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCartRecovLoading ? <Skeleton className="h-24 w-full" /> : aiCartRecov && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiCartRecov.emails || aiCartRecov.strategies || aiCartRecov.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCustJourneyLoading || aiCustJourney) && (
              <Card data-testid="card-ai-cust-journey">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Customer Journey</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCustJourneyLoading ? <Skeleton className="h-24 w-full" /> : aiCustJourney && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiCustJourney.stages || aiCustJourney.touchpoints || aiCustJourney.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiProdBundleLoading || aiProdBundle) && (
              <Card data-testid="card-ai-prod-bundle">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Product Bundle</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiProdBundleLoading ? <Skeleton className="h-24 w-full" /> : aiProdBundle && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiProdBundle.bundles || aiProdBundle.combos || aiProdBundle.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiFlashSaleLoading || aiFlashSale) && (
              <Card data-testid="card-ai-flash-sale">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Flash Sale</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiFlashSaleLoading ? <Skeleton className="h-24 w-full" /> : aiFlashSale && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiFlashSale.campaigns || aiFlashSale.deals || aiFlashSale.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiLoyaltyRewLoading || aiLoyaltyRew) && (
              <Card data-testid="card-ai-loyalty-rew">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Loyalty Rewards</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiLoyaltyRewLoading ? <Skeleton className="h-24 w-full" /> : aiLoyaltyRew && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiLoyaltyRew.programs || aiLoyaltyRew.tiers || aiLoyaltyRew.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiSubModelLoading || aiSubModel) && (
              <Card data-testid="card-ai-sub-model">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Subscription Model</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiSubModelLoading ? <Skeleton className="h-24 w-full" /> : aiSubModel && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiSubModel.models || aiSubModel.tiers || aiSubModel.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiPricePgLoading || aiPricePg) && (
              <Card data-testid="card-ai-price-pg">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Pricing Page</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiPricePgLoading ? <Skeleton className="h-24 w-full" /> : aiPricePg && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiPricePg.strategies || aiPricePg.tiers || aiPricePg.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCheckoutLoading || aiCheckout) && (
              <Card data-testid="card-ai-checkout">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Checkout</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCheckoutLoading ? <Skeleton className="h-24 w-full" /> : aiCheckout && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiCheckout.optimizations || aiCheckout.flow || aiCheckout.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiInventoryLoading || aiInventory) && (
              <Card data-testid="card-ai-inventory">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Inventory</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiInventoryLoading ? <Skeleton className="h-24 w-full" /> : aiInventory && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiInventory.tracking || aiInventory.alerts || aiInventory.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiShippingLoading || aiShipping) && (
              <Card data-testid="card-ai-shipping">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Shipping</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiShippingLoading ? <Skeleton className="h-24 w-full" /> : aiShipping && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderMoneyAIList(aiShipping.options || aiShipping.rates || aiShipping.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
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