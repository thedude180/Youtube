import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Radio, Plus, Trash2, Zap, Sparkles, Loader2, Globe, Image, Play, Square, CheckCircle2, XCircle, Clock, ArrowRight } from "lucide-react";
import { SiYoutube, SiTwitch, SiKick, SiFacebook, SiTiktok, SiX, SiLinkedin, SiInstagram } from "react-icons/si";
import { PLATFORM_INFO, type Platform, PLATFORMS } from "@shared/schema";
import type { StreamDestination, Stream } from "@shared/schema";

const platformIcons: Record<string, any> = {
  youtube: SiYoutube, twitch: SiTwitch, kick: SiKick, facebook: SiFacebook,
  tiktok: SiTiktok, x: SiX, linkedin: SiLinkedin, instagram: SiInstagram, rumble: Globe,
};

function PlatformIcon({ platform, className = "h-4 w-4" }: { platform: string; className?: string }) {
  const Icon = platformIcons[platform] || Globe;
  return <Icon className={className} />;
}

export default function StreamCenter() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showAddDest, setShowAddDest] = useState(false);
  const [showNewStream, setShowNewStream] = useState(false);
  const [newDest, setNewDest] = useState({ platform: "youtube", label: "", rtmpUrl: "", streamKey: "" });
  const [newStream, setNewStream] = useState({ title: "", description: "", category: "Gaming", platforms: [] as string[] });

  const { data: destinations = [] } = useQuery<StreamDestination[]>({ queryKey: ["/api/stream-destinations"] });
  const { data: streamList = [], isLoading: streamsLoading } = useQuery<Stream[]>({ queryKey: ["/api/streams"] });

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

  const toggleStreamPlatform = (platform: string) => {
    setNewStream(prev => ({
      ...prev,
      platforms: prev.platforms.includes(platform) ? prev.platforms.filter(p => p !== platform) : [...prev.platforms, platform],
    }));
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

      {liveStream && <LiveBanner stream={liveStream} onEnd={() => endStream.mutate(liveStream.id)} isEnding={endStream.isPending} />}

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
