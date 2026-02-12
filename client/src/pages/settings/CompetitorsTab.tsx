import { useState, useEffect } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { PlatformBadge } from "@/components/PlatformIcon";
import { Sparkles, Plus, Eye, Trash2, Link as LinkIcon, ChevronDown, ChevronUp } from "lucide-react";
import { CollapsibleToolbox } from "@/components/CollapsibleToolbox";

type AIResponse = Record<string, unknown> | null;

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

  const [showCompetitorAI, setShowCompetitorAI] = useState(false);
  const [aiCompAnalysis, setAiCompAnalysis] = useState<AIResponse>(null);
  const [aiCompAnalysisLoading, setAiCompAnalysisLoading] = useState(false);
  const [aiCompContent, setAiCompContent] = useState<AIResponse>(null);
  const [aiCompContentLoading, setAiCompContentLoading] = useState(false);
  const [aiCompPricing, setAiCompPricing] = useState<AIResponse>(null);
  const [aiCompPricingLoading, setAiCompPricingLoading] = useState(false);
  const [aiMktShare, setAiMktShare] = useState<AIResponse>(null);
  const [aiMktShareLoading, setAiMktShareLoading] = useState(false);
  const [aiSWOT, setAiSWOT] = useState<AIResponse>(null);
  const [aiSWOTLoading, setAiSWOTLoading] = useState(false);
  const [aiCompSocial, setAiCompSocial] = useState<AIResponse>(null);
  const [aiCompSocialLoading, setAiCompSocialLoading] = useState(false);
  const [aiBlueOcean, setAiBlueOcean] = useState<AIResponse>(null);
  const [aiBlueOceanLoading, setAiBlueOceanLoading] = useState(false);

  const [showCompIntelAI2, setShowCompIntelAI2] = useState(false);
  const [aiCompTracker, setAiCompTracker] = useState<AIResponse>(null);
  const [aiCompTrackerLoading, setAiCompTrackerLoading] = useState(false);
  const [aiCompGapAnalysis, setAiCompGapAnalysis] = useState<AIResponse>(null);
  const [aiCompGapAnalysisLoading, setAiCompGapAnalysisLoading] = useState(false);
  const [aiCompAlerts, setAiCompAlerts] = useState<AIResponse>(null);
  const [aiCompAlertsLoading, setAiCompAlertsLoading] = useState(false);
  const [aiCompContentScorer, setAiCompContentScorer] = useState<AIResponse>(null);
  const [aiCompContentScorerLoading, setAiCompContentScorerLoading] = useState(false);
  const [aiNicheDomMap, setAiNicheDomMap] = useState<AIResponse>(null);
  const [aiNicheDomMapLoading, setAiNicheDomMapLoading] = useState(false);
  const [aiCompAudienceOverlap, setAiCompAudienceOverlap] = useState<AIResponse>(null);
  const [aiCompAudienceOverlapLoading, setAiCompAudienceOverlapLoading] = useState(false);

  useEffect(() => {
    const cached = sessionStorage.getItem("ai_comp_analysis");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiCompAnalysis(e.data); return; } else { sessionStorage.removeItem("ai_comp_analysis"); } } catch {} }
    setAiCompAnalysisLoading(true);
    apiRequest("POST", "/api/ai/competitor-analysis", {}).then(r => r.json()).then(d => { setAiCompAnalysis(d); sessionStorage.setItem("ai_comp_analysis", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiCompAnalysisLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_comp_content");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiCompContent(e.data); return; } else { sessionStorage.removeItem("ai_comp_content"); } } catch {} }
    setAiCompContentLoading(true);
    apiRequest("POST", "/api/ai/competitor-content", {}).then(r => r.json()).then(d => { setAiCompContent(d); sessionStorage.setItem("ai_comp_content", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiCompContentLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_comp_pricing");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiCompPricing(e.data); return; } else { sessionStorage.removeItem("ai_comp_pricing"); } } catch {} }
    setAiCompPricingLoading(true);
    apiRequest("POST", "/api/ai/competitor-pricing", {}).then(r => r.json()).then(d => { setAiCompPricing(d); sessionStorage.setItem("ai_comp_pricing", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiCompPricingLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_mkt_share");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiMktShare(e.data); return; } else { sessionStorage.removeItem("ai_mkt_share"); } } catch {} }
    setAiMktShareLoading(true);
    apiRequest("POST", "/api/ai/market-share", {}).then(r => r.json()).then(d => { setAiMktShare(d); sessionStorage.setItem("ai_mkt_share", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiMktShareLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_swot");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiSWOT(e.data); return; } else { sessionStorage.removeItem("ai_swot"); } } catch {} }
    setAiSWOTLoading(true);
    apiRequest("POST", "/api/ai/swot", {}).then(r => r.json()).then(d => { setAiSWOT(d); sessionStorage.setItem("ai_swot", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiSWOTLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_comp_social");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiCompSocial(e.data); return; } else { sessionStorage.removeItem("ai_comp_social"); } } catch {} }
    setAiCompSocialLoading(true);
    apiRequest("POST", "/api/ai/competitor-social", {}).then(r => r.json()).then(d => { setAiCompSocial(d); sessionStorage.setItem("ai_comp_social", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiCompSocialLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_blue_ocean");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiBlueOcean(e.data); return; } else { sessionStorage.removeItem("ai_blue_ocean"); } } catch {} }
    setAiBlueOceanLoading(true);
    apiRequest("POST", "/api/ai/blue-ocean", {}).then(r => r.json()).then(d => { setAiBlueOcean(d); sessionStorage.setItem("ai_blue_ocean", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiBlueOceanLoading(false));
  }, []);

  useEffect(() => {
    if (!showCompIntelAI2) return;
    const cached = sessionStorage.getItem("ai_comp_tracker");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiCompTracker(e.data); return; } else { sessionStorage.removeItem("ai_comp_tracker"); } } catch {} }
    setAiCompTrackerLoading(true);
    apiRequest("POST", "/api/ai/competitor-tracker", {}).then(r => r.json()).then(d => { setAiCompTracker(d); sessionStorage.setItem("ai_comp_tracker", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiCompTrackerLoading(false));
  }, [showCompIntelAI2]);
  useEffect(() => {
    if (!showCompIntelAI2) return;
    const cached = sessionStorage.getItem("ai_comp_gap_analysis");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiCompGapAnalysis(e.data); return; } else { sessionStorage.removeItem("ai_comp_gap_analysis"); } } catch {} }
    setAiCompGapAnalysisLoading(true);
    apiRequest("POST", "/api/ai/competitor-gap-analysis", {}).then(r => r.json()).then(d => { setAiCompGapAnalysis(d); sessionStorage.setItem("ai_comp_gap_analysis", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiCompGapAnalysisLoading(false));
  }, [showCompIntelAI2]);
  useEffect(() => {
    if (!showCompIntelAI2) return;
    const cached = sessionStorage.getItem("ai_comp_alerts");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiCompAlerts(e.data); return; } else { sessionStorage.removeItem("ai_comp_alerts"); } } catch {} }
    setAiCompAlertsLoading(true);
    apiRequest("POST", "/api/ai/competitor-alerts", {}).then(r => r.json()).then(d => { setAiCompAlerts(d); sessionStorage.setItem("ai_comp_alerts", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiCompAlertsLoading(false));
  }, [showCompIntelAI2]);
  useEffect(() => {
    if (!showCompIntelAI2) return;
    const cached = sessionStorage.getItem("ai_comp_content_scorer");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiCompContentScorer(e.data); return; } else { sessionStorage.removeItem("ai_comp_content_scorer"); } } catch {} }
    setAiCompContentScorerLoading(true);
    apiRequest("POST", "/api/ai/competitor-content-scorer", {}).then(r => r.json()).then(d => { setAiCompContentScorer(d); sessionStorage.setItem("ai_comp_content_scorer", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiCompContentScorerLoading(false));
  }, [showCompIntelAI2]);
  useEffect(() => {
    if (!showCompIntelAI2) return;
    const cached = sessionStorage.getItem("ai_niche_dom_map");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiNicheDomMap(e.data); return; } else { sessionStorage.removeItem("ai_niche_dom_map"); } } catch {} }
    setAiNicheDomMapLoading(true);
    apiRequest("POST", "/api/ai/niche-domination-map", {}).then(r => r.json()).then(d => { setAiNicheDomMap(d); sessionStorage.setItem("ai_niche_dom_map", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiNicheDomMapLoading(false));
  }, [showCompIntelAI2]);
  useEffect(() => {
    if (!showCompIntelAI2) return;
    const cached = sessionStorage.getItem("ai_comp_audience_overlap");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiCompAudienceOverlap(e.data); return; } else { sessionStorage.removeItem("ai_comp_audience_overlap"); } } catch {} }
    setAiCompAudienceOverlapLoading(true);
    apiRequest("POST", "/api/ai/competitor-audience-overlap", {}).then(r => r.json()).then(d => { setAiCompAudienceOverlap(d); sessionStorage.setItem("ai_comp_audience_overlap", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiCompAudienceOverlapLoading(false));
  }, [showCompIntelAI2]);

  const renderAIListComp = (arr: any[] | undefined, limit = 5) => {
    if (!arr || !Array.isArray(arr) || arr.length === 0) return null;
    return arr.slice(0, limit).map((item: any, i: number) => (
      <p key={i}>{typeof item === "string" ? item : item.title || item.name || item.description || item.text || item.label || JSON.stringify(item)}</p>
    ));
  };

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
                      <PlatformBadge platform={comp.platform} className="text-xs" />
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

      <CollapsibleToolbox title="AI Competitor Tools" toolCount={20}>
      <div className="space-y-3">
      <div className="border rounded-md overflow-visible">
        <button
          className="flex items-center gap-2 w-full p-4 text-left"
          onClick={() => setShowCompetitorAI(!showCompetitorAI)}
          data-testid="button-toggle-competitor-ai"
        >
          <Sparkles className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-semibold">AI Competitor Intelligence Suite</span>
          <Badge variant="outline" className="text-[10px]">7 tools</Badge>
          {showCompetitorAI ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showCompetitorAI && (
          <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(aiCompAnalysisLoading || aiCompAnalysis) && (
              <Card data-testid="card-ai-comp-analysis">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Competitor Analysis</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCompAnalysisLoading ? <Skeleton className="h-24 w-full" /> : aiCompAnalysis && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIListComp(aiCompAnalysis.competitors || aiCompAnalysis.recommendations || aiCompAnalysis.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCompContentLoading || aiCompContent) && (
              <Card data-testid="card-ai-comp-content">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Competitor Content</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCompContentLoading ? <Skeleton className="h-24 w-full" /> : aiCompContent && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIListComp(aiCompContent.content || aiCompContent.recommendations || aiCompContent.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCompPricingLoading || aiCompPricing) && (
              <Card data-testid="card-ai-comp-pricing">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Competitor Pricing</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCompPricingLoading ? <Skeleton className="h-24 w-full" /> : aiCompPricing && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIListComp(aiCompPricing.pricing || aiCompPricing.recommendations || aiCompPricing.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiMktShareLoading || aiMktShare) && (
              <Card data-testid="card-ai-mkt-share">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Market Share</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiMktShareLoading ? <Skeleton className="h-24 w-full" /> : aiMktShare && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIListComp(aiMktShare.segments || aiMktShare.recommendations || aiMktShare.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiSWOTLoading || aiSWOT) && (
              <Card data-testid="card-ai-swot">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI SWOT Analysis</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiSWOTLoading ? <Skeleton className="h-24 w-full" /> : aiSWOT && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIListComp(aiSWOT.analysis || aiSWOT.recommendations || aiSWOT.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCompSocialLoading || aiCompSocial) && (
              <Card data-testid="card-ai-comp-social">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Competitor Social</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCompSocialLoading ? <Skeleton className="h-24 w-full" /> : aiCompSocial && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIListComp(aiCompSocial.platforms || aiCompSocial.recommendations || aiCompSocial.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiBlueOceanLoading || aiBlueOcean) && (
              <Card data-testid="card-ai-blue-ocean">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Blue Ocean Strategy</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiBlueOceanLoading ? <Skeleton className="h-24 w-full" /> : aiBlueOcean && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIListComp(aiBlueOcean.strategies || aiBlueOcean.recommendations || aiBlueOcean.results)}
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
          onClick={() => setShowCompIntelAI2(!showCompIntelAI2)}
          data-testid="button-toggle-comp-intel-ai2"
        >
          <Sparkles className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-semibold">AI Competitor Intelligence Suite</span>
          <Badge variant="outline" className="text-[10px]">6 tools</Badge>
          {showCompIntelAI2 ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showCompIntelAI2 && (
          <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(aiCompTrackerLoading || aiCompTracker) && (
              <Card data-testid="card-ai-comp-tracker">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Competitor Tracker</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCompTrackerLoading ? <Skeleton className="h-24 w-full" /> : aiCompTracker && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIListComp(aiCompTracker.channels || aiCompTracker.competitors || aiCompTracker.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCompGapAnalysisLoading || aiCompGapAnalysis) && (
              <Card data-testid="card-ai-comp-gap-analysis">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Competitor Gap Analysis</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCompGapAnalysisLoading ? <Skeleton className="h-24 w-full" /> : aiCompGapAnalysis && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIListComp(aiCompGapAnalysis.gaps || aiCompGapAnalysis.opportunities || aiCompGapAnalysis.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCompAlertsLoading || aiCompAlerts) && (
              <Card data-testid="card-ai-comp-alerts">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Competitor Alerts</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCompAlertsLoading ? <Skeleton className="h-24 w-full" /> : aiCompAlerts && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIListComp(aiCompAlerts.alerts || aiCompAlerts.moves || aiCompAlerts.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCompContentScorerLoading || aiCompContentScorer) && (
              <Card data-testid="card-ai-comp-content-scorer">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Competitor Content Scorer</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCompContentScorerLoading ? <Skeleton className="h-24 w-full" /> : aiCompContentScorer && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIListComp(aiCompContentScorer.scores || aiCompContentScorer.comparisons || aiCompContentScorer.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiNicheDomMapLoading || aiNicheDomMap) && (
              <Card data-testid="card-ai-niche-dom-map">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Niche Domination Map</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiNicheDomMapLoading ? <Skeleton className="h-24 w-full" /> : aiNicheDomMap && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIListComp(aiNicheDomMap.topics || aiNicheDomMap.ownership || aiNicheDomMap.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCompAudienceOverlapLoading || aiCompAudienceOverlap) && (
              <Card data-testid="card-ai-comp-audience-overlap">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Competitor Audience Overlap</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCompAudienceOverlapLoading ? <Skeleton className="h-24 w-full" /> : aiCompAudienceOverlap && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIListComp(aiCompAudienceOverlap.segments || aiCompAudienceOverlap.overlap || aiCompAudienceOverlap.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
      </div>
      </CollapsibleToolbox>
    </div>
  );
}

export default CompetitorsTab;
