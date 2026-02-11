import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Radio, Plus, Trash2, Zap, Sparkles, Loader2, Image, Play, Square, CheckCircle2, XCircle, Clock, ArrowRight, Wifi, WifiOff, Check, ChevronDown, ChevronUp } from "lucide-react";
import { PLATFORM_INFO, type Platform, PLATFORMS } from "@shared/schema";
import type { StreamDestination, Stream, Channel } from "@shared/schema";
import { PlatformIcon } from "@/components/PlatformIcon";

export default function StreamCenter() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showAddDest, setShowAddDest] = useState(false);
  const [showNewStream, setShowNewStream] = useState(false);
  const [newDest, setNewDest] = useState({ platform: "youtube", label: "", rtmpUrl: "", streamKey: "" });
  const [newStream, setNewStream] = useState({ title: "", description: "", category: "Gaming", platforms: [] as string[] });
  const [aiStreamRecs, setAiStreamRecs] = useState<any>(null);
  const [aiStreamRecsLoading, setAiStreamRecsLoading] = useState(true);
  const [aiChatBot, setAiChatBot] = useState<any>(null);
  const [aiChatBotLoading, setAiChatBotLoading] = useState(true);
  const [aiChecklist, setAiChecklist] = useState<any>(null);
  const [aiChecklistLoading, setAiChecklistLoading] = useState(true);
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  const [aiRaid, setAiRaid] = useState<any>(null);
  const [aiRaidLoading, setAiRaidLoading] = useState(true);
  const [aiPostReport, setAiPostReport] = useState<any>(null);
  const [aiPostReportLoading, setAiPostReportLoading] = useState(false);
  const [showStreamAI, setShowStreamAI] = useState(false);
  const [aiStreamTitles, setAiStreamTitles] = useState<any>(null);
  const [aiStreamTitlesLoading, setAiStreamTitlesLoading] = useState(false);
  const [aiStreamSchedule, setAiStreamSchedule] = useState<any>(null);
  const [aiStreamScheduleLoading, setAiStreamScheduleLoading] = useState(false);
  const [aiStreamOverlays, setAiStreamOverlays] = useState<any>(null);
  const [aiStreamOverlaysLoading, setAiStreamOverlaysLoading] = useState(false);
  const [aiStreamAlerts, setAiStreamAlerts] = useState<any>(null);
  const [aiStreamAlertsLoading, setAiStreamAlertsLoading] = useState(false);
  const [aiStreamMod, setAiStreamMod] = useState<any>(null);
  const [aiStreamModLoading, setAiStreamModLoading] = useState(false);
  const [aiStreamInteract, setAiStreamInteract] = useState<any>(null);
  const [aiStreamInteractLoading, setAiStreamInteractLoading] = useState(false);
  const [aiStreamRev, setAiStreamRev] = useState<any>(null);
  const [aiStreamRevLoading, setAiStreamRevLoading] = useState(false);
  const [aiStreamClips, setAiStreamClips] = useState<any>(null);
  const [aiStreamClipsLoading, setAiStreamClipsLoading] = useState(false);
  const [aiStreamCats, setAiStreamCats] = useState<any>(null);
  const [aiStreamCatsLoading, setAiStreamCatsLoading] = useState(false);
  const [aiStreamPanels, setAiStreamPanels] = useState<any>(null);
  const [aiStreamPanelsLoading, setAiStreamPanelsLoading] = useState(false);
  const [aiStreamEmotes, setAiStreamEmotes] = useState<any>(null);
  const [aiStreamEmotesLoading, setAiStreamEmotesLoading] = useState(false);
  const [aiStreamSubGoals, setAiStreamSubGoals] = useState<any>(null);
  const [aiStreamSubGoalsLoading, setAiStreamSubGoalsLoading] = useState(false);
  const [aiStreamNetwork, setAiStreamNetwork] = useState<any>(null);
  const [aiStreamNetworkLoading, setAiStreamNetworkLoading] = useState(false);
  const [aiStreamAnalyticsExp, setAiStreamAnalyticsExp] = useState<any>(null);
  const [aiStreamAnalyticsExpLoading, setAiStreamAnalyticsExpLoading] = useState(false);
  const [aiMultiStream, setAiMultiStream] = useState<any>(null);
  const [aiMultiStreamLoading, setAiMultiStreamLoading] = useState(false);
  const [aiStreamBackup, setAiStreamBackup] = useState<any>(null);
  const [aiStreamBackupLoading, setAiStreamBackupLoading] = useState(false);
  const [aiStreamCommunity, setAiStreamCommunity] = useState<any>(null);
  const [aiStreamCommunityLoading, setAiStreamCommunityLoading] = useState(false);
  const [aiStreamBranding, setAiStreamBranding] = useState<any>(null);
  const [aiStreamBrandingLoading, setAiStreamBrandingLoading] = useState(false);
  const [aiStreamCalendar, setAiStreamCalendar] = useState<any>(null);
  const [aiStreamCalendarLoading, setAiStreamCalendarLoading] = useState(false);
  const [aiStreamGrowth, setAiStreamGrowth] = useState<any>(null);
  const [aiStreamGrowthLoading, setAiStreamGrowthLoading] = useState(false);

  useEffect(() => {
    const cached = sessionStorage.getItem("aiStreamRecs");
    if (cached) {
      try {
        setAiStreamRecs(JSON.parse(cached));
        setAiStreamRecsLoading(false);
        return;
      } catch {}
    }
    (async () => {
      try {
        const res = await apiRequest("POST", "/api/ai/stream-recommendations");
        const data = await res.json();
        setAiStreamRecs(data);
        sessionStorage.setItem("aiStreamRecs", JSON.stringify(data));
      } catch {
        setAiStreamRecs(null);
      } finally {
        setAiStreamRecsLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    const cached = sessionStorage.getItem("aiChatBotConfig");
    if (cached) {
      try { setAiChatBot(JSON.parse(cached)); setAiChatBotLoading(false); return; } catch {}
    }
    (async () => {
      try {
        const res = await apiRequest("POST", "/api/ai/chatbot-config", {});
        const data = await res.json();
        setAiChatBot(data);
        sessionStorage.setItem("aiChatBotConfig", JSON.stringify(data));
      } catch { setAiChatBot(null); } finally { setAiChatBotLoading(false); }
    })();
  }, []);

  useEffect(() => {
    const cached = sessionStorage.getItem("aiStreamChecklist");
    if (cached) {
      try { setAiChecklist(JSON.parse(cached)); setAiChecklistLoading(false); return; } catch {}
    }
    (async () => {
      try {
        const res = await apiRequest("POST", "/api/ai/stream-checklist", {});
        const data = await res.json();
        setAiChecklist(data);
        sessionStorage.setItem("aiStreamChecklist", JSON.stringify(data));
      } catch { setAiChecklist(null); } finally { setAiChecklistLoading(false); }
    })();
  }, []);

  useEffect(() => {
    const cached = sessionStorage.getItem("aiRaidStrategy");
    if (cached) {
      try { setAiRaid(JSON.parse(cached)); setAiRaidLoading(false); return; } catch {}
    }
    (async () => {
      try {
        const res = await apiRequest("POST", "/api/ai/raid-strategy", {});
        const data = await res.json();
        setAiRaid(data);
        sessionStorage.setItem("aiRaidStrategy", JSON.stringify(data));
      } catch { setAiRaid(null); } finally { setAiRaidLoading(false); }
    })();
  }, []);

  useEffect(() => {
    const cached = sessionStorage.getItem("ai_stream_titles");
    if (cached) { try { setAiStreamTitles(JSON.parse(cached)); return; } catch {} }
    setAiStreamTitlesLoading(true);
    apiRequest("POST", "/api/ai/stream-titles", {}).then(r => r.json()).then(d => { setAiStreamTitles(d); sessionStorage.setItem("ai_stream_titles", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiStreamTitlesLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_stream_schedule");
    if (cached) { try { setAiStreamSchedule(JSON.parse(cached)); return; } catch {} }
    setAiStreamScheduleLoading(true);
    apiRequest("POST", "/api/ai/stream-schedule", {}).then(r => r.json()).then(d => { setAiStreamSchedule(d); sessionStorage.setItem("ai_stream_schedule", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiStreamScheduleLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_stream_overlays");
    if (cached) { try { setAiStreamOverlays(JSON.parse(cached)); return; } catch {} }
    setAiStreamOverlaysLoading(true);
    apiRequest("POST", "/api/ai/stream-overlays", {}).then(r => r.json()).then(d => { setAiStreamOverlays(d); sessionStorage.setItem("ai_stream_overlays", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiStreamOverlaysLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_stream_alerts");
    if (cached) { try { setAiStreamAlerts(JSON.parse(cached)); return; } catch {} }
    setAiStreamAlertsLoading(true);
    apiRequest("POST", "/api/ai/stream-alerts", {}).then(r => r.json()).then(d => { setAiStreamAlerts(d); sessionStorage.setItem("ai_stream_alerts", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiStreamAlertsLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_stream_mod");
    if (cached) { try { setAiStreamMod(JSON.parse(cached)); return; } catch {} }
    setAiStreamModLoading(true);
    apiRequest("POST", "/api/ai/stream-moderation", {}).then(r => r.json()).then(d => { setAiStreamMod(d); sessionStorage.setItem("ai_stream_mod", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiStreamModLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_stream_interact");
    if (cached) { try { setAiStreamInteract(JSON.parse(cached)); return; } catch {} }
    setAiStreamInteractLoading(true);
    apiRequest("POST", "/api/ai/stream-interactions", {}).then(r => r.json()).then(d => { setAiStreamInteract(d); sessionStorage.setItem("ai_stream_interact", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiStreamInteractLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_stream_rev");
    if (cached) { try { setAiStreamRev(JSON.parse(cached)); return; } catch {} }
    setAiStreamRevLoading(true);
    apiRequest("POST", "/api/ai/stream-revenue", {}).then(r => r.json()).then(d => { setAiStreamRev(d); sessionStorage.setItem("ai_stream_rev", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiStreamRevLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_stream_clips");
    if (cached) { try { setAiStreamClips(JSON.parse(cached)); return; } catch {} }
    setAiStreamClipsLoading(true);
    apiRequest("POST", "/api/ai/stream-clips", {}).then(r => r.json()).then(d => { setAiStreamClips(d); sessionStorage.setItem("ai_stream_clips", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiStreamClipsLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_stream_cats");
    if (cached) { try { setAiStreamCats(JSON.parse(cached)); return; } catch {} }
    setAiStreamCatsLoading(true);
    apiRequest("POST", "/api/ai/stream-categories", {}).then(r => r.json()).then(d => { setAiStreamCats(d); sessionStorage.setItem("ai_stream_cats", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiStreamCatsLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_stream_panels");
    if (cached) { try { setAiStreamPanels(JSON.parse(cached)); return; } catch {} }
    setAiStreamPanelsLoading(true);
    apiRequest("POST", "/api/ai/stream-panels", {}).then(r => r.json()).then(d => { setAiStreamPanels(d); sessionStorage.setItem("ai_stream_panels", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiStreamPanelsLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_stream_emotes");
    if (cached) { try { setAiStreamEmotes(JSON.parse(cached)); return; } catch {} }
    setAiStreamEmotesLoading(true);
    apiRequest("POST", "/api/ai/stream-emotes", {}).then(r => r.json()).then(d => { setAiStreamEmotes(d); sessionStorage.setItem("ai_stream_emotes", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiStreamEmotesLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_stream_sub_goals");
    if (cached) { try { setAiStreamSubGoals(JSON.parse(cached)); return; } catch {} }
    setAiStreamSubGoalsLoading(true);
    apiRequest("POST", "/api/ai/stream-sub-goals", {}).then(r => r.json()).then(d => { setAiStreamSubGoals(d); sessionStorage.setItem("ai_stream_sub_goals", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiStreamSubGoalsLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_stream_network");
    if (cached) { try { setAiStreamNetwork(JSON.parse(cached)); return; } catch {} }
    setAiStreamNetworkLoading(true);
    apiRequest("POST", "/api/ai/stream-networking", {}).then(r => r.json()).then(d => { setAiStreamNetwork(d); sessionStorage.setItem("ai_stream_network", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiStreamNetworkLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_stream_analytics_exp");
    if (cached) { try { setAiStreamAnalyticsExp(JSON.parse(cached)); return; } catch {} }
    setAiStreamAnalyticsExpLoading(true);
    apiRequest("POST", "/api/ai/stream-analytics-explainer", {}).then(r => r.json()).then(d => { setAiStreamAnalyticsExp(d); sessionStorage.setItem("ai_stream_analytics_exp", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiStreamAnalyticsExpLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_multi_stream");
    if (cached) { try { setAiMultiStream(JSON.parse(cached)); return; } catch {} }
    setAiMultiStreamLoading(true);
    apiRequest("POST", "/api/ai/multi-stream", {}).then(r => r.json()).then(d => { setAiMultiStream(d); sessionStorage.setItem("ai_multi_stream", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiMultiStreamLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_stream_backup");
    if (cached) { try { setAiStreamBackup(JSON.parse(cached)); return; } catch {} }
    setAiStreamBackupLoading(true);
    apiRequest("POST", "/api/ai/stream-backup", {}).then(r => r.json()).then(d => { setAiStreamBackup(d); sessionStorage.setItem("ai_stream_backup", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiStreamBackupLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_stream_community");
    if (cached) { try { setAiStreamCommunity(JSON.parse(cached)); return; } catch {} }
    setAiStreamCommunityLoading(true);
    apiRequest("POST", "/api/ai/stream-community", {}).then(r => r.json()).then(d => { setAiStreamCommunity(d); sessionStorage.setItem("ai_stream_community", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiStreamCommunityLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_stream_branding");
    if (cached) { try { setAiStreamBranding(JSON.parse(cached)); return; } catch {} }
    setAiStreamBrandingLoading(true);
    apiRequest("POST", "/api/ai/stream-branding", {}).then(r => r.json()).then(d => { setAiStreamBranding(d); sessionStorage.setItem("ai_stream_branding", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiStreamBrandingLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_stream_calendar");
    if (cached) { try { setAiStreamCalendar(JSON.parse(cached)); return; } catch {} }
    setAiStreamCalendarLoading(true);
    apiRequest("POST", "/api/ai/stream-content-calendar", {}).then(r => r.json()).then(d => { setAiStreamCalendar(d); sessionStorage.setItem("ai_stream_calendar", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiStreamCalendarLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_stream_growth");
    if (cached) { try { setAiStreamGrowth(JSON.parse(cached)); return; } catch {} }
    setAiStreamGrowthLoading(true);
    apiRequest("POST", "/api/ai/stream-growth", {}).then(r => r.json()).then(d => { setAiStreamGrowth(d); sessionStorage.setItem("ai_stream_growth", JSON.stringify(d)); }).catch(() => {}).finally(() => setAiStreamGrowthLoading(false));
  }, []);

  const { data: destinations = [] } = useQuery<StreamDestination[]>({ queryKey: ["/api/stream-destinations"] });
  const { data: streamList = [], isLoading: streamsLoading } = useQuery<Stream[]>({ queryKey: ["/api/streams"] });
  const { data: connectedChannels = [] } = useQuery<Channel[]>({ queryKey: ["/api/channels"] });

  const liveStream = streamList.find(s => s.status === 'live');
  const plannedStreams = streamList.filter(s => s.status === 'planned');
  const pastStreams = streamList.filter(s => s.status === 'ended' || s.status === 'processed');

  const createDest = useMutation({
    mutationFn: async (data: any) => { const res = await apiRequest("POST", "/api/stream-destinations", data); return res.json(); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/stream-destinations"] }); setShowAddDest(false); setNewDest({ platform: "youtube", label: "", rtmpUrl: "", streamKey: "" }); toast({ title: "Destination added" }); },
  });

  const deleteDest = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/stream-destinations/${id}`); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/stream-destinations"] }); toast({ title: "Removed" }); },
  });

  const toggleDest = useMutation({
    mutationFn: async ({ id, enabled }: { id: number; enabled: boolean }) => { const res = await apiRequest("PUT", `/api/stream-destinations/${id}`, { enabled }); return res.json(); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/stream-destinations"] }); },
  });

  const createStream = useMutation({
    mutationFn: async (data: any) => { const res = await apiRequest("POST", "/api/streams", data); return res.json(); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/streams"] }); setShowNewStream(false); setNewStream({ title: "", description: "", category: "Gaming", platforms: [] }); toast({ title: "Stream created" }); },
  });

  const goLive = useMutation({
    mutationFn: async (id: number) => { const res = await apiRequest("POST", `/api/streams/${id}/go-live`, {}); return res.json(); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/streams"] }); toast({ title: "You're LIVE!" }); },
  });

  const endStream = useMutation({
    mutationFn: async (id: number) => { const res = await apiRequest("POST", `/api/streams/${id}/end`, {}); return res.json(); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/streams"] }); toast({ title: "Stream ended" }); },
  });

  const optimizeSeo = useMutation({
    mutationFn: async (id: number) => { const res = await apiRequest("POST", `/api/streams/${id}/optimize`, {}); return res.json(); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/streams"] }); toast({ title: "SEO optimized" }); },
  });

  const postProcess = useMutation({
    mutationFn: async (id: number) => { const res = await apiRequest("POST", `/api/streams/${id}/post-process`, {}); return res.json(); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/streams"] }); toast({ title: "Post-processed" }); },
  });

  const generateThumbnail = useMutation({
    mutationFn: async (data: { streamId: number; title: string; description?: string }) => { const res = await apiRequest("POST", "/api/thumbnails/generate", data); return res.json(); },
    onSuccess: () => { toast({ title: "Thumbnail generated" }); },
  });

  const toggleCheckItem = (key: string) => {
    setCheckedItems(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const generatePostReport = async (stream: Stream) => {
    setAiPostReportLoading(true);
    try {
      const duration = stream.startedAt && stream.endedAt
        ? `${Math.round((new Date(stream.endedAt).getTime() - new Date(stream.startedAt).getTime()) / 60000)} minutes`
        : "unknown";
      const res = await apiRequest("POST", "/api/ai/post-stream-report", { streamTitle: stream.title, duration });
      const data = await res.json();
      setAiPostReport(data);
    } catch {
      setAiPostReport(null);
      toast({ title: "Failed to generate report", variant: "destructive" });
    } finally {
      setAiPostReportLoading(false);
    }
  };

  const toggleStreamPlatform = (platform: string) => {
    setNewStream(prev => ({
      ...prev,
      platforms: prev.platforms.includes(platform) ? prev.platforms.filter(p => p !== platform) : [...prev.platforms, platform],
    }));
  };

  const renderAIList = (arr: any[] | undefined, limit = 5) => {
    if (!arr || !Array.isArray(arr) || arr.length === 0) return null;
    return arr.slice(0, limit).map((item: any, i: number) => (
      <p key={i}>{typeof item === "string" ? item : item.title || item.name || item.description || item.text || item.label || JSON.stringify(item)}</p>
    ));
  };

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 data-testid="text-page-title" className="text-2xl font-display font-bold">Stream Center</h1>
        <div className="flex items-center gap-2">
          <Dialog open={showAddDest} onOpenChange={setShowAddDest}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-destination" variant="outline" size="sm"><Plus className="h-3.5 w-3.5 mr-1.5" />Destination</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Destination</DialogTitle></DialogHeader>
              <div className="space-y-3 mt-2">
                <div>
                  <label className="text-sm font-medium">Platform</label>
                  <Select value={newDest.platform} onValueChange={(val) => setNewDest(prev => ({ ...prev, platform: val, rtmpUrl: PLATFORM_INFO[val as Platform]?.rtmpUrlTemplate || "" }))}>
                    <SelectTrigger data-testid="select-dest-platform"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PLATFORMS.map(p => (
                        <SelectItem key={p} value={p}>{PLATFORM_INFO[p].label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div><label className="text-sm font-medium">Label</label><Input data-testid="input-dest-label" placeholder="e.g., Main YouTube" value={newDest.label} onChange={(e) => setNewDest(prev => ({ ...prev, label: e.target.value }))} /></div>
                <div><label className="text-sm font-medium">RTMP URL</label><Input data-testid="input-dest-rtmp" placeholder="rtmp://..." value={newDest.rtmpUrl} onChange={(e) => setNewDest(prev => ({ ...prev, rtmpUrl: e.target.value }))} /></div>
                <div><label className="text-sm font-medium">Stream Key</label><Input data-testid="input-dest-key" type="password" placeholder="Your stream key" value={newDest.streamKey} onChange={(e) => setNewDest(prev => ({ ...prev, streamKey: e.target.value }))} /></div>
                <Button data-testid="button-save-destination" className="w-full" onClick={() => createDest.mutate(newDest)} disabled={!newDest.label || !newDest.rtmpUrl || createDest.isPending}>
                  {createDest.isPending ? "Saving..." : "Add"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={showNewStream} onOpenChange={setShowNewStream}>
            <DialogTrigger asChild>
              <Button data-testid="button-new-stream" size="sm"><Zap className="h-3.5 w-3.5 mr-1.5" />New Stream</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Plan Stream</DialogTitle></DialogHeader>
              <div className="space-y-3 mt-2">
                <div><label className="text-sm font-medium">Title</label><Input data-testid="input-stream-title" placeholder="Friday Night Gaming" value={newStream.title} onChange={(e) => setNewStream(prev => ({ ...prev, title: e.target.value }))} /></div>
                <div><label className="text-sm font-medium">Description</label><Textarea data-testid="input-stream-description" placeholder="What's the stream about?" value={newStream.description} onChange={(e) => setNewStream(prev => ({ ...prev, description: e.target.value }))} className="resize-none" /></div>
                <div>
                  <label className="text-sm font-medium">Category</label>
                  <Select value={newStream.category} onValueChange={(val) => setNewStream(prev => ({ ...prev, category: val }))}>
                    <SelectTrigger data-testid="select-stream-category"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["Gaming", "IRL", "Creative", "Music", "Education"].map(c => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Platforms</label>
                  <div className="flex flex-wrap gap-1.5">
                    {PLATFORMS.map(p => (
                      <Badge key={p} data-testid={`toggle-platform-${p}`} className="cursor-pointer toggle-elevate" variant={newStream.platforms.includes(p) ? "default" : "outline"} onClick={() => toggleStreamPlatform(p)}>
                        <PlatformIcon platform={p} className="h-3 w-3 mr-1" />{PLATFORM_INFO[p].label}
                      </Badge>
                    ))}
                  </div>
                </div>
                <Button data-testid="button-create-stream" className="w-full" onClick={() => createStream.mutate(newStream)} disabled={!newStream.title || newStream.platforms.length === 0 || createStream.isPending}>
                  {createStream.isPending ? "Creating..." : "Create"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card data-testid="card-ai-stream-recs">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Sparkles className="h-4 w-4 text-amber-500" />
            <CardTitle className="text-sm font-medium">AI Stream Advisor</CardTitle>
            <Badge variant="secondary">Auto-running</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {aiStreamRecsLoading ? (
            <div className="space-y-3" data-testid="skeleton-ai-stream-recs">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : aiStreamRecs ? (
            <div className="space-y-5">
              {aiStreamRecs.optimalTimes?.length > 0 && (
                <div className="space-y-2">
                  <h3 data-testid="text-best-times-heading" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Best Times to Stream</h3>
                  <div className="space-y-1.5">
                    {aiStreamRecs.optimalTimes.map((t: any, i: number) => (
                      <div key={i} data-testid={`text-optimal-time-${i}`} className="flex items-start gap-2 text-sm">
                        <Clock className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                        <span><span className="font-medium">{t.day}</span> at <span className="font-medium">{t.time}</span> — <span className="text-muted-foreground">{t.reason}</span></span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {aiStreamRecs.trendingTopics?.length > 0 && (
                <div className="space-y-2">
                  <h3 data-testid="text-trending-topics-heading" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Trending Topics</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {aiStreamRecs.trendingTopics.map((topic: any, i: number) => (
                      <div key={i} data-testid={`text-trending-topic-${i}`}>
                        <Badge variant="outline">{typeof topic === 'string' ? topic : topic.topic || topic.title}</Badge>
                        {topic.suggestedTitle && (
                          <p className="text-xs text-muted-foreground mt-0.5 ml-1">{topic.suggestedTitle}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {aiStreamRecs.schedule && (
                <div className="space-y-2">
                  <h3 data-testid="text-schedule-heading" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Recommended Schedule</h3>
                  <div className="text-sm space-y-1">
                    {aiStreamRecs.schedule.recommendedFrequency && (
                      <p data-testid="text-recommended-frequency">Frequency: <span className="font-medium">{aiStreamRecs.schedule.recommendedFrequency}</span></p>
                    )}
                    {aiStreamRecs.schedule.bestDays?.length > 0 && (
                      <div data-testid="text-best-days" className="flex items-center gap-1.5 flex-wrap">
                        <span>Best days:</span>
                        {aiStreamRecs.schedule.bestDays.map((day: string, i: number) => (
                          <Badge key={i} variant="outline" className="text-xs">{day}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {aiStreamRecs.streamIdeas?.length > 0 && (
                <div className="space-y-2">
                  <h3 data-testid="text-stream-ideas-heading" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Stream Ideas</h3>
                  <div className="space-y-2">
                    {aiStreamRecs.streamIdeas.map((idea: any, i: number) => (
                      <div key={i} data-testid={`card-stream-idea-${i}`} className="flex items-center justify-between gap-3 rounded-md border p-3">
                        <div className="min-w-0">
                          <p data-testid={`text-idea-title-${i}`} className="text-sm font-medium">{idea.title}</p>
                          {idea.description && <p data-testid={`text-idea-desc-${i}`} className="text-xs text-muted-foreground mt-0.5">{idea.description}</p>}
                          <div className="flex items-center gap-1 mt-1 flex-wrap">
                            {idea.category && <Badge variant="secondary" className="text-[10px]">{idea.category}</Badge>}
                            {(idea.platforms || []).map((p: string) => (
                              <Badge key={p} variant="outline" className="text-[10px]">{PLATFORM_INFO[p as Platform]?.label || p}</Badge>
                            ))}
                          </div>
                        </div>
                        <Button
                          data-testid={`button-create-idea-${i}`}
                          size="sm"
                          variant="outline"
                          className="shrink-0"
                          onClick={() => createStream.mutate({
                            title: idea.title,
                            description: idea.description || "",
                            category: idea.category || "Gaming",
                            platforms: idea.platforms || [],
                          })}
                          disabled={createStream.isPending}
                        >
                          <Plus className="h-3 w-3 mr-1" />Create
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground" data-testid="text-ai-recs-empty">Unable to load AI recommendations.</p>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-ai-chatbot">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Sparkles className="h-4 w-4 text-amber-500" />
            <CardTitle className="text-sm font-medium">AI Chat Bot Builder</CardTitle>
            <Badge variant="secondary">Auto-running</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {aiChatBotLoading ? (
            <div className="space-y-3" data-testid="skeleton-ai-chatbot">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ) : aiChatBot ? (
            <div className="space-y-5">
              {aiChatBot.commands?.length > 0 && (
                <div className="space-y-2">
                  <h3 data-testid="text-chatbot-commands-heading" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Commands</h3>
                  <div className="space-y-1.5">
                    {aiChatBot.commands.map((cmd: any, i: number) => (
                      <div key={i} data-testid={`text-chatbot-command-${i}`} className="rounded-md border p-2 text-sm space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-xs font-mono">{cmd.trigger}</Badge>
                          {cmd.category && <Badge variant="secondary" className="text-[10px]">{cmd.category}</Badge>}
                          {cmd.cooldown && <span className="text-xs text-muted-foreground">{cmd.cooldown}s cooldown</span>}
                        </div>
                        <p className="text-xs text-muted-foreground">{cmd.response}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {aiChatBot.autoMessages?.length > 0 && (
                <div className="space-y-2">
                  <h3 data-testid="text-chatbot-auto-heading" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Auto Messages</h3>
                  <div className="space-y-1.5">
                    {aiChatBot.autoMessages.map((msg: any, i: number) => (
                      <div key={i} data-testid={`text-chatbot-auto-${i}`} className="flex items-start gap-2 text-sm">
                        <Clock className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                        <span>{msg.message} <span className="text-xs text-muted-foreground">({msg.interval})</span></span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {aiChatBot.moderationRules?.length > 0 && (
                <div className="space-y-2">
                  <h3 data-testid="text-chatbot-moderation-heading" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Moderation Rules</h3>
                  <div className="space-y-1">
                    {aiChatBot.moderationRules.map((rule: any, i: number) => (
                      <p key={i} data-testid={`text-chatbot-rule-${i}`} className="text-sm text-muted-foreground">{typeof rule === 'string' ? rule : rule.rule || rule.description || JSON.stringify(rule)}</p>
                    ))}
                  </div>
                </div>
              )}
              {aiChatBot.loyaltySystem && (
                <div className="space-y-2">
                  <h3 data-testid="text-chatbot-loyalty-heading" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Loyalty System</h3>
                  <div className="text-sm space-y-1">
                    {aiChatBot.loyaltySystem.pointName && <p data-testid="text-loyalty-point-name">Point name: <span className="font-medium">{aiChatBot.loyaltySystem.pointName}</span></p>}
                    {aiChatBot.loyaltySystem.earnRate && <p data-testid="text-loyalty-earn-rate">Earn rate: <span className="font-medium">{aiChatBot.loyaltySystem.earnRate}</span></p>}
                    {aiChatBot.loyaltySystem.rewards?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {aiChatBot.loyaltySystem.rewards.map((r: any, i: number) => (
                          <Badge key={i} variant="outline" className="text-xs">{typeof r === 'string' ? r : r.name || r.reward || JSON.stringify(r)}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
              {(aiChatBot.welcomeMessage || aiChatBot.raidMessage) && (
                <div className="space-y-2">
                  <h3 data-testid="text-chatbot-messages-heading" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Welcome / Raid Messages</h3>
                  <div className="text-sm space-y-1">
                    {aiChatBot.welcomeMessage && <p data-testid="text-chatbot-welcome"><span className="font-medium">Welcome:</span> <span className="text-muted-foreground">{aiChatBot.welcomeMessage}</span></p>}
                    {aiChatBot.raidMessage && <p data-testid="text-chatbot-raid"><span className="font-medium">Raid:</span> <span className="text-muted-foreground">{aiChatBot.raidMessage}</span></p>}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground" data-testid="text-chatbot-empty">Unable to load chatbot config.</p>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-ai-checklist">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Sparkles className="h-4 w-4 text-amber-500" />
            <CardTitle className="text-sm font-medium">AI Stream Checklist</CardTitle>
            <Badge variant="secondary">Auto-running</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {aiChecklistLoading ? (
            <div className="space-y-3" data-testid="skeleton-ai-checklist">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ) : aiChecklist ? (
            <div className="space-y-5">
              {aiChecklist.preStream?.length > 0 && (
                <div className="space-y-2">
                  <h3 data-testid="text-checklist-pre-heading" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Pre-Stream</h3>
                  <div className="space-y-1.5">
                    {aiChecklist.preStream.map((item: any, i: number) => {
                      const key = `pre-${i}`;
                      const label = typeof item === 'string' ? item : item.task || item.item || item.label || JSON.stringify(item);
                      return (
                        <button key={i} data-testid={`checkbox-pre-${i}`} className="flex items-center gap-2 text-sm w-full text-left" onClick={() => toggleCheckItem(key)}>
                          {checkedItems.has(key) ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" /> : <div className="h-4 w-4 rounded-full border border-muted-foreground/30 shrink-0" />}
                          <span className={checkedItems.has(key) ? "line-through text-muted-foreground" : ""}>{label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {aiChecklist.duringStream?.length > 0 && (
                <div className="space-y-2">
                  <h3 data-testid="text-checklist-during-heading" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">During Stream</h3>
                  <div className="space-y-1">
                    {aiChecklist.duringStream.map((item: any, i: number) => (
                      <div key={i} data-testid={`text-during-${i}`} className="flex items-start gap-2 text-sm">
                        <Clock className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                        <span className="text-muted-foreground">{typeof item === 'string' ? item : item.reminder || item.task || item.item || JSON.stringify(item)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {aiChecklist.postStream?.length > 0 && (
                <div className="space-y-2">
                  <h3 data-testid="text-checklist-post-heading" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Post-Stream</h3>
                  <div className="space-y-1.5">
                    {aiChecklist.postStream.map((item: any, i: number) => {
                      const key = `post-${i}`;
                      const label = typeof item === 'string' ? item : item.task || item.item || item.label || JSON.stringify(item);
                      return (
                        <button key={i} data-testid={`checkbox-post-${i}`} className="flex items-center gap-2 text-sm w-full text-left" onClick={() => toggleCheckItem(key)}>
                          {checkedItems.has(key) ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" /> : <div className="h-4 w-4 rounded-full border border-muted-foreground/30 shrink-0" />}
                          <span className={checkedItems.has(key) ? "line-through text-muted-foreground" : ""}>{label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {aiChecklist.emergencyPlan && (
                <div className="space-y-2">
                  <h3 data-testid="text-checklist-emergency-heading" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Emergency Plan</h3>
                  <div className="text-sm text-muted-foreground">
                    {typeof aiChecklist.emergencyPlan === 'string' ? (
                      <p data-testid="text-emergency-plan">{aiChecklist.emergencyPlan}</p>
                    ) : Array.isArray(aiChecklist.emergencyPlan) ? (
                      aiChecklist.emergencyPlan.map((item: any, i: number) => (
                        <p key={i} data-testid={`text-emergency-${i}`}>{typeof item === 'string' ? item : item.step || item.action || JSON.stringify(item)}</p>
                      ))
                    ) : (
                      <p data-testid="text-emergency-plan">{JSON.stringify(aiChecklist.emergencyPlan)}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground" data-testid="text-checklist-empty">Unable to load checklist.</p>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-ai-raid">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Sparkles className="h-4 w-4 text-amber-500" />
            <CardTitle className="text-sm font-medium">AI Raid Strategy</CardTitle>
            <Badge variant="secondary">Auto-running</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {aiRaidLoading ? (
            <div className="space-y-3" data-testid="skeleton-ai-raid">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ) : aiRaid ? (
            <div className="space-y-5">
              {aiRaid.raidTargets?.length > 0 && (
                <div className="space-y-2">
                  <h3 data-testid="text-raid-targets-heading" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Raid Targets</h3>
                  <div className="space-y-1.5">
                    {aiRaid.raidTargets.map((target: any, i: number) => (
                      <div key={i} data-testid={`card-raid-target-${i}`} className="rounded-md border p-2 text-sm space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{target.channel || target.name}</span>
                          {target.audienceOverlap && <Badge variant="secondary" className="text-[10px]">{target.audienceOverlap}</Badge>}
                        </div>
                        {target.reason && <p className="text-xs text-muted-foreground">{target.reason}</p>}
                        {target.bestTiming && <p className="text-xs text-muted-foreground">Best timing: {target.bestTiming}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {aiRaid.etiquetteTips?.length > 0 && (
                <div className="space-y-2">
                  <h3 data-testid="text-raid-etiquette-heading" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Raid Etiquette</h3>
                  <div className="space-y-1">
                    {aiRaid.etiquetteTips.map((tip: any, i: number) => (
                      <p key={i} data-testid={`text-etiquette-${i}`} className="text-sm text-muted-foreground">{typeof tip === 'string' ? tip : tip.tip || JSON.stringify(tip)}</p>
                    ))}
                  </div>
                </div>
              )}
              {aiRaid.networkingStrategy && (
                <div className="space-y-2">
                  <h3 data-testid="text-raid-networking-heading" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Networking Strategy</h3>
                  <div className="text-sm text-muted-foreground">
                    {typeof aiRaid.networkingStrategy === 'string' ? (
                      <p data-testid="text-networking-strategy">{aiRaid.networkingStrategy}</p>
                    ) : Array.isArray(aiRaid.networkingStrategy) ? (
                      aiRaid.networkingStrategy.map((s: any, i: number) => (
                        <p key={i} data-testid={`text-networking-${i}`}>{typeof s === 'string' ? s : s.strategy || JSON.stringify(s)}</p>
                      ))
                    ) : (
                      <p data-testid="text-networking-strategy">{JSON.stringify(aiRaid.networkingStrategy)}</p>
                    )}
                  </div>
                </div>
              )}
              {aiRaid.incomingRaidPlan && (
                <div className="space-y-2">
                  <h3 data-testid="text-raid-incoming-heading" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Incoming Raid Plan</h3>
                  <div className="text-sm text-muted-foreground">
                    {typeof aiRaid.incomingRaidPlan === 'string' ? (
                      <p data-testid="text-incoming-raid">{aiRaid.incomingRaidPlan}</p>
                    ) : Array.isArray(aiRaid.incomingRaidPlan) ? (
                      aiRaid.incomingRaidPlan.map((item: any, i: number) => (
                        <p key={i} data-testid={`text-incoming-raid-${i}`}>{typeof item === 'string' ? item : item.step || item.action || JSON.stringify(item)}</p>
                      ))
                    ) : (
                      <p data-testid="text-incoming-raid">{JSON.stringify(aiRaid.incomingRaidPlan)}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground" data-testid="text-raid-empty">Unable to load raid strategy.</p>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-ai-post-stream">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Sparkles className="h-4 w-4 text-amber-500" />
            <CardTitle className="text-sm font-medium">AI Post-Stream Report</CardTitle>
          </div>
          {pastStreams.length > 0 && !aiPostReport && (
            <Button data-testid="button-generate-report" size="sm" variant="outline" onClick={() => generatePostReport(pastStreams[0])} disabled={aiPostReportLoading}>
              {aiPostReportLoading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
              Generate Report
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {aiPostReportLoading ? (
            <div className="space-y-3" data-testid="skeleton-ai-post-report">
              <Skeleton className="h-6 w-20" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : aiPostReport ? (
            <div className="space-y-5">
              {aiPostReport.grade && (
                <div className="flex items-center gap-3" data-testid="text-report-grade">
                  <span className={`text-3xl font-bold ${aiPostReport.grade === 'A' || aiPostReport.grade === 'A+' ? 'text-emerald-500' : aiPostReport.grade === 'B' || aiPostReport.grade === 'B+' ? 'text-blue-500' : aiPostReport.grade === 'C' || aiPostReport.grade === 'C+' ? 'text-amber-500' : 'text-red-500'}`}>
                    {aiPostReport.grade}
                  </span>
                  <span className="text-sm text-muted-foreground">Stream Grade</span>
                </div>
              )}
              {aiPostReport.summary && (
                <div className="space-y-1">
                  <h3 data-testid="text-report-summary-heading" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Summary</h3>
                  <p data-testid="text-report-summary" className="text-sm">{aiPostReport.summary}</p>
                </div>
              )}
              {aiPostReport.highlights?.length > 0 && (
                <div className="space-y-2">
                  <h3 data-testid="text-report-highlights-heading" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Highlights</h3>
                  <div className="space-y-1">
                    {aiPostReport.highlights.map((h: any, i: number) => (
                      <div key={i} data-testid={`text-highlight-${i}`} className="flex items-start gap-2 text-sm">
                        <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0 text-emerald-500" />
                        <span>{typeof h === 'string' ? h : h.highlight || h.description || JSON.stringify(h)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {aiPostReport.improvements?.length > 0 && (
                <div className="space-y-2">
                  <h3 data-testid="text-report-improvements-heading" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Improvements</h3>
                  <div className="space-y-1">
                    {aiPostReport.improvements.map((imp: any, i: number) => (
                      <div key={i} data-testid={`text-improvement-${i}`} className="flex items-start gap-2 text-sm">
                        <ArrowRight className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                        <span>{typeof imp === 'string' ? imp : imp.improvement || imp.description || JSON.stringify(imp)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {aiPostReport.recommendations?.length > 0 && (
                <div className="space-y-2">
                  <h3 data-testid="text-report-recs-heading" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Recommendations</h3>
                  <div className="space-y-1.5">
                    {aiPostReport.recommendations.map((rec: any, i: number) => (
                      <div key={i} data-testid={`text-recommendation-${i}`} className="flex items-start gap-2 text-sm">
                        <Sparkles className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-500" />
                        <div>
                          <span>{typeof rec === 'string' ? rec : rec.recommendation || rec.description || rec.title || JSON.stringify(rec)}</span>
                          {rec.impact && <Badge variant="secondary" className="ml-1.5 text-[10px]">{rec.impact}</Badge>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {aiPostReport.clipSuggestions?.length > 0 && (
                <div className="space-y-2">
                  <h3 data-testid="text-report-clips-heading" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Clip Suggestions</h3>
                  <div className="space-y-1.5">
                    {aiPostReport.clipSuggestions.map((clip: any, i: number) => (
                      <div key={i} data-testid={`text-clip-${i}`} className="rounded-md border p-2 text-sm">
                        <p className="font-medium">{typeof clip === 'string' ? clip : clip.title || clip.description || JSON.stringify(clip)}</p>
                        {clip.timestamp && <p className="text-xs text-muted-foreground mt-0.5">{clip.timestamp}</p>}
                        {clip.reason && <p className="text-xs text-muted-foreground">{clip.reason}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {aiPostReport.socialRecaps?.length > 0 && (
                <div className="space-y-2">
                  <h3 data-testid="text-report-social-heading" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Social Recaps</h3>
                  <div className="space-y-1.5">
                    {aiPostReport.socialRecaps.map((recap: any, i: number) => (
                      <div key={i} data-testid={`text-social-recap-${i}`} className="rounded-md border p-2 text-sm">
                        {recap.platform && <Badge variant="outline" className="text-[10px] mb-1">{recap.platform}</Badge>}
                        <p className="text-muted-foreground">{typeof recap === 'string' ? recap : recap.text || recap.content || recap.message || JSON.stringify(recap)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : pastStreams.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="text-post-report-empty">No past streams available for reporting.</p>
          ) : (
            <p className="text-sm text-muted-foreground" data-testid="text-post-report-prompt">Click "Generate Report" to analyze your most recent stream: <span className="font-medium">{pastStreams[0]?.title}</span></p>
          )}
        </CardContent>
      </Card>

      <div className="border rounded-md overflow-visible">
        <button
          className="flex items-center gap-2 w-full p-4 text-left"
          onClick={() => setShowStreamAI(!showStreamAI)}
          data-testid="button-toggle-stream-ai"
        >
          <Sparkles className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-semibold">AI Stream Mastery Suite</span>
          <Badge variant="outline" className="text-[10px]">20 tools</Badge>
          {showStreamAI ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showStreamAI && (
          <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(aiStreamTitlesLoading || aiStreamTitles) && (
              <Card data-testid="card-ai-stream-titles">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Stream Titles</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiStreamTitlesLoading ? <Skeleton className="h-24 w-full" /> : aiStreamTitles && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiStreamTitles.titles || aiStreamTitles.suggestions || aiStreamTitles.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiStreamScheduleLoading || aiStreamSchedule) && (
              <Card data-testid="card-ai-stream-schedule">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Stream Schedule</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiStreamScheduleLoading ? <Skeleton className="h-24 w-full" /> : aiStreamSchedule && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiStreamSchedule.schedule || aiStreamSchedule.slots || aiStreamSchedule.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiStreamOverlaysLoading || aiStreamOverlays) && (
              <Card data-testid="card-ai-stream-overlays">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Stream Overlays</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiStreamOverlaysLoading ? <Skeleton className="h-24 w-full" /> : aiStreamOverlays && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiStreamOverlays.overlays || aiStreamOverlays.designs || aiStreamOverlays.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiStreamAlertsLoading || aiStreamAlerts) && (
              <Card data-testid="card-ai-stream-alerts">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Stream Alerts</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiStreamAlertsLoading ? <Skeleton className="h-24 w-full" /> : aiStreamAlerts && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiStreamAlerts.alerts || aiStreamAlerts.designs || aiStreamAlerts.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiStreamModLoading || aiStreamMod) && (
              <Card data-testid="card-ai-stream-mod">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Stream Moderation</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiStreamModLoading ? <Skeleton className="h-24 w-full" /> : aiStreamMod && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiStreamMod.rules || aiStreamMod.policies || aiStreamMod.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiStreamInteractLoading || aiStreamInteract) && (
              <Card data-testid="card-ai-stream-interact">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Stream Interactions</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiStreamInteractLoading ? <Skeleton className="h-24 w-full" /> : aiStreamInteract && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiStreamInteract.interactions || aiStreamInteract.activities || aiStreamInteract.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiStreamRevLoading || aiStreamRev) && (
              <Card data-testid="card-ai-stream-rev">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Stream Revenue</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiStreamRevLoading ? <Skeleton className="h-24 w-full" /> : aiStreamRev && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiStreamRev.strategies || aiStreamRev.tips || aiStreamRev.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiStreamClipsLoading || aiStreamClips) && (
              <Card data-testid="card-ai-stream-clips">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Stream Clips</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiStreamClipsLoading ? <Skeleton className="h-24 w-full" /> : aiStreamClips && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiStreamClips.clips || aiStreamClips.highlights || aiStreamClips.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiStreamCatsLoading || aiStreamCats) && (
              <Card data-testid="card-ai-stream-cats">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Stream Categories</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiStreamCatsLoading ? <Skeleton className="h-24 w-full" /> : aiStreamCats && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiStreamCats.categories || aiStreamCats.suggestions || aiStreamCats.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiStreamPanelsLoading || aiStreamPanels) && (
              <Card data-testid="card-ai-stream-panels">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Stream Panels</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiStreamPanelsLoading ? <Skeleton className="h-24 w-full" /> : aiStreamPanels && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiStreamPanels.panels || aiStreamPanels.designs || aiStreamPanels.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiStreamEmotesLoading || aiStreamEmotes) && (
              <Card data-testid="card-ai-stream-emotes">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Stream Emotes</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiStreamEmotesLoading ? <Skeleton className="h-24 w-full" /> : aiStreamEmotes && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiStreamEmotes.emotes || aiStreamEmotes.concepts || aiStreamEmotes.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiStreamSubGoalsLoading || aiStreamSubGoals) && (
              <Card data-testid="card-ai-stream-sub-goals">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Sub Goals</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiStreamSubGoalsLoading ? <Skeleton className="h-24 w-full" /> : aiStreamSubGoals && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiStreamSubGoals.goals || aiStreamSubGoals.milestones || aiStreamSubGoals.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiStreamNetworkLoading || aiStreamNetwork) && (
              <Card data-testid="card-ai-stream-network">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Networking</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiStreamNetworkLoading ? <Skeleton className="h-24 w-full" /> : aiStreamNetwork && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiStreamNetwork.connections || aiStreamNetwork.tips || aiStreamNetwork.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiStreamAnalyticsExpLoading || aiStreamAnalyticsExp) && (
              <Card data-testid="card-ai-stream-analytics-exp">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Analytics Explainer</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiStreamAnalyticsExpLoading ? <Skeleton className="h-24 w-full" /> : aiStreamAnalyticsExp && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiStreamAnalyticsExp.explanations || aiStreamAnalyticsExp.insights || aiStreamAnalyticsExp.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiMultiStreamLoading || aiMultiStream) && (
              <Card data-testid="card-ai-multi-stream">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Multi-Stream</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiMultiStreamLoading ? <Skeleton className="h-24 w-full" /> : aiMultiStream && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiMultiStream.setup || aiMultiStream.platforms || aiMultiStream.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiStreamBackupLoading || aiStreamBackup) && (
              <Card data-testid="card-ai-stream-backup">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Stream Backup</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiStreamBackupLoading ? <Skeleton className="h-24 w-full" /> : aiStreamBackup && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiStreamBackup.plans || aiStreamBackup.steps || aiStreamBackup.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiStreamCommunityLoading || aiStreamCommunity) && (
              <Card data-testid="card-ai-stream-community">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Community Builder</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiStreamCommunityLoading ? <Skeleton className="h-24 w-full" /> : aiStreamCommunity && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiStreamCommunity.strategies || aiStreamCommunity.tips || aiStreamCommunity.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiStreamBrandingLoading || aiStreamBranding) && (
              <Card data-testid="card-ai-stream-branding">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Stream Branding</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiStreamBrandingLoading ? <Skeleton className="h-24 w-full" /> : aiStreamBranding && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiStreamBranding.kit || aiStreamBranding.elements || aiStreamBranding.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiStreamCalendarLoading || aiStreamCalendar) && (
              <Card data-testid="card-ai-stream-calendar">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Content Calendar</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiStreamCalendarLoading ? <Skeleton className="h-24 w-full" /> : aiStreamCalendar && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiStreamCalendar.calendar || aiStreamCalendar.schedule || aiStreamCalendar.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiStreamGrowthLoading || aiStreamGrowth) && (
              <Card data-testid="card-ai-stream-growth">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">AI Stream Growth</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiStreamGrowthLoading ? <Skeleton className="h-24 w-full" /> : aiStreamGrowth && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiStreamGrowth.hacks || aiStreamGrowth.strategies || aiStreamGrowth.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>

      {liveStream && <LiveBanner stream={liveStream} onEnd={() => endStream.mutate(liveStream.id)} isEnding={endStream.isPending} />}

      <MultiPlatformStatus channels={connectedChannels} destinations={destinations} />

      {plannedStreams.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">Ready to Go Live</h2>
          {plannedStreams.map(stream => (
            <Card key={stream.id} data-testid={`card-planned-stream-${stream.id}`}>
              <CardContent className="p-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p data-testid={`text-stream-title-${stream.id}`} className="text-sm font-medium">{stream.title}</p>
                  <div className="flex items-center gap-1 mt-1 flex-wrap">
                    {((stream.platforms as string[]) || []).map(p => (
                      <Badge key={p} variant="outline" className="text-[10px]">{PLATFORM_INFO[p as Platform]?.label || p}</Badge>
                    ))}
                  </div>
                </div>
                <Button data-testid={`button-go-live-${stream.id}`} size="sm" variant="destructive" onClick={() => goLive.mutate(stream.id)} disabled={goLive.isPending || !!liveStream} className="shrink-0">
                  {goLive.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Play className="h-3.5 w-3.5 mr-1.5" />}Go Live
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Destinations ({destinations.filter(d => d.enabled).length} active)</h2>
        {destinations.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Radio className="w-10 h-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">No destinations configured yet.</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <div className="divide-y divide-border/50">
              {destinations.map((dest) => (
                <div key={dest.id} data-testid={`card-destination-${dest.id}`} className="p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div style={{ color: PLATFORM_INFO[dest.platform as Platform]?.color || "#888" }}>
                      <PlatformIcon platform={dest.platform} className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p data-testid={`text-dest-label-${dest.id}`} className="text-sm font-medium truncate">{dest.label}</p>
                      <p className="text-xs text-muted-foreground">{dest.streamKey ? 'Key configured' : 'No key'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Switch data-testid={`switch-dest-${dest.id}`} checked={dest.enabled ?? true} onCheckedChange={(checked) => toggleDest.mutate({ id: dest.id, enabled: checked })} />
                    <Button data-testid={`button-delete-dest-${dest.id}`} size="icon" variant="ghost" onClick={() => deleteDest.mutate(dest.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      {pastStreams.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">Past Streams</h2>
          {pastStreams.map(stream => (
            <Card key={stream.id} data-testid={`card-stream-${stream.id}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p data-testid={`text-stream-title-${stream.id}`} className="text-sm font-medium">{stream.title}</p>
                      <Badge variant="secondary" className="text-xs capitalize">{stream.status}</Badge>
                    </div>
                    <div className="flex items-center gap-1 mt-1 flex-wrap">
                      {((stream.platforms as string[]) || []).map(p => (
                        <Badge key={p} variant="outline" className="text-[10px]">{PLATFORM_INFO[p as Platform]?.label || p}</Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button data-testid={`button-optimize-stream-${stream.id}`} size="sm" variant="outline" onClick={() => optimizeSeo.mutate(stream.id)} disabled={optimizeSeo.isPending}>
                      <Sparkles className="h-3 w-3 mr-1" />SEO
                    </Button>
                    <Button data-testid={`button-thumbnail-stream-${stream.id}`} size="sm" variant="outline" onClick={() => generateThumbnail.mutate({ streamId: stream.id, title: stream.title, description: stream.description || undefined })} disabled={generateThumbnail.isPending}>
                      <Image className="h-3 w-3 mr-1" />Thumb
                    </Button>
                    {stream.status === 'ended' && (
                      <Button data-testid={`button-postprocess-stream-${stream.id}`} size="sm" onClick={() => postProcess.mutate(stream.id)} disabled={postProcess.isPending}>
                        <ArrowRight className="h-3 w-3 mr-1" />Process
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!streamsLoading && streamList.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Zap className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No streams yet. Create one to get started.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function MultiPlatformStatus({ channels, destinations }: { channels: Channel[]; destinations: StreamDestination[] }) {
  const platformStatuses = new Map<string, { hasChannel: boolean; hasDestination: boolean; destEnabled: boolean }>();

  channels.forEach((ch) => {
    const existing = platformStatuses.get(ch.platform) || { hasChannel: false, hasDestination: false, destEnabled: false };
    existing.hasChannel = true;
    platformStatuses.set(ch.platform, existing);
  });

  destinations.forEach((dest) => {
    const existing = platformStatuses.get(dest.platform) || { hasChannel: false, hasDestination: false, destEnabled: false };
    existing.hasDestination = true;
    if (dest.enabled) existing.destEnabled = true;
    platformStatuses.set(dest.platform, existing);
  });

  const entries = Array.from(platformStatuses.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  if (entries.length === 0) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground">Multi-Platform Status</h2>
      <Card>
        <div className="divide-y divide-border/50">
          {entries.map(([platform, status]) => {
            const info = PLATFORM_INFO[platform as Platform];
            const ready = status.hasDestination && status.destEnabled;
            return (
              <div key={platform} data-testid={`platform-status-${platform}`} className="p-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div style={{ color: info?.color || "#888" }}>
                    <PlatformIcon platform={platform} className="h-4 w-4" />
                  </div>
                  <span className="text-sm font-medium">{info?.label || platform}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {status.hasChannel && (
                    <Badge variant="secondary" className="text-xs">Channel</Badge>
                  )}
                  {status.hasDestination && (
                    <Badge variant={status.destEnabled ? "default" : "outline"} className="text-xs">
                      {status.destEnabled ? "RTMP Ready" : "RTMP Disabled"}
                    </Badge>
                  )}
                  {ready ? (
                    <Wifi className="h-4 w-4 text-emerald-500" data-testid={`icon-ready-${platform}`} />
                  ) : (
                    <WifiOff className="h-4 w-4 text-muted-foreground" data-testid={`icon-not-ready-${platform}`} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function LiveBanner({ stream, onEnd, isEnding }: { stream: Stream; onEnd: () => void; isEnding: boolean }) {
  const [elapsed, setElapsed] = useState("");

  const { data: automationData } = useQuery<{ jobs: any[]; tasks: any[] }>({
    queryKey: ["/api/streams", stream.id, "automation"],
    queryFn: async () => { const res = await fetch(`/api/streams/${stream.id}/automation`, { credentials: 'include' }); return res.json(); },
    refetchInterval: 3000,
  });

  useEffect(() => {
    if (!stream.startedAt) return;
    const update = () => {
      const diff = Math.floor((Date.now() - new Date(stream.startedAt!).getTime()) / 1000);
      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;
      setElapsed(`${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [stream.startedAt]);

  const tasks = automationData?.tasks || [];

  return (
    <Card className="border-red-500/50" data-testid="card-live-stream">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse shrink-0" />
            <div className="min-w-0">
              <p data-testid="text-live-stream-title" className="text-sm font-bold">{stream.title}</p>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="text-xs text-red-400 font-medium">LIVE</span>
                {elapsed && <span className="text-xs text-muted-foreground font-mono">{elapsed}</span>}
              </div>
            </div>
          </div>
          <Button data-testid="button-end-stream" size="sm" variant="destructive" onClick={onEnd} disabled={isEnding}>
            {isEnding ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Square className="h-3.5 w-3.5 mr-1.5" />}End
          </Button>
        </div>
        {tasks.length > 0 && (
          <div className="flex items-center gap-3 flex-wrap text-xs">
            {tasks.map((task: any, i: number) => (
              <div key={i} data-testid={`task-status-${task.name}`} className="flex items-center gap-1.5">
                {task.status === 'completed' ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> :
                 task.status === 'failed' ? <XCircle className="h-3.5 w-3.5 text-red-400" /> :
                 task.status === 'running' ? <Loader2 className="h-3.5 w-3.5 text-blue-400 animate-spin" /> :
                 <Clock className="h-3.5 w-3.5 text-muted-foreground" />}
                <span className="text-muted-foreground">{task.name?.replace(/_/g, ' ')}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
