import { useState, useEffect, useMemo } from "react";
import { CollapsibleToolbox } from "@/components/CollapsibleToolbox";
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
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  DollarSign, Plus, TrendingUp, CalendarDays, Trash2, CheckCircle2,
  AlertTriangle, Sparkles, Handshake, ChevronDown, Mail, Copy, Loader2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { QueryErrorReset } from "@/components/QueryErrorReset";

type AIResponse = any;

const SPONSOR_STAGES = ["Prospect", "Contacted", "Negotiating", "Active", "Completed", "Declined"] as const;

const sponsorStageColors: Record<string, string> = {
  Prospect: "bg-slate-500/10 text-slate-500",
  Contacted: "bg-blue-500/10 text-blue-500",
  Negotiating: "bg-amber-500/10 text-amber-500",
  Active: "bg-emerald-500/10 text-emerald-500",
  Completed: "bg-purple-500/10 text-purple-500",
  Declined: "bg-red-500/10 text-red-500",
};

export default function SponsorsTab() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [status, setStatus] = useState("Prospect");
  const [filterStage, setFilterStage] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "kanban">("list");
  const [aiSponsorship, setAiSponsorship] = useState<AIResponse>(null);
  const [aiSponsorshipLoading, setAiSponsorshipLoading] = useState(false);
  const [aiMediaKit, setAiMediaKit] = useState<AIResponse>(null);
  const [aiMediaKitLoading, setAiMediaKitLoading] = useState(false);
  const [aiToolsOpen, setAiToolsOpen] = useState(false);
  const [outreachDialogOpen, setOutreachDialogOpen] = useState(false);
  const [outreachDraft, setOutreachDraft] = useState<{ subject?: string; body?: string; followUpNote?: string } | null>(null);
  const [outreachLoading, setOutreachLoading] = useState<number | null>(null);

  useEffect(() => {
    if (!aiToolsOpen) return;
    const cachedSponsor = sessionStorage.getItem("aiSponsorshipManager");

    if (cachedSponsor) {

      try { const e = JSON.parse(cachedSponsor); if (e.ts && Date.now() - e.ts < 1800000) { setAiSponsorship(e.data); } else { sessionStorage.removeItem("aiSponsorshipManager"); } } catch {}

    } else {
      setAiSponsorshipLoading(true);
      apiRequest("POST", "/api/ai/sponsorship-manager", {})
        .then(res => res.json())
        .then(data => {
          setAiSponsorship(data);
          sessionStorage.setItem("aiSponsorshipManager", JSON.stringify({ data: data, ts: Date.now() }));
        })
        .catch(() => {})
        .finally(() => setAiSponsorshipLoading(false));
    }
    const cachedKit = sessionStorage.getItem("aiMediaKit");

    if (cachedKit) {

      try { const e = JSON.parse(cachedKit); if (e.ts && Date.now() - e.ts < 1800000) { setAiMediaKit(e.data); } else { sessionStorage.removeItem("aiMediaKit"); } } catch {}

    } else {
      setAiMediaKitLoading(true);
      apiRequest("POST", "/api/ai/media-kit", {})
        .then(res => res.json())
        .then(data => {
          setAiMediaKit(data);
          sessionStorage.setItem("aiMediaKit", JSON.stringify({ data: data, ts: Date.now() }));
        })
        .catch(() => {})
        .finally(() => setAiMediaKitLoading(false));
    }
  }, [aiToolsOpen]);

  const { data: rawDeals, isLoading, error } = useQuery<any[]>({ queryKey: ["/api/sponsorship-deals"], refetchInterval: 30_000, staleTime: 20_000 });
  const deals = safeArray(rawDeals);

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
    let total = 0, active = 0, completed = 0;
    for (const d of deals) {
      const val = d.dealValue || 0;
      total += val;
      if (d.status === "Active") { active++; }
      if (d.status === "Completed") { completed += val; }
    }
    return { totalPipeline: total, activeCount: active, completedTotal: completed };
  }, [deals]);

  const filtered = filterStage ? deals.filter((d: any) => d.status === filterStage) : deals;

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
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }

  if (error) return <QueryErrorReset error={error} queryKey={["/api/sponsorship-deals"]} label="Failed to load sponsorship deals" />;

  const copyToClipboardSponsors = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
  };

  return (
    <div className="space-y-3">
      <CollapsibleToolbox title="AI Sponsorship Tools" toolCount={2} open={aiToolsOpen} onOpenChange={setAiToolsOpen}>
      {aiSponsorshipLoading && (
        <Card data-testid="card-ai-sponsorship-loading">
          <CardContent className="p-3 space-y-4">
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

            {safeArray(aiSponsorship?.prospectBrands).length > 0 && (
              <div data-testid="section-prospect-brands">
                <p className="text-xs font-medium text-muted-foreground mb-2">Prospect Brands</p>
                <div className="space-y-2">
                  {safeArray(aiSponsorship?.prospectBrands).map((brand: any, idx: number) => (
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

            {safeArray(aiSponsorship?.redFlags).length > 0 && (
              <div data-testid="section-red-flags">
                <p className="text-xs font-medium text-muted-foreground mb-1">Red Flags to Avoid</p>
                <div className="space-y-1">
                  {safeArray(aiSponsorship?.redFlags).map((flag: string, idx: number) => (
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
          <CardContent className="p-3 space-y-4">
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

            {safeArray(aiMediaKit?.keyMetrics).length > 0 && (
              <div data-testid="section-key-metrics">
                <p className="text-xs font-medium text-muted-foreground mb-2">Key Metrics</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {safeArray(aiMediaKit?.keyMetrics).map((metric: any, idx: number) => (
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

            {safeArray(aiMediaKit?.sponsorshipPackages).length > 0 && (
              <div data-testid="section-sponsorship-packages">
                <p className="text-xs font-medium text-muted-foreground mb-2">Sponsorship Packages</p>
                <div className="space-y-2">
                  {safeArray(aiMediaKit?.sponsorshipPackages).map((pkg: any, idx: number) => (
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
      </CollapsibleToolbox>

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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Card>
          <CardContent className="p-3">
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
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Active Deals</span>
            </div>
            <p className="text-xl font-bold" data-testid="text-active-deals">{activeCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
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

      <div className="flex items-center justify-between gap-2 flex-wrap">
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
        <div className="flex gap-1 p-0.5 rounded-lg bg-muted/30 border border-border/30">
          <button
            onClick={() => setViewMode("list")}
            className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-all ${viewMode === "list" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            data-testid="button-view-list"
          >
            List
          </button>
          <button
            onClick={() => setViewMode("kanban")}
            className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-all ${viewMode === "kanban" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            data-testid="button-view-kanban"
          >
            Kanban
          </button>
        </div>
      </div>

      {viewMode === "kanban" ? (
        <div className="overflow-x-auto pb-3" data-testid="section-kanban-board">
          <div className="flex gap-3 min-w-max">
            {SPONSOR_STAGES.map(stage => {
              const stageBg: Record<string, string> = {
                Prospect: "border-slate-500/20 bg-slate-500/5",
                Contacted: "border-blue-500/20 bg-blue-500/5",
                Negotiating: "border-amber-500/20 bg-amber-500/5",
                Active: "border-emerald-500/20 bg-emerald-500/5",
                Completed: "border-purple-500/20 bg-purple-500/5",
                Declined: "border-red-500/20 bg-red-500/5",
              };
              const stageDeals = deals.filter((d: any) => d.status === stage);
              const stageValue = stageDeals.reduce((sum: number, d: any) => sum + (d.dealValue || 0), 0);
              return (
                <div key={stage} className={`w-52 flex-shrink-0 rounded-xl border p-2.5 space-y-2 ${stageBg[stage] || ""}`} data-testid={`kanban-column-${stage.toLowerCase()}`}>
                  <div className="flex items-center justify-between px-0.5">
                    <span className={`text-[10px] font-bold uppercase tracking-widest ${sponsorStageColors[stage]?.split(" ")[1] || "text-muted-foreground"}`}>{stage}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] text-muted-foreground font-mono">${stageValue.toLocaleString()}</span>
                      <Badge variant="outline" className="text-[9px] h-4 px-1">{stageDeals.length}</Badge>
                    </div>
                  </div>
                  {stageDeals.length === 0 ? (
                    <div className="h-14 rounded-lg border border-dashed border-border/30 flex items-center justify-center">
                      <span className="text-[9px] text-muted-foreground/50">Empty</span>
                    </div>
                  ) : (
                    stageDeals.map((deal: any) => (
                      <Card key={deal.id} className="p-2.5 space-y-1.5 cursor-default hover:border-primary/20 transition-all" data-testid={`kanban-card-${deal.id}`}>
                        <div className="text-xs font-semibold leading-tight truncate">{deal.brandName}</div>
                        <div className="text-xs font-bold text-emerald-400">${(deal.dealValue || 0).toLocaleString()}</div>
                        {deal.contactEmail && (
                          <div className="text-[10px] text-muted-foreground truncate">{deal.contactEmail}</div>
                        )}
                        <div className="flex gap-1">
                          {SPONSOR_STAGES.filter(s => s !== stage).slice(0, 2).map(s => (
                            <button
                              key={s}
                              onClick={() => updateStatusMutation.mutate({ id: deal.id, status: s })}
                              className="text-[9px] px-1.5 py-0.5 rounded bg-muted/40 hover:bg-muted/70 text-muted-foreground hover:text-foreground transition-colors"
                              data-testid={`kanban-move-${deal.id}-${s.toLowerCase()}`}
                            >
                              → {s}
                            </button>
                          ))}
                        </div>
                      </Card>
                    ))
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Handshake className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground" data-testid="text-empty-deals">No sponsorship deals yet. Add your first deal to start tracking.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-2">
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
                      size="sm"
                      variant="outline"
                      data-testid={`button-outreach-${deal.id}`}
                      disabled={outreachLoading === deal.id}
                      onClick={async () => {
                        setOutreachLoading(deal.id);
                        try {
                          const res = await apiRequest("POST", `/api/sponsorship-deals/${deal.id}/outreach-draft`);
                          const draft = await res.json();
                          setOutreachDraft(draft);
                          setOutreachDialogOpen(true);
                        } catch {
                          toast({ title: "Failed to generate outreach draft", variant: "destructive" });
                        } finally {
                          setOutreachLoading(null);
                        }
                      }}
                    >
                      {outreachLoading === deal.id ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Sparkles className="w-3 h-3 mr-1" />}
                      Outreach
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon" variant="ghost" data-testid={`button-delete-deal-${deal.id}`}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Deal</AlertDialogTitle>
                          <AlertDialogDescription>Are you sure you want to delete the deal with "{deal.brandName}"? This cannot be undone.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction data-testid={`button-confirm-delete-deal-${deal.id}`} onClick={() => deleteMutation.mutate(deal.id)}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
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

      <Dialog open={outreachDialogOpen} onOpenChange={setOutreachDialogOpen}>
        <DialogContent className="max-w-xl" data-testid="dialog-outreach-draft">
          <DialogHeader>
            <DialogTitle>Outreach Draft</DialogTitle>
          </DialogHeader>
          {outreachDraft && (
            <div className="space-y-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Subject</p>
                <p className="text-sm font-semibold" data-testid="text-outreach-subject">{outreachDraft.subject}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Email Body</p>
                <Textarea
                  readOnly
                  value={outreachDraft.body || ""}
                  className="resize-none text-xs min-h-[180px]"
                  data-testid="text-outreach-body"
                />
              </div>
              {outreachDraft.followUpNote && (
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium">Follow-up tip:</span> {outreachDraft.followUpNote}
                </p>
              )}
              <div className="flex gap-2 justify-end pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  data-testid="button-copy-outreach"
                  onClick={() => {
                    const text = `Subject: ${outreachDraft.subject}\n\n${outreachDraft.body}`;
                    navigator.clipboard.writeText(text);
                    toast({ title: "Copied to clipboard" });
                  }}
                >
                  <Copy className="w-3 h-3 mr-1" /> Copy
                </Button>
                <Button size="sm" onClick={() => setOutreachDialogOpen(false)} data-testid="button-close-outreach">
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
