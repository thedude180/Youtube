import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { safeArray } from "@/lib/safe-data";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DollarSign, Plus, TrendingUp, Briefcase } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { EmptyState } from "@/components/EmptyState";
import { QueryErrorReset } from "@/components/QueryErrorReset";
import { useState } from "react";

const ventureTypes = ["All", "Merch", "Courses", "Membership", "Affiliate", "Consulting", "Podcast", "SaaS", "Events", "Licensing"] as const;

const ventureStatusColors: Record<string, string> = {
  planning: "bg-yellow-500/10 text-yellow-500",
  active: "bg-emerald-500/10 text-emerald-500",
  paused: "bg-muted-foreground/10 text-muted-foreground",
  completed: "bg-blue-500/10 text-blue-500",
};

export default function VenturesTab() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState("All");

  const { data: rawVentures, isLoading, error } = useQuery<any[]>({ queryKey: ['/api/ventures'], refetchInterval: 30_000, staleTime: 20_000 });
  const ventures = safeArray(rawVentures);

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

  const filtered = ventures.filter((v: any) =>
    activeFilter === "All" ? true : v.type?.toLowerCase() === activeFilter.toLowerCase()
  );

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="flex gap-2 flex-wrap">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-20 rounded-full" />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error) return <QueryErrorReset error={error} queryKey={["/api/ventures"]} label="Failed to load ventures" />;

  return (
    <div className="space-y-3">
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

      {filtered.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={Briefcase}
              title="Launch your first venture"
              description="Track creator business ventures - merch, courses, consulting, memberships, and more."
              tips={[
                "Start with a venture type you already have (e.g. merch or memberships)",
                "Track revenue and expenses to see real profit/loss",
                "AI will suggest optimization strategies as data builds up",
              ]}
              data-testid="empty-state-ventures"
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {safeArray(filtered).map((venture: any) => {
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
