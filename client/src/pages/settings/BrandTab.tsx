import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { safeArray } from '@/lib/safe-data';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, Plus, Palette, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { CollapsibleToolbox } from "@/components/CollapsibleToolbox";

type AIResponse = any;

const ASSET_TYPES = ["color", "logo", "font", "tone"] as const;
const assetTypeLabels: Record<string, string> = { color: "Colors", logo: "Logos", font: "Fonts", tone: "Tone of Voice" };
const assetTypeIcons: Record<string, string> = { color: "bg-gradient-to-br from-purple-500 to-pink-500", logo: "bg-gradient-to-br from-blue-500 to-cyan-500", font: "bg-gradient-to-br from-amber-500 to-orange-500", tone: "bg-gradient-to-br from-emerald-500 to-teal-500" };

function BrandTab() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [assetType, setAssetType] = useState<string>("color");
  const [filterType, setFilterType] = useState<string | null>(null);
  const [aiBrand, setAiBrand] = useState<AIResponse>(null);
  const [aiBrandLoading, setAiBrandLoading] = useState(false);
  const [aiToolsOpen, setAiToolsOpen] = useState(false);

  const [showPersonalBrandAI, setShowPersonalBrandAI] = useState(false);
  const [aiBrandAudit, setAiBrandAudit] = useState<AIResponse>(null);
  const [aiBrandAuditLoading, setAiBrandAuditLoading] = useState(false);
  const [aiElevPitch, setAiElevPitch] = useState<AIResponse>(null);
  const [aiElevPitchLoading, setAiElevPitchLoading] = useState(false);
  const [aiPressKitPB, setAiPressKitPB] = useState<AIResponse>(null);
  const [aiPressKitPBLoading, setAiPressKitPBLoading] = useState(false);
  const [aiSpeakerBio, setAiSpeakerBio] = useState<AIResponse>(null);
  const [aiSpeakerBioLoading, setAiSpeakerBioLoading] = useState(false);
  const [aiLIProfile, setAiLIProfile] = useState<AIResponse>(null);
  const [aiLIProfileLoading, setAiLIProfileLoading] = useState(false);
  const [aiPersWeb, setAiPersWeb] = useState<AIResponse>(null);
  const [aiPersWebLoading, setAiPersWebLoading] = useState(false);
  const [aiThoughtLead, setAiThoughtLead] = useState<AIResponse>(null);
  const [aiThoughtLeadLoading, setAiThoughtLeadLoading] = useState(false);
  const [aiPubSpeak, setAiPubSpeak] = useState<AIResponse>(null);
  const [aiPubSpeakLoading, setAiPubSpeakLoading] = useState(false);
  const [aiNetworkStrat, setAiNetworkStrat] = useState<AIResponse>(null);
  const [aiNetworkStratLoading, setAiNetworkStratLoading] = useState(false);
  const [aiRepMonitor, setAiRepMonitor] = useState<AIResponse>(null);
  const [aiRepMonitorLoading, setAiRepMonitorLoading] = useState(false);

  useEffect(() => {
    if (!aiToolsOpen) return;
    setAiBrandLoading(true);
    const cached = sessionStorage.getItem("aiBrandAnalysis");
    if (cached) {
      try {
        setAiBrand(JSON.parse(cached));
        setAiBrandLoading(false);
        return;
      } catch {}
    }
    apiRequest("POST", "/api/ai/brand-analysis")
      .then((res) => res.json())
      .then((data) => {
        setAiBrand(data);
        sessionStorage.setItem("aiBrandAnalysis", JSON.stringify({ data: data, ts: Date.now() }));
      })
      .catch(() => {})
      .finally(() => setAiBrandLoading(false));
  }, [aiToolsOpen]);

  const { data: rawAssets, isLoading } = useQuery<any[]>({ queryKey: ['/api/brand-assets'], refetchInterval: 30_000, staleTime: 20_000 });
  const assets = safeArray(rawAssets);

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

  const filtered = filterType ? assets.filter((a: any) => a.assetType === filterType) : assets;
  const colorAssets = filtered.filter((a: any) => a.assetType === "color");
  const otherAssets = filtered.filter((a: any) => a.assetType !== "color");

  useEffect(() => {
    if (!showPersonalBrandAI) return;
    const cached = sessionStorage.getItem("ai_brand_audit");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiBrandAudit(e.data); return; } else { sessionStorage.removeItem("ai_brand_audit"); } } catch {} }
    setAiBrandAuditLoading(true);
    apiRequest("POST", "/api/ai/brand-audit", {}).then(r => r.json()).then(d => { setAiBrandAudit(d); sessionStorage.setItem("ai_brand_audit", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiBrandAuditLoading(false));
  }, [showPersonalBrandAI]);
  useEffect(() => {
    if (!showPersonalBrandAI) return;
    const cached = sessionStorage.getItem("ai_elev_pitch");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiElevPitch(e.data); return; } else { sessionStorage.removeItem("ai_elev_pitch"); } } catch {} }
    setAiElevPitchLoading(true);
    apiRequest("POST", "/api/ai/elevator-pitch", {}).then(r => r.json()).then(d => { setAiElevPitch(d); sessionStorage.setItem("ai_elev_pitch", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiElevPitchLoading(false));
  }, [showPersonalBrandAI]);
  useEffect(() => {
    if (!showPersonalBrandAI) return;
    const cached = sessionStorage.getItem("ai_press_kit");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiPressKitPB(e.data); return; } else { sessionStorage.removeItem("ai_press_kit"); } } catch {} }
    setAiPressKitPBLoading(true);
    apiRequest("POST", "/api/ai/press-kit", {}).then(r => r.json()).then(d => { setAiPressKitPB(d); sessionStorage.setItem("ai_press_kit", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiPressKitPBLoading(false));
  }, [showPersonalBrandAI]);
  useEffect(() => {
    if (!showPersonalBrandAI) return;
    const cached = sessionStorage.getItem("ai_speaker_bio");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiSpeakerBio(e.data); return; } else { sessionStorage.removeItem("ai_speaker_bio"); } } catch {} }
    setAiSpeakerBioLoading(true);
    apiRequest("POST", "/api/ai/speaker-bio", {}).then(r => r.json()).then(d => { setAiSpeakerBio(d); sessionStorage.setItem("ai_speaker_bio", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiSpeakerBioLoading(false));
  }, [showPersonalBrandAI]);
  useEffect(() => {
    if (!showPersonalBrandAI) return;
    const cached = sessionStorage.getItem("ai_li_profile");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiLIProfile(e.data); return; } else { sessionStorage.removeItem("ai_li_profile"); } } catch {} }
    setAiLIProfileLoading(true);
    apiRequest("POST", "/api/ai/linkedin-profile", {}).then(r => r.json()).then(d => { setAiLIProfile(d); sessionStorage.setItem("ai_li_profile", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiLIProfileLoading(false));
  }, [showPersonalBrandAI]);
  useEffect(() => {
    if (!showPersonalBrandAI) return;
    const cached = sessionStorage.getItem("ai_pers_web");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiPersWeb(e.data); return; } else { sessionStorage.removeItem("ai_pers_web"); } } catch {} }
    setAiPersWebLoading(true);
    apiRequest("POST", "/api/ai/personal-website", {}).then(r => r.json()).then(d => { setAiPersWeb(d); sessionStorage.setItem("ai_pers_web", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiPersWebLoading(false));
  }, [showPersonalBrandAI]);
  useEffect(() => {
    if (!showPersonalBrandAI) return;
    const cached = sessionStorage.getItem("ai_thought_lead");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiThoughtLead(e.data); return; } else { sessionStorage.removeItem("ai_thought_lead"); } } catch {} }
    setAiThoughtLeadLoading(true);
    apiRequest("POST", "/api/ai/thought-leadership", {}).then(r => r.json()).then(d => { setAiThoughtLead(d); sessionStorage.setItem("ai_thought_lead", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiThoughtLeadLoading(false));
  }, [showPersonalBrandAI]);
  useEffect(() => {
    if (!showPersonalBrandAI) return;
    const cached = sessionStorage.getItem("ai_pub_speak");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiPubSpeak(e.data); return; } else { sessionStorage.removeItem("ai_pub_speak"); } } catch {} }
    setAiPubSpeakLoading(true);
    apiRequest("POST", "/api/ai/public-speaking", {}).then(r => r.json()).then(d => { setAiPubSpeak(d); sessionStorage.setItem("ai_pub_speak", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiPubSpeakLoading(false));
  }, [showPersonalBrandAI]);
  useEffect(() => {
    if (!showPersonalBrandAI) return;
    const cached = sessionStorage.getItem("ai_network_strat");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiNetworkStrat(e.data); return; } else { sessionStorage.removeItem("ai_network_strat"); } } catch {} }
    setAiNetworkStratLoading(true);
    apiRequest("POST", "/api/ai/networking-strategy", {}).then(r => r.json()).then(d => { setAiNetworkStrat(d); sessionStorage.setItem("ai_network_strat", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiNetworkStratLoading(false));
  }, [showPersonalBrandAI]);
  useEffect(() => {
    if (!showPersonalBrandAI) return;
    const cached = sessionStorage.getItem("ai_rep_monitor");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiRepMonitor(e.data); return; } else { sessionStorage.removeItem("ai_rep_monitor"); } } catch {} }
    setAiRepMonitorLoading(true);
    apiRequest("POST", "/api/ai/reputation-monitor", {}).then(r => r.json()).then(d => { setAiRepMonitor(d); sessionStorage.setItem("ai_rep_monitor", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => {}).finally(() => setAiRepMonitorLoading(false));
  }, [showPersonalBrandAI]);

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-24 rounded-xl" /><Skeleton className="h-40 rounded-xl" /></div>;

  const renderAIList = (arr: any[] | undefined, limit = 5) => {
    if (!arr || !Array.isArray(arr) || arr.length === 0) return <p className="text-xs text-muted-foreground italic">No results available</p>;
    return arr.slice(0, limit).map((item: any, i: number) => (
      <p key={i}>{typeof item === "string" ? item : item.title || item.name || item.description || item.text || item.label || JSON.stringify(item)}</p>
    ));
  };

  return (
    <div className="space-y-6">
      {aiBrandLoading ? (
        <Skeleton className="h-64 rounded-xl" data-testid="skeleton-ai-brand" />
      ) : aiBrand ? (
        <Card data-testid="card-ai-brand-analysis">
          <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap space-y-0 pb-2">
            <CardTitle className="text-base flex items-center gap-2 flex-wrap">
              <Sparkles className="h-4 w-4 text-primary" />
              AI Brand Analysis
            </CardTitle>
            {aiBrand.brandStrength != null && (
              <Badge variant="secondary" data-testid="badge-brand-strength">
                {aiBrand.brandStrength}/100
              </Badge>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {aiBrand.brandVoice && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Brand Voice</p>
                <p className="text-sm" data-testid="text-brand-voice">{aiBrand.brandVoice}</p>
              </div>
            )}
            {aiBrand.targetAudience && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Target Audience</p>
                <p className="text-sm" data-testid="text-target-audience">{aiBrand.targetAudience}</p>
              </div>
            )}
            {aiBrand.contentPillars?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Content Pillars</p>
                <div className="flex gap-2 flex-wrap">
                  {safeArray(aiBrand?.contentPillars).map((pillar: string, i: number) => (
                    <Badge key={i} variant="secondary" data-testid={`badge-pillar-${i}`}>{pillar}</Badge>
                  ))}
                </div>
              </div>
            )}
            {aiBrand.uniqueValueProposition && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Unique Value Proposition</p>
                <p className="text-sm" data-testid="text-value-proposition">{aiBrand.uniqueValueProposition}</p>
              </div>
            )}
            {aiBrand.suggestedTagline && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Suggested Tagline</p>
                <p className="text-sm italic" data-testid="text-tagline">{aiBrand.suggestedTagline}</p>
              </div>
            )}
            {aiBrand.suggestedColors?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Suggested Colors</p>
                <div className="flex gap-2 flex-wrap">
                  {safeArray(aiBrand?.suggestedColors).map((color: string, i: number) => (
                    <div
                      key={i}
                      className="w-6 h-6 rounded-full border"
                      style={{ backgroundColor: color }}
                      title={color}
                      data-testid={`color-swatch-${i}`}
                    />
                  ))}
                </div>
              </div>
            )}
            {aiBrand.competitorAnalysis?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Competitor Analysis</p>
                <div className="space-y-2">
                  {safeArray(aiBrand?.competitorAnalysis).map((comp: any, i: number) => (
                    <div key={i} className="flex items-center justify-between gap-4 flex-wrap text-sm" data-testid={`competitor-${i}`}>
                      <span className="font-medium">{comp.name}</span>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary" data-testid={`badge-similarity-${i}`}>{comp.similarityScore}%</Badge>
                        <span className="text-xs text-muted-foreground">{comp.differentiator}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

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

      {filtered.length === 0 ? (
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
                {safeArray(colorAssets).map((asset: any) => (
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
              {safeArray(otherAssets).map((asset: any) => (
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

      <CollapsibleToolbox title="AI Brand Tools" toolCount={15} open={aiToolsOpen} onOpenChange={setAiToolsOpen}>
      <div className="space-y-3">
      <div className="border rounded-md overflow-visible">
        <button
          className="flex items-center gap-2 w-full p-4 text-left"
          onClick={() => setShowPersonalBrandAI(!showPersonalBrandAI)}
          data-testid="button-toggle-personal-brand-ai"
        >
          <Sparkles className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-semibold">AI Personal Brand Suite</span>
          <Badge variant="outline" className="text-[10px]">10 tools</Badge>
          {showPersonalBrandAI ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showPersonalBrandAI && (
          <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(aiBrandAuditLoading || aiBrandAudit) && (
              <Card data-testid="card-ai-brand-audit">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Brand Audit</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiBrandAuditLoading ? <Skeleton className="h-24 w-full" /> : aiBrandAudit && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiBrandAudit.strategies || aiBrandAudit.tips || aiBrandAudit.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiElevPitchLoading || aiElevPitch) && (
              <Card data-testid="card-ai-elev-pitch">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Elevator Pitch</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiElevPitchLoading ? <Skeleton className="h-24 w-full" /> : aiElevPitch && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiElevPitch.strategies || aiElevPitch.tips || aiElevPitch.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiPressKitPBLoading || aiPressKitPB) && (
              <Card data-testid="card-ai-press-kit">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Press Kit</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiPressKitPBLoading ? <Skeleton className="h-24 w-full" /> : aiPressKitPB && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiPressKitPB.strategies || aiPressKitPB.tips || aiPressKitPB.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiSpeakerBioLoading || aiSpeakerBio) && (
              <Card data-testid="card-ai-speaker-bio">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Speaker Bio</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiSpeakerBioLoading ? <Skeleton className="h-24 w-full" /> : aiSpeakerBio && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiSpeakerBio.strategies || aiSpeakerBio.tips || aiSpeakerBio.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiLIProfileLoading || aiLIProfile) && (
              <Card data-testid="card-ai-li-profile">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI LinkedIn Profile</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiLIProfileLoading ? <Skeleton className="h-24 w-full" /> : aiLIProfile && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiLIProfile.strategies || aiLIProfile.tips || aiLIProfile.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiPersWebLoading || aiPersWeb) && (
              <Card data-testid="card-ai-pers-web">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Personal Website</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiPersWebLoading ? <Skeleton className="h-24 w-full" /> : aiPersWeb && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiPersWeb.strategies || aiPersWeb.tips || aiPersWeb.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiThoughtLeadLoading || aiThoughtLead) && (
              <Card data-testid="card-ai-thought-lead">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Thought Leadership</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiThoughtLeadLoading ? <Skeleton className="h-24 w-full" /> : aiThoughtLead && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiThoughtLead.strategies || aiThoughtLead.tips || aiThoughtLead.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiPubSpeakLoading || aiPubSpeak) && (
              <Card data-testid="card-ai-pub-speak">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Public Speaking</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiPubSpeakLoading ? <Skeleton className="h-24 w-full" /> : aiPubSpeak && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiPubSpeak.strategies || aiPubSpeak.tips || aiPubSpeak.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiNetworkStratLoading || aiNetworkStrat) && (
              <Card data-testid="card-ai-network-strat">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Networking Strategy</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiNetworkStratLoading ? <Skeleton className="h-24 w-full" /> : aiNetworkStrat && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiNetworkStrat.strategies || aiNetworkStrat.tips || aiNetworkStrat.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiRepMonitorLoading || aiRepMonitor) && (
              <Card data-testid="card-ai-rep-monitor">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Reputation Monitor</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiRepMonitorLoading ? <Skeleton className="h-24 w-full" /> : aiRepMonitor && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiRepMonitor.strategies || aiRepMonitor.tips || aiRepMonitor.recommendations)}
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

export default BrandTab;
