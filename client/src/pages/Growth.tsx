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
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import {
  Palette, Plus, Type, Image, Droplets, Trash2,
  Users, ExternalLink, Sparkles, ChevronDown, Eye, TrendingUp,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

type GrowthTab = "Brand" | "Collabs" | "Competitors";

const brandCategories = ["All", "Colors", "Fonts", "Logos", "Voice", "Guidelines"] as const;

const brandCategoryMap: Record<string, string> = {
  Colors: "color",
  Fonts: "font",
  Logos: "logo",
  Voice: "voice_tone",
  Guidelines: "guideline",
};

function getCategoryIcon(type: string) {
  switch (type) {
    case "color": return <Palette className="h-4 w-4 text-muted-foreground" />;
    case "font": return <Type className="h-4 w-4 text-muted-foreground" />;
    case "logo": return <Image className="h-4 w-4 text-muted-foreground" />;
    case "voice_tone": return <Droplets className="h-4 w-4 text-muted-foreground" />;
    default: return <Palette className="h-4 w-4 text-muted-foreground" />;
  }
}

const COLLAB_STATUSES = ["suggested", "contacted", "confirmed", "completed", "declined"] as const;

const statusColors: Record<string, string> = {
  suggested: "bg-blue-500/10 text-blue-500",
  contacted: "bg-amber-500/10 text-amber-500",
  confirmed: "bg-emerald-500/10 text-emerald-500",
  completed: "bg-purple-500/10 text-purple-500",
  declined: "bg-red-500/10 text-red-500",
};

const competitorPlatforms = ["youtube", "twitch", "tiktok", "kick", "instagram"];

function BrandTabContent() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [assetType, setAssetType] = useState("color");

  const { data: assets, isLoading } = useQuery<any[]>({ queryKey: ["/api/brand-assets"] });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/brand-assets", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/brand-assets"] });
      setDialogOpen(false);
      toast({ title: "Brand asset added" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/brand-assets/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/brand-assets"] });
      toast({ title: "Asset deleted" });
    },
  });

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createMutation.mutate({
      assetType,
      name: formData.get("name"),
      value: formData.get("value"),
    });
  };

  const filtered = assets?.filter((a: any) => {
    if (activeCategory === "All") return true;
    return a.assetType === brandCategoryMap[activeCategory];
  }) || [];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex gap-2 flex-wrap">
          {brandCategories.map((c) => <Skeleton key={c} className="h-8 w-20 rounded-md" />)}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center gap-4 flex-wrap">
        <h2 data-testid="text-brand-heading" className="text-lg font-semibold">Brand Kit</h2>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-asset" size="sm">
              <Plus className="w-4 h-4 mr-1" />
              Add Asset
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Brand Asset</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <Label>Asset Type</Label>
                <Select value={assetType} onValueChange={setAssetType}>
                  <SelectTrigger data-testid="select-asset-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="color">Color</SelectItem>
                    <SelectItem value="font">Font</SelectItem>
                    <SelectItem value="logo">Logo</SelectItem>
                    <SelectItem value="voice_tone">Voice & Tone</SelectItem>
                    <SelectItem value="guideline">Guideline</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Name</Label>
                <Input name="name" required data-testid="input-asset-name" placeholder="e.g. Primary Brand Color" />
              </div>
              <div>
                <Label>Value</Label>
                <Input name="value" required data-testid="input-asset-value" placeholder={assetType === "color" ? "#FF5733" : "Enter value"} />
              </div>
              <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-submit-asset">
                {createMutation.isPending ? "Saving..." : "Save Asset"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-2 flex-wrap">
        {brandCategories.map((cat) => (
          <Badge
            key={cat}
            variant={activeCategory === cat ? "default" : "secondary"}
            className="cursor-pointer toggle-elevate"
            onClick={() => setActiveCategory(cat)}
            data-testid={`tab-brand-${cat.toLowerCase()}`}
          >
            {cat}
          </Badge>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Palette className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground" data-testid="text-no-assets">No brand assets yet. Add your first asset to build your brand kit.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filtered.map((asset: any) => (
            <Card key={asset.id} data-testid={`card-asset-${asset.id}`}>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  {getCategoryIcon(asset.assetType)}
                  <CardTitle className="text-sm font-medium truncate" data-testid={`text-asset-name-${asset.id}`}>{asset.name}</CardTitle>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Badge variant="secondary" className="text-xs capitalize" data-testid={`badge-asset-type-${asset.id}`}>
                    {asset.assetType?.replace("_", " ")}
                  </Badge>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => deleteMutation.mutate(asset.id)}
                    data-testid={`button-delete-asset-${asset.id}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {asset.assetType === "color" ? (
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-md border border-border shrink-0"
                      style={{ backgroundColor: asset.value }}
                      data-testid={`swatch-${asset.id}`}
                    />
                    <span className="text-sm font-mono" data-testid={`text-asset-value-${asset.id}`}>{asset.value}</span>
                  </div>
                ) : asset.assetType === "font" ? (
                  <p className="text-sm" data-testid={`text-asset-value-${asset.id}`} style={{ fontFamily: asset.value }}>
                    {asset.value}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground" data-testid={`text-asset-value-${asset.id}`}>{asset.value}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function CollabsTabContent() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [platform, setPlatform] = useState("youtube");

  const { data: leads, isLoading } = useQuery<any[]>({ queryKey: ["/api/collaboration-leads"] });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/collaboration-leads", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/collaboration-leads"] });
      setDialogOpen(false);
      toast({ title: "Creator added" });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await apiRequest("PATCH", `/api/collaboration-leads/${id}`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/collaboration-leads"] });
      toast({ title: "Status updated" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/collaboration-leads/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/collaboration-leads"] });
      toast({ title: "Creator removed" });
    },
  });

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createMutation.mutate({
      creatorName: formData.get("creatorName"),
      platform,
      channelUrl: formData.get("channelUrl") || null,
      notes: formData.get("notes") || null,
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4">
          <Skeleton className="h-36 rounded-xl" />
          <Skeleton className="h-36 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center gap-4 flex-wrap">
        <h2 data-testid="text-collabs-heading" className="text-lg font-semibold">Collaborations</h2>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-creator" size="sm">
              <Plus className="w-4 h-4 mr-1" />
              Add Creator
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Collaboration Lead</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <Label>Creator Name</Label>
                <Input name="creatorName" required data-testid="input-creator-name" placeholder="e.g. TechGuru" />
              </div>
              <div>
                <Label>Platform</Label>
                <Select value={platform} onValueChange={setPlatform}>
                  <SelectTrigger data-testid="select-creator-platform"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="youtube">YouTube</SelectItem>
                    <SelectItem value="twitch">Twitch</SelectItem>
                    <SelectItem value="tiktok">TikTok</SelectItem>
                    <SelectItem value="instagram">Instagram</SelectItem>
                    <SelectItem value="twitter">Twitter</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Channel URL</Label>
                <Input name="channelUrl" type="url" data-testid="input-creator-url" placeholder="https://youtube.com/@creator" />
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea name="notes" data-testid="input-creator-notes" placeholder="Why collaborate?" className="resize-none" />
              </div>
              <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-submit-creator">
                {createMutation.isPending ? "Saving..." : "Add Creator"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {!leads || leads.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Users className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground" data-testid="text-empty-collaborations">Find creators to collaborate with</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {leads.map((lead: any) => {
            const overlap = lead.audienceOverlap;
            const overlapPct = overlap != null ? Math.round(overlap) : null;

            return (
              <Card key={lead.id} data-testid={`card-lead-${lead.id}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="space-y-1">
                      <CardTitle className="text-base" data-testid={`text-lead-name-${lead.id}`}>{lead.creatorName}</CardTitle>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary" className="capitalize" data-testid={`badge-lead-platform-${lead.id}`}>
                          {lead.platform}
                        </Badge>
                        <Badge
                          variant="secondary"
                          className={statusColors[lead.status] || ""}
                          data-testid={`badge-lead-status-${lead.id}`}
                        >
                          {lead.status}
                        </Badge>
                        {lead.aiSuggested && (
                          <Badge variant="secondary" className="bg-violet-500/10 text-violet-500" data-testid={`badge-lead-ai-${lead.id}`}>
                            <Sparkles className="w-3 h-3 mr-1" />
                            AI Suggested
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" variant="outline" data-testid={`button-change-status-${lead.id}`}>
                            Status
                            <ChevronDown className="w-3 h-3 ml-1" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          {COLLAB_STATUSES.map((s) => (
                            <DropdownMenuItem
                              key={s}
                              onClick={() => updateStatusMutation.mutate({ id: lead.id, status: s })}
                              data-testid={`menu-status-${s}-${lead.id}`}
                              className="capitalize"
                            >
                              {s}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => deleteMutation.mutate(lead.id)}
                        data-testid={`button-delete-lead-${lead.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {lead.channelUrl && (
                    <a
                      href={lead.channelUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      data-testid={`link-lead-channel-${lead.id}`}
                    >
                      <ExternalLink className="w-3 h-3" />
                      {lead.channelUrl}
                    </a>
                  )}

                  {overlapPct != null && (
                    <div>
                      <div className="flex justify-between items-center text-xs mb-1">
                        <span className="text-muted-foreground">Audience Overlap</span>
                        <span className="font-medium" data-testid={`text-lead-overlap-${lead.id}`}>{overlapPct}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${overlapPct}%` }}
                          data-testid={`bar-lead-overlap-${lead.id}`}
                        />
                      </div>
                    </div>
                  )}

                  {lead.notes && (
                    <p className="text-xs text-muted-foreground" data-testid={`text-lead-notes-${lead.id}`}>{lead.notes}</p>
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

function CompetitorsTabContent() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [platform, setPlatform] = useState("youtube");

  const { data: competitors, isLoading } = useQuery<any[]>({ queryKey: ["/api/competitors"] });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/competitors", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/competitors"] });
      setDialogOpen(false);
      toast({ title: "Competitor added" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/competitors/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/competitors"] });
      toast({ title: "Competitor removed" });
    },
  });

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createMutation.mutate({
      competitorName: formData.get("competitorName"),
      platform,
      channelUrl: formData.get("channelUrl"),
      subscribers: parseInt(formData.get("subscribers") as string) || 0,
      avgViews: parseInt(formData.get("avgViews") as string) || 0,
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center gap-4 flex-wrap">
        <h2 data-testid="text-competitors-heading" className="text-lg font-semibold">Competitor Intelligence</h2>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-competitor" size="sm">
              <Plus className="w-4 h-4 mr-1" />
              Track Competitor
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Track Competitor</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <Label>Competitor Name</Label>
                <Input name="competitorName" required data-testid="input-competitor-name" placeholder="Channel name" />
              </div>
              <div>
                <Label>Platform</Label>
                <Select value={platform} onValueChange={setPlatform}>
                  <SelectTrigger data-testid="select-competitor-platform"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {competitorPlatforms.map((p) => (
                      <SelectItem key={p} value={p} className="capitalize">{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Channel URL</Label>
                <Input name="channelUrl" data-testid="input-channel-url" placeholder="https://..." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Subscribers</Label>
                  <Input name="subscribers" type="number" data-testid="input-subscribers" placeholder="0" />
                </div>
                <div>
                  <Label>Avg Views</Label>
                  <Input name="avgViews" type="number" data-testid="input-avg-views" placeholder="0" />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-submit-competitor">
                {createMutation.isPending ? "Saving..." : "Track Competitor"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {!competitors || competitors.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Users className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground" data-testid="text-no-competitors">Start tracking competitors to find growth opportunities</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {competitors.map((comp: any) => (
            <Card key={comp.id} data-testid={`card-competitor-${comp.id}`}>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  <CardTitle className="text-sm font-medium" data-testid={`text-competitor-name-${comp.id}`}>
                    {comp.competitorName}
                  </CardTitle>
                  <Badge variant="secondary" className="text-xs capitalize" data-testid={`badge-platform-${comp.id}`}>
                    {comp.platform}
                  </Badge>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => deleteMutation.mutate(comp.id)}
                  data-testid={`button-delete-competitor-${comp.id}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {comp.channelUrl && (
                  <a
                    href={comp.channelUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-muted-foreground flex items-center gap-1 hover:underline"
                    data-testid={`link-channel-${comp.id}`}
                  >
                    <ExternalLink className="w-3 h-3" />
                    {comp.channelUrl}
                  </a>
                )}
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-sm" data-testid={`text-subscribers-${comp.id}`}>
                      {(comp.subscribers || 0).toLocaleString()} subscribers
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-sm" data-testid={`text-avg-views-${comp.id}`}>
                      {(comp.avgViews || 0).toLocaleString()} avg views
                    </span>
                  </div>
                </div>
                {comp.strengths && comp.strengths.length > 0 && (
                  <div className="flex gap-1.5 flex-wrap">
                    {comp.strengths.map((s: string, i: number) => (
                      <Badge key={i} variant="secondary" className="text-xs bg-emerald-500/10 text-emerald-500" data-testid={`badge-strength-${comp.id}-${i}`}>
                        {s}
                      </Badge>
                    ))}
                  </div>
                )}
                {comp.opportunities && comp.opportunities.length > 0 && (
                  <div className="flex gap-1.5 flex-wrap">
                    {comp.opportunities.map((o: string, i: number) => (
                      <Badge key={i} variant="secondary" className="text-xs bg-blue-500/10 text-blue-500" data-testid={`badge-opportunity-${comp.id}-${i}`}>
                        {o}
                      </Badge>
                    ))}
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

const TABS: GrowthTab[] = ["Brand", "Collabs", "Competitors"];

export default function Growth() {
  const [activeTab, setActiveTab] = useState<GrowthTab>("Brand");

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 data-testid="text-page-title" className="text-2xl font-display font-bold flex items-center gap-2 flex-wrap">
          <TrendingUp className="w-6 h-6" />
          Growth
        </h1>
        <p data-testid="text-page-subtitle" className="text-sm text-muted-foreground mt-1">
          Build your brand, find collaborators, and track competitors
        </p>
      </div>

      <div className="flex gap-2 flex-wrap" data-testid="growth-tab-bar">
        {TABS.map((tab) => (
          <Button
            key={tab}
            variant={activeTab === tab ? "default" : "secondary"}
            onClick={() => setActiveTab(tab)}
            data-testid={`tab-growth-${tab.toLowerCase()}`}
          >
            {tab}
          </Button>
        ))}
      </div>

      {activeTab === "Brand" && <BrandTabContent />}
      {activeTab === "Collabs" && <CollabsTabContent />}
      {activeTab === "Competitors" && <CompetitorsTabContent />}
    </div>
  );
}
