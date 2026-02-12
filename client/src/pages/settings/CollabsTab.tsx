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
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, Plus, Users, Link as LinkIcon, ChevronDown, ChevronUp } from "lucide-react";
import { CollapsibleToolbox } from "@/components/CollapsibleToolbox";

type AIResponse = Record<string, unknown> | null;

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
  const [aiCollab, setAiCollab] = useState<AIResponse>(null);
  const [aiCollabLoading, setAiCollabLoading] = useState(true);

  const [showCollabSuiteAI, setShowCollabSuiteAI] = useState(false);
  const [aiCollabMatch, setAiCollabMatch] = useState<AIResponse>(null);
  const [aiCollabMatchLoading, setAiCollabMatchLoading] = useState(false);
  const [aiCollabContract, setAiCollabContract] = useState<AIResponse>(null);
  const [aiCollabContractLoading, setAiCollabContractLoading] = useState(false);
  const [aiCollabRev, setAiCollabRev] = useState<AIResponse>(null);
  const [aiCollabRevLoading, setAiCollabRevLoading] = useState(false);
  const [aiCollabIdeas, setAiCollabIdeas] = useState<AIResponse>(null);
  const [aiCollabIdeasLoading, setAiCollabIdeasLoading] = useState(false);
  const [aiCollabOutreach, setAiCollabOutreach] = useState<AIResponse>(null);
  const [aiCollabOutreachLoading, setAiCollabOutreachLoading] = useState(false);
  const [aiCollabPerf, setAiCollabPerf] = useState<AIResponse>(null);
  const [aiCollabPerfLoading, setAiCollabPerfLoading] = useState(false);
  const [aiNetworkEff, setAiNetworkEff] = useState<AIResponse>(null);
  const [aiNetworkEffLoading, setAiNetworkEffLoading] = useState(false);

  useEffect(() => {
    const cached = sessionStorage.getItem("aiCollabMatchmaker");
    if (cached) {
      try { setAiCollab(JSON.parse(cached)); setAiCollabLoading(false); return; } catch {}
    }
    apiRequest("POST", "/api/ai/collab-matchmaker")
      .then((res) => res.json())
      .then((data) => { setAiCollab(data); sessionStorage.setItem("aiCollabMatchmaker", JSON.stringify({ data: data, ts: Date.now() })); })
      .catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); })
      .finally(() => setAiCollabLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_collab_match2");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiCollabMatch(e.data); return; } else { sessionStorage.removeItem("ai_collab_match2"); } } catch {} }
    setAiCollabMatchLoading(true);
    apiRequest("POST", "/api/ai/collab-match", {}).then(r => r.json()).then(d => { setAiCollabMatch(d); sessionStorage.setItem("ai_collab_match2", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiCollabMatchLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_collab_contract");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiCollabContract(e.data); return; } else { sessionStorage.removeItem("ai_collab_contract"); } } catch {} }
    setAiCollabContractLoading(true);
    apiRequest("POST", "/api/ai/collab-contract", {}).then(r => r.json()).then(d => { setAiCollabContract(d); sessionStorage.setItem("ai_collab_contract", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiCollabContractLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_collab_rev");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiCollabRev(e.data); return; } else { sessionStorage.removeItem("ai_collab_rev"); } } catch {} }
    setAiCollabRevLoading(true);
    apiRequest("POST", "/api/ai/collab-revenue", {}).then(r => r.json()).then(d => { setAiCollabRev(d); sessionStorage.setItem("ai_collab_rev", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiCollabRevLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_collab_ideas");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiCollabIdeas(e.data); return; } else { sessionStorage.removeItem("ai_collab_ideas"); } } catch {} }
    setAiCollabIdeasLoading(true);
    apiRequest("POST", "/api/ai/collab-ideas", {}).then(r => r.json()).then(d => { setAiCollabIdeas(d); sessionStorage.setItem("ai_collab_ideas", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiCollabIdeasLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_collab_outreach");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiCollabOutreach(e.data); return; } else { sessionStorage.removeItem("ai_collab_outreach"); } } catch {} }
    setAiCollabOutreachLoading(true);
    apiRequest("POST", "/api/ai/collab-outreach", {}).then(r => r.json()).then(d => { setAiCollabOutreach(d); sessionStorage.setItem("ai_collab_outreach", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiCollabOutreachLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_collab_perf");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiCollabPerf(e.data); return; } else { sessionStorage.removeItem("ai_collab_perf"); } } catch {} }
    setAiCollabPerfLoading(true);
    apiRequest("POST", "/api/ai/collab-performance", {}).then(r => r.json()).then(d => { setAiCollabPerf(d); sessionStorage.setItem("ai_collab_perf", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiCollabPerfLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_network_eff");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiNetworkEff(e.data); return; } else { sessionStorage.removeItem("ai_network_eff"); } } catch {} }
    setAiNetworkEffLoading(true);
    apiRequest("POST", "/api/ai/network-effect", {}).then(r => r.json()).then(d => { setAiNetworkEff(d); sessionStorage.setItem("ai_network_eff", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiNetworkEffLoading(false));
  }, []);

  const renderAIList = (arr: any[] | undefined, limit = 5) => {
    if (!arr || !Array.isArray(arr) || arr.length === 0) return <p className="text-xs text-muted-foreground italic">No results available</p>;
    return arr.slice(0, limit).map((item: any, i: number) => (
      <p key={i}>{typeof item === "string" ? item : item.title || item.name || item.description || item.text || item.label || JSON.stringify(item)}</p>
    ));
  };

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
      {aiCollabLoading ? (
        <Skeleton className="h-64 rounded-xl" data-testid="skeleton-ai-collab" />
      ) : aiCollab ? (
        <Card data-testid="card-ai-collab-matchmaker">
          <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap space-y-0 pb-2">
            <CardTitle className="text-base flex items-center gap-2 flex-wrap">
              <Sparkles className="h-4 w-4 text-primary" />
              AI Collab Matchmaker
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {aiCollab.idealPartnerTypes?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Ideal Partner Types</p>
                <div className="space-y-3">
                  {aiCollab.idealPartnerTypes.map((p: any, i: number) => (
                    <div key={i} className="bg-muted/50 rounded-md p-3 space-y-1" data-testid={`partner-type-${i}`}>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <p className="text-sm font-medium">{p.type}</p>
                        {p.audienceSize && <Badge variant="secondary" className="text-xs no-default-hover-elevate no-default-active-elevate">{p.audienceSize}</Badge>}
                      </div>
                      {p.nicheOverlap && <p className="text-xs text-muted-foreground">Niche Overlap: {p.nicheOverlap}</p>}
                      {p.collabFormat && <p className="text-xs text-muted-foreground">Format: {p.collabFormat}</p>}
                      {p.expectedBenefit && <p className="text-xs text-emerald-500">Benefit: {p.expectedBenefit}</p>}
                      {p.outreachTemplate && (
                        <div className="mt-1">
                          <p className="text-xs font-medium text-muted-foreground">Outreach Template</p>
                          <p className="text-xs text-muted-foreground italic">{p.outreachTemplate}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {aiCollab.collabFormats?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Collab Formats</p>
                <div className="grid gap-2">
                  {aiCollab.collabFormats.map((f: any, i: number) => (
                    <div key={i} className="flex items-center justify-between gap-2 flex-wrap" data-testid={`collab-format-${i}`}>
                      <div>
                        <p className="text-sm font-medium">{f.formatName || f.name}</p>
                        {f.description && <p className="text-xs text-muted-foreground">{f.description}</p>}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {f.effortLevel && <Badge variant="secondary" className="text-xs no-default-hover-elevate no-default-active-elevate">{f.effortLevel}</Badge>}
                        {f.impact && <Badge variant="secondary" className="text-xs bg-emerald-500/10 text-emerald-500 no-default-hover-elevate no-default-active-elevate">{f.impact}</Badge>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {aiCollab.networkingTips?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Networking Tips</p>
                <ul className="text-xs text-muted-foreground space-y-0.5 pl-4 list-disc">
                  {aiCollab.networkingTips.map((tip: string, i: number) => <li key={i} data-testid={`networking-tip-${i}`}>{tip}</li>)}
                </ul>
              </div>
            )}
            {aiCollab.collabCalendar && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Collab Calendar Suggestion</p>
                <p className="text-sm" data-testid="text-collab-calendar">{typeof aiCollab.collabCalendar === "string" ? aiCollab.collabCalendar : JSON.stringify(aiCollab.collabCalendar)}</p>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

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

      <CollapsibleToolbox title="AI Collaboration Tools" toolCount={15}>
      <div className="space-y-3">
      <div className="border rounded-md overflow-visible">
        <button
          className="flex items-center gap-2 w-full p-4 text-left"
          onClick={() => setShowCollabSuiteAI(!showCollabSuiteAI)}
          data-testid="button-toggle-collab-suite-ai"
        >
          <Sparkles className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-semibold">AI Collaboration Suite</span>
          <Badge variant="outline" className="text-[10px]">7 tools</Badge>
          {showCollabSuiteAI ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showCollabSuiteAI && (
          <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(aiCollabMatchLoading || aiCollabMatch) && (
              <Card data-testid="card-ai-collab-match2">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Collab Match</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCollabMatchLoading ? <Skeleton className="h-24 w-full" /> : aiCollabMatch && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiCollabMatch.matches || aiCollabMatch.partners || aiCollabMatch.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCollabContractLoading || aiCollabContract) && (
              <Card data-testid="card-ai-collab-contract">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Collab Contract</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCollabContractLoading ? <Skeleton className="h-24 w-full" /> : aiCollabContract && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiCollabContract.clauses || aiCollabContract.terms || aiCollabContract.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCollabRevLoading || aiCollabRev) && (
              <Card data-testid="card-ai-collab-rev">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Collab Revenue</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCollabRevLoading ? <Skeleton className="h-24 w-full" /> : aiCollabRev && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiCollabRev.revenue || aiCollabRev.splits || aiCollabRev.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCollabIdeasLoading || aiCollabIdeas) && (
              <Card data-testid="card-ai-collab-ideas">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Collab Ideas</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCollabIdeasLoading ? <Skeleton className="h-24 w-full" /> : aiCollabIdeas && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiCollabIdeas.ideas || aiCollabIdeas.concepts || aiCollabIdeas.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCollabOutreachLoading || aiCollabOutreach) && (
              <Card data-testid="card-ai-collab-outreach">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Collab Outreach</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCollabOutreachLoading ? <Skeleton className="h-24 w-full" /> : aiCollabOutreach && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiCollabOutreach.templates || aiCollabOutreach.messages || aiCollabOutreach.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCollabPerfLoading || aiCollabPerf) && (
              <Card data-testid="card-ai-collab-perf">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Collab Performance</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCollabPerfLoading ? <Skeleton className="h-24 w-full" /> : aiCollabPerf && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiCollabPerf.metrics || aiCollabPerf.performance || aiCollabPerf.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiNetworkEffLoading || aiNetworkEff) && (
              <Card data-testid="card-ai-network-eff">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Network Effect</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiNetworkEffLoading ? <Skeleton className="h-24 w-full" /> : aiNetworkEff && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiNetworkEff.effects || aiNetworkEff.growth || aiNetworkEff.recommendations)}
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

export default CollabsTab;
